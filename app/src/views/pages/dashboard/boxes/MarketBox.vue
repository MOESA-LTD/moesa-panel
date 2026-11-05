<script setup lang="ts">
import { useDashboardMarket } from '@/api/dashboard';
import DashboardBox from '@/components/service-components/dashboard/DashboardBox.vue';
import type { BoxSize, DashboardBoxDef } from '@/constants/dashboard';
import { useCustomerFilter } from '@/store/customerFilter';
import { useBoxView } from './useBoxView';
import { marketView } from './views';

const props = defineProps<{ box: DashboardBoxDef; size: BoxSize }>();

const view = useBoxView(props.box, useDashboardMarket, marketView(useCustomerFilter().set));
</script>

<template>
   <DashboardBox :box :size v-bind="view" />
</template>
