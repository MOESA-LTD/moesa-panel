<script setup lang="ts">
import { useDashboardPurchaseOrders } from '@/api/dashboard';
import DashboardBox from '@/components/service-components/dashboard/DashboardBox.vue';
import type { BoxSize, DashboardBoxDef } from '@/constants/dashboard';
import { useBoxView } from './useBoxView';
import { ordersView } from './views';

const props = defineProps<{ box: DashboardBoxDef; size: BoxSize }>();

const view = useBoxView(props.box, useDashboardPurchaseOrders, ordersView);
</script>

<template>
   <DashboardBox :box :size v-bind="view" />
</template>
