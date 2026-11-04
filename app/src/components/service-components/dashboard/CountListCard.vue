<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

export type CountListItem = {
   label: string;
   meta?: string;
   to: RouteLocationRaw;
   /** Runs before the row navigates to `to` (e.g. to set a filter the target page reads). */
   onSelect?: () => void;
};

/** A dashboard box: how many there are, and the first few of them, each linking to its record. */
const props = withDefaults(
   defineProps<{
      title: string;
      count: number;
      items: CountListItem[];
      icon: string;
      severity?: 'danger' | 'warn' | 'info' | 'success' | 'secondary';
      emptyText?: string;
      /** Whether the box shows "None" instead of its rows; by default when the count is zero. */
      empty?: boolean;
   }>(),
   { severity: 'secondary', emptyText: undefined, empty: undefined }
);

const isEmpty = computed(() => props.empty ?? props.count === 0);

const MAX_ROWS = 8;

const shown = computed(() => props.items.slice(0, MAX_ROWS));

const select = (item: CountListItem, navigate: () => unknown) => {
   item.onSelect?.();
   navigate();
};
</script>

<template>
   <Card>
      <template #title>
         <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2">
               <i :class="icon" />
               {{ title }}
            </span>
            <Tag :value="String(count)" :severity="severity" rounded />
         </div>
      </template>
      <template #content>
         <span
            v-if="isEmpty"
            class="block text-muted-color"
            v-text="emptyText ?? $t('dashboard.ops.none')"
         />
         <ul v-else class="p-0 m-0 list-none flex flex-col">
            <li v-for="(item, index) in shown" :key="index" class="py-1">
               <CustomLink :to="item.to" v-slot="{ navigate }">
                  <button
                     type="button"
                     class="w-full flex items-baseline justify-between gap-4 text-left cursor-pointer hover:text-primary"
                     @click="select(item, navigate)"
                  >
                     <span class="truncate" v-text="item.label" />
                     <span
                        v-if="item.meta"
                        class="shrink-0 text-muted-color text-sm"
                        v-text="item.meta"
                     />
                  </button>
               </CustomLink>
            </li>
         </ul>
      </template>
   </Card>
</template>
