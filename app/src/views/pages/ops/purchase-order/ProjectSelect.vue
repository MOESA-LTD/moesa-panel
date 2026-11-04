<script setup lang="ts">
import { useLookup } from '@/api/useLookup';

/** Picks one of the customer's projects for an order (an order stays inside its customer). */
type ProjectOption = Pick<Tables['project']['Row'], 'id' | 'code' | 'display_name'>;

const props = defineProps<{ customerId?: string | null }>();
const model = defineModel<string | null>();

const { data: projects } = useLookup<ProjectOption>(
   'project',
   () => ({
      select: 'id, code, display_name',
      order: 'code',
      in: { column: 'customer_id', values: [props.customerId] }
   }),
   () => !!props.customerId
);

const options = computed(() =>
   (projects.value ?? []).map((project) => ({
      value: project.id,
      label: `${project.code} — ${project.display_name}`
   }))
);
</script>

<template>
   <Select
      v-model="model"
      :options
      option-value="value"
      option-label="label"
      filter
      showClear
      :placeholder="$t('ops.project.select')"
   />
</template>
