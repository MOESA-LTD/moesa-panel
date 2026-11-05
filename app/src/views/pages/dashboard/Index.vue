<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { DASHBOARD_BOXES } from '@/constants/dashboard';

const dialogRef = useDialogRef();
</script>

<template>
   <div
      class="bg-[var(--surface-ground)] flex flex-col gap-4"
      :class="{
         'p-4': !!dialogRef
      }"
   >
      <div class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
         <template v-for="box in DASHBOARD_BOXES" :key="box.id">
            <div v-if="$can('read', box.permission)" :data-box-id="box.id">
               <component :is="box.component" :box :size="box.size" />
            </div>
         </template>
      </div>
   </div>
</template>
