<script setup>
import { useDialogRef } from '@/composables/useDialogRef';
import { useMenuSection } from '@/router/menu';
const menuRoute = useMenuSection('ops');
const dialogRef = useDialogRef();
</script>
<template>
   <div class="card p-0 flex flex-col gap-4">
      <RouteMenuBar v-if="dialogRef || $route.name === menuRoute.name" :route="menuRoute" />
      <CustomRouteView class="flex-1" />
   </div>
</template>
