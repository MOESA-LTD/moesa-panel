<script setup>
import { useDialogRef } from '@/composables/useDialogRef';
const { routes } = useLayout();
const menuRoute = computed(() => routes.value.find((item) => item.route?.name == 'branch'));
const dialogRef = useDialogRef();
</script>
<template>
   <div class="card p-0 flex flex-col gap-4">
      <RouteMenuBar v-if="dialogRef || $route.name === menuRoute.name" :route="menuRoute" />
      <CustomRouteView class="flex-1" />
   </div>
</template>
