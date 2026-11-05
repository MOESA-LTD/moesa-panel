<script setup lang="ts">
import { boxById, type DashboardBoxId } from '@/constants/dashboard';

/** The boxes hidden in edit mode; a click puts one back at the end of the dashboard. */
defineProps<{ ids: DashboardBoxId[] }>();
const emit = defineEmits<{ unhide: [DashboardBoxId] }>();
</script>

<template>
   <section
      class="rounded-xl border border-dashed border-surface-300 dark:border-surface-600 p-4 flex flex-col gap-3"
   >
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
         <span class="font-semibold" v-text="$t('dashboard.layout.hidden_title')" />
         <span class="text-sm text-muted-color" v-text="$t('dashboard.layout.hidden_hint')" />
      </div>
      <span
         v-if="!ids.length"
         class="text-muted-color"
         v-text="$t('dashboard.layout.hidden_empty')"
      />
      <div v-else class="flex flex-wrap gap-2">
         <Button
            v-for="id in ids"
            :key="id"
            :icon="boxById(id).icon"
            :label="$t(boxById(id).title)"
            variant="outlined"
            severity="secondary"
            size="small"
            @click="emit('unhide', id)"
         />
      </div>
   </section>
</template>
