<script setup lang="ts">
import { mediaResource, thumbPath, type MediaRow } from '@/api/media';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';
import type { Attributes, PropertySchema } from '@edge-shared/listingCompleteness';
import i18n from '@plugins/i18n';
import {
   contentOf,
   controlFor,
   entryCount,
   entryProperties,
   isLanguageTagged,
   readValue,
   valueKey,
   writeValue,
   type Entry
} from './amazonForm';

// One attribute of the Amazon form, in the control its schema calls for. Every edit goes through
// writeValue: the entries of the other languages stay as they are. An attribute that takes several
// entries (e.g. five bullet points) shows the filled ones and one empty slot, up to its maximum.
const props = defineProps<{
   name: string;
   property: PropertySchema;
   modelValue: Attributes;
   languageTag: string;
   badge: 'required' | 'conditional' | 'optional';
   readonly?: boolean;
   /** Filled by the server on publish (e.g. the identifier from the GTIN). */
   provided?: boolean;
   /** The media library the image slots offer: the product's customer and tenant. */
   customerId?: string | null;
   tenantId?: string | null;
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

/** The slots shown: the language's entries plus an empty one while the maximum allows. */
const slots = computed(() => {
   const filled = entryCount(props.modelValue, props.name, props.languageTag);
   const max = Math.max(1, props.property.maxItems ?? 1);
   const shown = props.readonly ? Math.max(filled, 1) : Math.min(max, filled + 1);
   return Array.from({ length: shown }, (_, index) => index);
});

const entryAt = (index: number): Entry | undefined =>
   readValue(props.modelValue, props.name, { languageTag: props.languageTag, index });
const valueAt = (index: number) => entryAt(index)?.[key.value];

const write = (index: number, value: unknown) =>
   emit(
      'update:modelValue',
      writeValue(props.modelValue, props.name, value, {
         languageTag: props.languageTag,
         languageTagged: languageTagged.value,
         index
      })
   );
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
watch(
   () => props.languageTag,
   () => {
      jsonTexts.value = {};
      jsonErrors.value = {};
      pickedUnits.value = {};
   }
);
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

// An image slot holds one library file as `media:<id>`; the server copies it to a public URL.
const MEDIA_PREFIX = 'media:';
const location = computed(() => {
   const value = valueAt(0);
   return typeof value === 'string' ? value : null;
});
const mediaId = computed(() =>
   location.value?.startsWith(MEDIA_PREFIX) ? location.value.slice(MEDIA_PREFIX.length) : null
);
const { data: media } = mediaResource.useOne(() =>
   control.value === 'image' ? mediaId.value : null
);
const pickerOpen = ref(false);
const onPicked = (rows: { id: string | null }[]) => {
   const id = rows[0]?.id;
   if (id) writeKey(0, `${MEDIA_PREFIX}${id}`);
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
                  :id="index === 0 ? slotProps.id : undefined"
                  :modelValue="(valueAt(index) as string | undefined) ?? ''"
                  :maxlength="field.maxLength"
                  :disabled="readonly"
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <Textarea
                  v-else-if="control === 'textarea'"
                  :id="index === 0 ? slotProps.id : undefined"
                  :modelValue="(valueAt(index) as string | undefined) ?? ''"
                  :maxlength="field.maxLength"
                  :disabled="readonly"
                  rows="4"
                  autoResize
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <InputNumber
                  v-else-if="control === 'number'"
                  :inputId="index === 0 ? slotProps.id : undefined"
                  :modelValue="(valueAt(index) as number | undefined) ?? null"
                  :min="field.minimum"
                  :max="field.maximum"
                  :maxFractionDigits="field.type === 'integer' ? 0 : 6"
                  :useGrouping="false"
                  :disabled="readonly"
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <Select
                  v-else-if="control === 'select'"
                  :inputId="index === 0 ? slotProps.id : undefined"
                  :modelValue="valueAt(index) ?? null"
                  :options="valueOptions"
                  optionLabel="label"
                  optionValue="value"
                  :disabled="readonly"
                  showClear
                  fluid
                  @update:modelValue="writeKey(index, $event)"
               />
               <ToggleSwitch
                  v-else-if="control === 'boolean'"
                  :inputId="index === 0 ? slotProps.id : undefined"
                  :modelValue="valueAt(index) === true"
                  :disabled="readonly"
                  @update:modelValue="writeKey(index, $event)"
               />
               <div v-else-if="control === 'measure'" class="flex gap-2">
                  <InputNumber
                     :inputId="index === 0 ? slotProps.id : undefined"
                     :modelValue="(valueAt(index) as number | undefined) ?? null"
                     :min="field.minimum"
                     :maxFractionDigits="field.type === 'integer' ? 0 : 6"
                     :useGrouping="false"
                     :disabled="readonly"
                     class="flex-1"
                     @update:modelValue="writeMeasure(index, $event, unitAt(index))"
                  />
                  <Select
                     :modelValue="unitAt(index)"
                     :options="unitOptions"
                     optionLabel="label"
                     optionValue="value"
                     :disabled="readonly"
                     :aria-label="parts.unit?.title"
                     @update:modelValue="writeMeasure(index, valueAt(index) ?? null, $event)"
                  />
               </div>
               <div v-else-if="control === 'image'" class="flex items-center gap-3">
                  <MediaThumb
                     :path="media ? thumbPath(media as MediaRow) : null"
                     :mimeType="media?.mime_type ?? null"
                     :alt="media?.file_name ?? null"
                     :size="64"
                  />
                  <span
                     class="min-w-0 flex-1 truncate text-sm"
                     :title="location ?? undefined"
                     v-text="media?.file_name ?? location ?? ''"
                  />
                  <template v-if="!readonly">
                     <Button
                        :id="slotProps.id"
                        data-action="image-pick"
                        variant="outlined"
                        size="small"
                        :icon="PrimeIcons.IMAGES"
                        :label="$t('ops.amazon.tab.image_pick')"
                        @click="pickerOpen = true"
                     />
                     <Button
                        v-if="location"
                        data-action="image-clear"
                        variant="text"
                        severity="secondary"
                        size="small"
                        :icon="PrimeIcons.TIMES"
                        :title="$t('ops.amazon.tab.image_clear')"
                        :aria-label="$t('ops.amazon.tab.image_clear')"
                        @click="write(0, null)"
                     />
                  </template>
               </div>
               <Textarea
                  v-else
                  :id="index === 0 ? slotProps.id : undefined"
                  :modelValue="jsonAt(index)"
                  :invalid="!!jsonErrors[index]"
                  :disabled="readonly"
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
         <span v-if="provided" v-text="$t('ops.amazon.tab.provided')" />
         <span v-if="property.description" v-text="property.description" />
      </span>
      <MediaPickerDialog
         v-if="control === 'image' && !readonly"
         v-model:visible="pickerOpen"
         :customerId="customerId ?? null"
         :tenantId="tenantId ?? null"
         :multiple="false"
         :kinds="['image']"
         @picked="onPicked"
      />
   </div>
</template>
