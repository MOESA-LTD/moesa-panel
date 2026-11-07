<script setup lang="ts">
import type { Attributes, PropertySchema, ProvidedSource } from '@edge-shared/listingCompleteness';
import i18n from '@plugins/i18n';
import {
   clearLanguage,
   contentOf,
   controlFor,
   entryCount,
   entryProperties,
   isLanguageTagged,
   productSourceOf,
   readValue,
   valueKey,
   writeValue,
   type Entry
} from './amazonForm';
import AmazonImageSlot from './AmazonImageSlot.vue';

// One attribute of the Amazon form, in the control its schema calls for. Every edit goes through
// writeValue: the entries of the other languages stay as they are. An attribute that takes several
// entries (e.g. five bullet points) shows the filled ones and one empty slot, up to its maximum.
// An attribute derived from the product card shows the product's value read-only, with its source,
// until it is overridden for the listing (a value of its own in this language, which wins).
const props = defineProps<{
   name: string;
   property: PropertySchema;
   modelValue: Attributes;
   languageTag: string;
   badge: 'required' | 'conditional' | 'optional';
   readonly?: boolean;
   /**
    * Where the attribute is provided from: the server on publish (e.g. the identifier from the
    * GTIN), or a product card column (`derived` holds the value it gives).
    */
   source?: ProvidedSource | null;
   /** The value derived from the product card, in this language. */
   derived?: unknown[] | null;
   /** The product, whose card a derived attribute links to. */
   productId?: string | null;
   /** The media library the image slots offer: the product's customer and tenant. */
   customerId?: string | null;
   tenantId?: string | null;
   /** Changes when the form's values are replaced (reset, reload), dropping unsaved local text. */
   resetKey?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [attributes: Attributes] }>();

const BADGE_SEVERITY = { required: 'danger', conditional: 'warn', optional: 'secondary' } as const;

const control = computed(() => controlFor(props.name, props.property));
const key = computed(() => valueKey(props.property) ?? 'value');
const parts = computed(() => entryProperties(props.property));
const field = computed(() => parts.value[key.value] ?? {});
const languageTagged = computed(() => isLanguageTagged(props.property));

const options = (values: unknown[] | undefined, names: string[] | undefined) =>
   (values ?? []).map((value, index) => ({ value, label: names?.[index] ?? String(value) }));
const valueOptions = computed(() => options(field.value.enum, field.value.enumNames));
const unitOptions = computed(() => options(parts.value.unit?.enum, parts.value.unit?.enumNames));

// --- derived from the product card ---
const productSource = computed(() =>
   props.derived?.length ? productSourceOf(props.source) : null
);
/** The product card tab the source column is on. */
const productLink = computed(() =>
   productSource.value && props.productId
      ? { name: productSource.value.route, params: { id: props.productId } }
      : null
);
/** "Product card › <the column's label>". */
const sourceText = computed(() =>
   productSource.value
      ? i18n.t('ops.amazon.tab.derived.source', {
           field: i18n.t(`ops.product.fields.${productSource.value.column}`)
        })
      : ''
);
/** The listing's own value in this language: it wins over the product's. */
const overridden = computed(() => entryCount(props.modelValue, props.name, props.languageTag) > 0);
/** Override was asked for here: the field stays editable even while emptied. */
const overriding = ref(false);
/** The product's value is shown, read-only. */
const showsDerived = computed(
   () => !!productSource.value && !overridden.value && !overriding.value
);
const shown = computed(() =>
   showsDerived.value ? { [props.name]: props.derived ?? [] } : props.modelValue
);
const locked = computed(() => props.readonly || showsDerived.value);

/** Starts the listing's own value from the product's. */
const override = () => {
   overriding.value = true;
   let next = props.modelValue;
   (props.derived ?? []).forEach((entry, index) => {
      next = writeValue(next, props.name, contentOf(entry as Entry), {
         languageTag: props.languageTag,
         languageTagged: languageTagged.value,
         index
      });
   });
   emit('update:modelValue', next);
};
/** Drops the listing's own value in this language: the product's applies again. */
const useProductValue = () => {
   overriding.value = false;
   emit('update:modelValue', clearLanguage(props.modelValue, props.name, props.languageTag));
};

/** The slots shown: the language's entries plus an empty one while the maximum allows. */
const slots = computed(() => {
   const filled = entryCount(shown.value, props.name, props.languageTag);
   const max = Math.max(1, props.property.maxItems ?? 1);
   const shownCount = locked.value ? Math.max(filled, 1) : Math.min(max, filled + 1);
   return Array.from({ length: shownCount }, (_, index) => index);
});

const entryAt = (index: number): Entry | undefined =>
   readValue(shown.value, props.name, { languageTag: props.languageTag, index });
const valueAt = (index: number) => entryAt(index)?.[key.value];

const write = (index: number, value: unknown) => {
   const next = writeValue(props.modelValue, props.name, value, {
      languageTag: props.languageTag,
      languageTagged: languageTagged.value,
      index
   });
   emit('update:modelValue', next);
};

/** A unique input id per entry: the label points at the first one. */
const slotId = (id: string, index: number) => (index === 0 ? id : `${id}-${index}`);
const writeKey = (index: number, value: unknown) => write(index, { [key.value]: value });

// A measure's unit is kept here until its value is entered: a lone unit is no entry.
const pickedUnits = ref<Record<number, unknown>>({});
const unitAt = (index: number) =>
   entryAt(index)?.unit ?? pickedUnits.value[index] ?? unitOptions.value[0]?.value ?? null;
const writeMeasure = (index: number, value: unknown, unit: unknown) => {
   pickedUnits.value[index] = unit;
   write(index, { [key.value]: value, unit });
};

// JSON text is kept while it does not parse; it is written once it is an object.
const jsonTexts = ref<Record<number, string>>({});
const jsonErrors = ref<Record<number, boolean>>({});
const clearLocal = () => {
   jsonTexts.value = {};
   jsonErrors.value = {};
   pickedUnits.value = {};
   overriding.value = false;
};
// Local text and units belong to what was shown: a language switch or a form reset drops them.
watch(() => [props.languageTag, props.resetKey], clearLocal);
const jsonAt = (index: number) => {
   if (index in jsonTexts.value) return jsonTexts.value[index];
   const content = contentOf(entryAt(index));
   return Object.keys(content).length ? JSON.stringify(content, null, 2) : '';
};
const writeJson = (index: number, text: string | undefined) => {
   jsonTexts.value[index] = text ?? '';
   if (!text?.trim()) {
      jsonErrors.value[index] = false;
      write(index, null);
      return;
   }
   try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw parsed;
      jsonErrors.value[index] = false;
      write(index, parsed);
   } catch {
      jsonErrors.value[index] = true;
   }
};
const jsonError = computed(() =>
   Object.values(jsonErrors.value).some(Boolean) ? i18n.t('ops.amazon.tab.json_invalid') : undefined
);

/** The media_location of an image slot's entry, or null. */
const locationAt = (index: number) => {
   const value = valueAt(index);
   return typeof value === 'string' ? value : null;
};
</script>

<template>
   <div :data-field="name" class="flex flex-col">
      <FormField
         fluid
         :label="property.title ?? name"
         :error="jsonError"
         :readonly
         v-slot="slotProps"
      >
         <div class="flex w-full flex-col gap-2">
            <template v-for="index in slots" :key="index">
               <InputText
                  v-if="control === 'text'"
                  :id="slotId(slotProps.id, index)"
                  :modelValue="(valueAt(index) as string | undefined) ?? ''"
                  :maxlength="field.maxLength"
                  :disabled="locked"
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <Textarea
                  v-else-if="control === 'textarea'"
                  :id="slotId(slotProps.id, index)"
                  :modelValue="(valueAt(index) as string | undefined) ?? ''"
                  :maxlength="field.maxLength"
                  :disabled="locked"
                  rows="4"
                  autoResize
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <InputNumber
                  v-else-if="control === 'number'"
                  :inputId="slotId(slotProps.id, index)"
                  :modelValue="(valueAt(index) as number | undefined) ?? null"
                  :min="field.minimum"
                  :max="field.maximum"
                  :maxFractionDigits="field.type === 'integer' ? 0 : 6"
                  :useGrouping="false"
                  :disabled="locked"
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <Select
                  v-else-if="control === 'select'"
                  :inputId="slotId(slotProps.id, index)"
                  :modelValue="valueAt(index) ?? null"
                  :options="valueOptions"
                  optionLabel="label"
                  optionValue="value"
                  :disabled="locked"
                  showClear
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <span v-else-if="control === 'boolean'" class="flex items-center gap-2">
                  <ToggleSwitch
                     :inputId="slotId(slotProps.id, index)"
                     :modelValue="valueAt(index) === true"
                     :disabled="locked"
                     @update:modelValue="writeKey(index, $event)"
                  />
                  <!-- Unset differs from "no": a set answer can be taken back. -->
                  <Button
                     v-if="!locked && valueAt(index) !== undefined"
                     data-action="boolean-clear"
                     variant="text"
                     severity="secondary"
                     size="small"
                     :icon="PrimeIcons.TIMES"
                     :title="$t('ops.amazon.tab.value_clear')"
                     :aria-label="$t('ops.amazon.tab.value_clear')"
                     @click="write(index, null)"
                  />
               </span>
               <div v-else-if="control === 'measure'" class="flex gap-2">
                  <InputNumber
                     :inputId="slotId(slotProps.id, index)"
                     :modelValue="(valueAt(index) as number | undefined) ?? null"
                     :min="field.minimum"
                     :maxFractionDigits="field.type === 'integer' ? 0 : 6"
                     :useGrouping="false"
                     :disabled="locked"
                     class="flex-1"
                     @update:modelValue="writeMeasure(index, $event, unitAt(index))"
                  />
                  <Select
                     :modelValue="unitAt(index)"
                     :options="unitOptions"
                     optionLabel="label"
                     optionValue="value"
                     :disabled="locked"
                     :aria-label="parts.unit?.title"
                     @update:modelValue="writeMeasure(index, valueAt(index) ?? null, $event)"
                  />
               </div>
               <AmazonImageSlot
                  v-else-if="control === 'image'"
                  :location="locationAt(index)"
                  :inputId="slotId(slotProps.id, index)"
                  :readonly="locked"
                  :customerId
                  :tenantId
                  @pick="writeKey(index, `media:${$event}`)"
                  @clear="write(index, null)"
               />
               <Textarea
                  v-else
                  :id="slotId(slotProps.id, index)"
                  :modelValue="jsonAt(index)"
                  :invalid="!!jsonErrors[index]"
                  :disabled="locked"
                  rows="4"
                  autoResize
                  fluid
                  class="font-mono text-sm"
                  @update:modelValue="writeJson(index, $event)"
               />
            </template>
         </div>
      </FormField>
      <span class="flex flex-wrap items-center gap-2 px-2 text-sm text-surface-500">
         <Tag
            :data-badge="badge"
            :severity="BADGE_SEVERITY[badge]"
            :value="$t(`ops.amazon.tab.badge.${badge}`)"
         />
         <span v-if="source === 'server'" v-text="$t('ops.amazon.tab.provided')" />
         <template v-if="productSource">
            <Tag data-derived severity="info" :value="$t('ops.amazon.tab.derived.badge')" />
            <RouterLink
               v-if="productLink"
               data-derived-source
               :to="productLink"
               target="_blank"
               rel="noopener"
            >
               {{ sourceText }}
            </RouterLink>
            <span v-else data-derived-source v-text="sourceText" />
            <template v-if="!readonly">
               <Button
                  v-if="showsDerived"
                  data-action="derived-override"
                  variant="link"
                  size="small"
                  class="!p-0"
                  :label="$t('ops.amazon.tab.derived.override')"
                  @click="override"
               />
               <Button
                  v-else
                  data-action="derived-reset"
                  variant="link"
                  size="small"
                  class="!p-0"
                  :label="$t('ops.amazon.tab.derived.use_product')"
                  @click="useProductValue"
               />
            </template>
         </template>
         <span v-if="property.description" v-text="property.description" />
      </span>
   </div>
</template>
