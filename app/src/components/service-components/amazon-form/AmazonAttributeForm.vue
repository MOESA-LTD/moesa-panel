<script setup lang="ts">
import {
   AMAZON_LANGUAGE_TAGS,
   amazonSchemaOf,
   type AmazonIssue,
   type Definition
} from '@/api/amazon';
import {
   completeness,
   groupMissingCounts,
   missingAttributes,
   requiredAttributes,
   type Attributes
} from '@edge-shared/listingCompleteness';
import AmazonAttributeField from './AmazonAttributeField.vue';
import { badgeFor, baseAttribute, groupOf, missingInFormOrder } from './amazonForm';

// The Amazon content of a product against its product type schema (layout B): the schema's
// property groups with their missing counts on the left, the selected group's fields on the right.
// One language is edited at a time; completeness is counted for the definition's marketplace in
// that language. Amazon's issue messages are shown verbatim and lead to their field.
const props = defineProps<{
   definition: Definition;
   modelValue: Attributes;
   languageTag: string;
   /** Attributes the server fills on publish; they count as filled. */
   provided: string[];
   readonly?: boolean;
   /** Amazon's issues of the latest submission. */
   issues?: AmazonIssue[];
   /** The media library the image slots offer. */
   customerId?: string | null;
   tenantId?: string | null;
   /** An attribute to open (its group) and focus once shown, e.g. from a link. */
   focusField?: string | null;
   /** Changes when the values are replaced from outside (reset, reload): fields drop local text. */
   resetKey?: number;
}>();
const emit = defineEmits<{
   'update:modelValue': [attributes: Attributes];
   'update:languageTag': [languageTag: string];
}>();

const schema = computed(() => amazonSchemaOf(props.definition));
// The groups in Amazon's order (an array, 046), and each by its key.
const groups = computed(() => props.definition.property_groups);
const groupKeys = computed(() => groups.value.map(({ key }) => key));
const groupByKey = computed(() => new Map(groups.value.map((group) => [group.key, group])));

const optionsFor = (languageTag: string) => ({
   marketplaceId: props.definition.marketplace_id,
   languageTag,
   provided: props.provided
});

const required = computed(() => requiredAttributes(schema.value, props.modelValue));
const missingFor = (languageTag: string) =>
   missingAttributes(schema.value, groups.value, props.modelValue, optionsFor(languageTag));
const missing = computed(() => missingInFormOrder(missingFor(props.languageTag), groups.value));
const missingCounts = computed(() => groupMissingCounts(missing.value, groups.value));
const progress = computed(() =>
   completeness(schema.value, props.modelValue, optionsFor(props.languageTag))
);
const percent = computed(() =>
   progress.value.required
      ? Math.round((progress.value.filled / progress.value.required) * 100)
      : 100
);

/** Each language with the count of required fields still missing in it. */
const languages = computed(() =>
   AMAZON_LANGUAGE_TAGS.map((tag) => ({ tag, missing: missingFor(tag).length }))
);

const selectedGroup = ref(
   (props.focusField && groupOf(groups.value, baseAttribute(props.focusField))) ||
      groupKeys.value[0] ||
      null
);
watch(groupKeys, (keys) => {
   if (!selectedGroup.value || !keys.includes(selectedGroup.value))
      selectedGroup.value = keys[0] ?? null;
});

/** The selected group's attributes that the schema has and does not hide. */
const fields = computed(() =>
   (selectedGroup.value
      ? (groupByKey.value.get(selectedGroup.value)?.propertyNames ?? [])
      : []
   ).flatMap((name) => {
      const property = schema.value.properties[name];
      return property && !property.hidden ? [{ name, property }] : [];
   })
);

const root = ref<HTMLElement | null>(null);
const FOCUSABLE =
   'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Opens the attribute's group and focuses its first input. */
const jumpTo = async (attribute: string) => {
   const name = baseAttribute(attribute);
   const group = groupOf(groups.value, name);
   if (!group) return;
   selectedGroup.value = group;
   lastJumped.value = name;
   await nextTick();
   const field = root.value?.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`);
   field?.scrollIntoView?.({ block: 'center' });
   field?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
};

// "Next missing" walks the missing fields in form order, starting after the last one it opened.
const lastJumped = ref<string | null>(null);
const nextMissing = () => {
   const list = missing.value;
   if (!list.length) return;
   const at = list.findIndex(({ attribute }) => attribute === lastJumped.value);
   void jumpTo(list[(at + 1) % list.length]!.attribute);
};

onMounted(() => {
   if (props.focusField) void jumpTo(props.focusField);
});
watch(
   () => props.focusField,
   (field) => field && void jumpTo(field)
);

/** The attribute an issue leads to, when the form shows it. */
const issueTarget = (issue: AmazonIssue) => {
   const name = issue.attributeNames[0];
   if (!name) return null;
   const base = baseAttribute(name);
   return groupOf(groups.value, base) ? base : null;
};
/** The issues with the field each leads to (and its title), worked out once per issue. */
const issueRows = computed(() =>
   (props.issues ?? []).map((issue) => {
      const target = issueTarget(issue);
      return {
         issue,
         target,
         title: target ? (schema.value.properties[target]?.title ?? target) : null
      };
   })
);
const ISSUE_SEVERITY = {
   ERROR: 'error',
   WARNING: 'warn',
   INFO: 'info',
   unknown: 'secondary'
} as const;
</script>

<template>
   <div ref="root" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-4">
         <label class="flex flex-col gap-1">
            <span class="font-medium" v-text="$t('ops.amazon.tab.language')" />
            <Select
               :modelValue="languageTag"
               :options="languages"
               optionLabel="tag"
               optionValue="tag"
               class="min-w-40"
               data-language
               @update:modelValue="emit('update:languageTag', $event)"
            >
               <template #option="{ option }">
                  <span class="flex w-full items-center justify-between gap-2">
                     <span v-text="option.tag" />
                     <Badge
                        v-if="option.missing"
                        :data-language-missing="option.tag"
                        severity="warn"
                        :value="option.missing"
                     />
                  </span>
               </template>
            </Select>
         </label>
         <div data-completeness class="flex min-w-60 flex-1 flex-col gap-1">
            <span
               class="text-sm"
               v-text="
                  $t('ops.amazon.tab.completeness', {
                     filled: progress.filled,
                     total: progress.required
                  })
               "
            />
            <ProgressBar :value="percent" class="!h-5">
               {{ progress.filled }} / {{ progress.required }}
            </ProgressBar>
         </div>
         <Button
            data-action="next-missing"
            variant="outlined"
            :icon="PrimeIcons.ARROW_RIGHT"
            iconPos="right"
            :label="$t('ops.amazon.tab.next_missing')"
            :disabled="!missing.length"
            @click="nextMissing"
         />
      </div>

      <ul v-if="issueRows.length" class="flex flex-col gap-2">
         <li
            v-for="({ issue, target, title }, index) in issueRows"
            :key="`${issue.code}-${index}`"
            data-issue
         >
            <Message :severity="ISSUE_SEVERITY[issue.severity]" size="small">
               <span class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs" v-text="issue.code" />
                  <span v-text="issue.message" />
                  <Button
                     v-if="target"
                     data-issue-link
                     variant="link"
                     size="small"
                     class="!p-0"
                     :label="$t('ops.amazon.tab.issue_link', { field: title })"
                     @click="jumpTo(target)"
                  />
               </span>
            </Message>
         </li>
      </ul>

      <div class="grid gap-4 md:grid-cols-[16rem_1fr]">
         <nav :aria-label="$t('ops.amazon.tab.groups')">
            <ul class="flex flex-col gap-1">
               <li v-for="key in groupKeys" :key>
                  <button
                     type="button"
                     :data-group="key"
                     :aria-current="selectedGroup === key ? 'true' : undefined"
                     class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-800"
                     :class="{
                        'bg-primary-50 font-semibold text-primary dark:bg-surface-800':
                           selectedGroup === key
                     }"
                     @click="selectedGroup = key"
                  >
                     <span v-text="groupByKey.get(key)!.title" />
                     <Badge
                        v-if="missingCounts[key]"
                        data-missing
                        severity="warn"
                        :value="missingCounts[key]"
                     />
                  </button>
               </li>
            </ul>
         </nav>
         <section class="flex flex-col gap-2">
            <AmazonAttributeField
               v-for="{ name, property } in fields"
               :key="name"
               :name
               :property
               :modelValue
               :languageTag
               :badge="badgeFor(name, required)"
               :provided="provided.includes(name)"
               :readonly
               :customerId
               :tenantId
               :resetKey
               @update:modelValue="emit('update:modelValue', $event)"
            />
         </section>
      </div>
   </div>
</template>
