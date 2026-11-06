<script setup lang="ts">
import { glossaryKey, type GlossaryEnum } from '@/api/glossary';
import { stripTerms } from '@/constants/terms';

/**
 * A select over the values of an enum, each labelled by its translation `<i18nPrefix>.<value>`
 * (the value itself without a prefix, e.g. process codes). With `glossary`, every option that has
 * glossary copy also shows its description under the label, and the selected value gets an info icon.
 */
const props = defineProps<{
   values: readonly string[];
   i18nPrefix?: string;
   glossary?: GlossaryEnum;
   multiple?: boolean;
}>();
const model = defineModel<string | string[] | null>();

const { t, te } = useI18n();
const options = computed(() =>
   props.values.map((value) => {
      const label = props.i18nPrefix ? t(`${props.i18nPrefix}.${value}`) : value;
      const key = props.glossary ? glossaryKey(props.glossary, value) : undefined;
      return key && te(key) ? { value, label, description: stripTerms(t(key)) } : { value, label };
   })
);
const optionOf = (value: unknown) => options.value.find((o) => o.value === value);
</script>
<template>
   <MultiSelect
      v-if="multiple"
      v-model="model"
      :options
      option-value="value"
      option-label="label"
      display="chip"
   >
      <template #option="{ option }">
         <div>
            <div>{{ option.label }}</div>
            <small v-if="option.description" class="block text-muted-color">{{
               option.description
            }}</small>
         </div>
      </template>
   </MultiSelect>
   <Select v-else v-model="model" :options option-value="value" option-label="label">
      <template #value="{ value, placeholder }">
         <template v-if="value != null && value !== ''">
            <span>{{ optionOf(value)?.label ?? value }}</span>
            <i
               v-if="optionOf(value)?.description"
               data-test="glossary-info"
               class="pi pi-info-circle ms-2"
               v-tooltip.top="optionOf(value)?.description"
               :aria-label="optionOf(value)?.description"
               role="img"
            />
         </template>
         <!-- A non-breaking space keeps the row's height when there is no value and no placeholder. -->
         <span v-else :class="{ 'p-placeholder': placeholder }">{{ placeholder || ' ' }}</span>
      </template>
      <template #option="{ option }">
         <div>
            <div>{{ option.label }}</div>
            <small v-if="option.description" class="block text-muted-color">{{
               option.description
            }}</small>
         </div>
      </template>
   </Select>
</template>
