<script setup>
const { t, te } = useI18n();
const operations = computed(() => [
   { value: 'INSERT', label: t('audit_log.add'), severity: 'success' },
   { value: 'UPDATE', label: t('audit_log.update'), severity: 'info' },
   { value: 'DELETE', label: t('audit_log.delete'), severity: 'danger' }
   // { value: 'SELECT', label: t('audit_log.read'), severity: 'secondary' }
]);
</script>

<template>
   <MultiSelect
      :filter="true"
      :options="operations"
      option-label="label"
      option-value="value"
      :placeholder="$t('audit_log.select_operation')"
   >
      <template #value="{ value }">
         <Tag
            v-for="operation in operations.filter((o) => value?.includes?.(o.value))"
            v-bind="operation"
            :value="operation?.label || operation.value"
            :key="operation"
         />
      </template>
      <template #option="{ option: operation }">
         <Tag v-bind="operation" :value="operation?.label || operation.value" :key="operation" />
      </template>
   </MultiSelect>
</template>
