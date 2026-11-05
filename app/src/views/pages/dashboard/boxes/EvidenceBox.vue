<script setup lang="ts">
import { useDashboardEvidence } from '@/api/dashboard';
import DashboardBox from '@/components/service-components/dashboard/DashboardBox.vue';
import type { BoxSize, DashboardBoxDef } from '@/constants/dashboard';
import { useCustomerFilter } from '@/store/customerFilter';
import { useBoxView } from './useBoxView';
import { evidenceView } from './views';

const props = defineProps<{ box: DashboardBoxDef; size: BoxSize }>();

const view = useBoxView(props.box, useDashboardEvidence, evidenceView(useCustomerFilter().set));
</script>

<template>
   <DashboardBox :box :size v-bind="view" />
</template>
