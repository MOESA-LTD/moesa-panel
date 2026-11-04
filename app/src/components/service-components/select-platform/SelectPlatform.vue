<script setup lang="ts">
import { usePlatformOptions } from '@/api/customer';

/** Picks a marketplace (public.platform, the same for every tenant) by id. */
defineProps<{
   /** Offers to clear the pick, e.g. as a filter where no platform means every platform. */
   showClear?: boolean;
}>();
const model = defineModel<string | null>();

const { data: platforms } = usePlatformOptions();
</script>
<template>
   <Select
      v-model="model"
      :options="platforms ?? []"
      option-value="id"
      option-label="display_name"
      filter
      :showClear
      :placeholder="$t('ops.customer.platform.select')"
   />
</template>
