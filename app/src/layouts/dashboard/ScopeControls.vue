<script setup lang="ts">
import BranchPicker from '@/components/service-components/branch-picker/BranchPicker.vue';
import CustomerFilter from '@/components/service-components/customer-filter/CustomerFilter.vue';
import { useCustomerFilter } from '@/store/customerFilter';
import { useCustomerOptions } from '@/store/customerFilter/useCustomerOptions';
import { useAbility } from '@casl/vue';

// The branch picker and the customer filter: inline in the topbar, stacked in the mobile drawer.
defineProps<{ layout: 'row' | 'column' }>();

const { isSignedIn } = storeToRefs(useAuthStore());
const ability = useAbility();
const showCustomerFilter = computed(() => isSignedIn.value && ability.can('read', 'customer'));
const customerFilter = useCustomerFilter();
const { data: customers } = useCustomerOptions(showCustomerFilter);
</script>

<template>
   <div
      v-if="isSignedIn"
      class="items-center gap-2"
      :class="layout === 'column' ? 'flex flex-col items-stretch' : 'flex flex-row'"
   >
      <BranchPicker :class="{ 'w-full': layout === 'column' }" />
      <CustomerFilter
         v-if="showCustomerFilter"
         :class="{ 'w-full': layout === 'column' }"
         :model-value="customerFilter.customerId"
         @update:model-value="customerFilter.set"
         :options="customers ?? []"
      />
   </div>
</template>
