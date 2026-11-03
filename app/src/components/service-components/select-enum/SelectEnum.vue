<script setup lang="ts">
/** A select over the values of an enum, each labelled by its translation `<i18nPrefix>.<value>`. */
const props = defineProps<{ values: readonly string[]; i18nPrefix: string }>();
const model = defineModel<string | null>();

const { t } = useI18n();
const options = computed(() =>
   props.values.map((value) => ({ value, label: t(`${props.i18nPrefix}.${value}`) }))
);
</script>
<template>
   <Select v-model="model" :options option-value="value" option-label="label" />
</template>
