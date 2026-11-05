<script setup lang="ts">
import {
   DASHBOARD_AREA_CLASSES,
   DASHBOARD_EDITING,
   ROW_LIMIT,
   type BoxSize,
   type DashboardBoxDef,
   type DashboardRow
} from '@/constants/dashboard';
import { useGuideStore } from '@/store/guide';

/** A dashboard box in the dense-list look: area-coloured header, its first rows and its links. */
const props = withDefaults(
   defineProps<{
      box: DashboardBoxDef;
      size: BoxSize;
      count: number;
      rows?: DashboardRow[];
      /** Whether the box shows "None" instead of its rows; by default when the count is zero. */
      empty?: boolean;
   }>(),
   { rows: () => [], empty: undefined }
);

/** Custom content in place of the row list; it gets the size's row limit and the edit state. */
defineSlots<{ default?: (props: { limit: number; editing: boolean }) => unknown }>();

const editing = inject(DASHBOARD_EDITING, ref(false));

const area = computed(() => DASHBOARD_AREA_CLASSES[props.box.area]);
const limit = computed(() => ROW_LIMIT[props.size]);
const isEmpty = computed(() => props.empty ?? props.count === 0);
const shown = computed(() => props.rows.slice(0, limit.value));

// The store is reached on click only, so the box needs no pinia until its guide link is used.
const openGuide = () => useGuideStore().show('dashboard', props.box.guideTask);

const select = (row: DashboardRow, navigate: () => unknown) => {
   row.onSelect?.();
   navigate();
};
</script>

<template>
   <div class="rounded-xl shadow-md bg-surface-0 dark:bg-surface-900 p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2">
         <span
            data-test="box-icon"
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            :class="area.icon"
         >
            <i :class="box.icon" />
         </span>
         <span class="font-semibold" v-text="$t(box.title)" />
         <span
            data-test="box-badge"
            class="ms-auto rounded-full px-2 text-sm font-semibold"
            :class="area.badge"
            v-text="count"
         />
      </div>
      <div class="flex flex-col gap-3 grow" :class="{ 'pointer-events-none select-none': editing }">
         <span v-if="isEmpty" class="block text-muted-color" v-text="$t('dashboard.ops.none')" />
         <slot v-else-if="$slots.default" :limit="limit" :editing="editing" />
         <ul v-else class="p-0 m-0 list-none flex flex-col gap-2">
            <li
               v-for="(row, index) in shown"
               :key="index"
               class="rounded-lg bg-surface-50 dark:bg-surface-800 px-3 py-2"
            >
               <div v-if="editing" aria-disabled="true" class="flex items-center gap-2 min-w-0">
                  <span class="font-semibold shrink-0" v-text="row.code" />
                  <span v-if="row.context" class="text-muted-color truncate" v-text="row.context" />
                  <Tag
                     v-if="row.tag"
                     :value="row.tag"
                     :severity="row.urgent ? 'danger' : 'secondary'"
                     class="!text-xs ms-auto shrink-0"
                  />
               </div>
               <CustomLink v-else :to="row.to" v-slot="{ navigate }">
                  <button
                     type="button"
                     class="w-full flex items-center gap-2 min-w-0 text-left cursor-pointer hover:text-primary"
                     @click="select(row, navigate)"
                  >
                     <span class="font-semibold shrink-0" v-text="row.code" />
                     <span
                        v-if="row.context"
                        class="text-muted-color truncate"
                        v-text="row.context"
                     />
                     <Tag
                        v-if="row.tag"
                        :value="row.tag"
                        :severity="row.urgent ? 'danger' : 'secondary'"
                        class="!text-xs ms-auto shrink-0"
                     />
                  </button>
               </CustomLink>
            </li>
         </ul>
         <div v-if="box.guideTask || box.to" class="flex items-center justify-between mt-auto">
            <Button
               v-if="box.guideTask"
               :label="$t('guide.panel.close_card')"
               :icon="PrimeIcons.QUESTION_CIRCLE"
               :disabled="editing"
               text
               size="small"
               class="!px-0"
               @click="openGuide"
            />
            <span v-else />
            <template v-if="box.to">
               <Button
                  v-if="editing"
                  text
                  size="small"
                  disabled
                  :label="$t('dashboard.layout.open_all')"
                  :icon="PrimeIcons.ARROW_RIGHT"
                  icon-pos="right"
               />
               <CustomLink v-else :to="box.to" v-slot="{ navigate }">
                  <Button
                     text
                     size="small"
                     :label="$t('dashboard.layout.open_all')"
                     :icon="PrimeIcons.ARROW_RIGHT"
                     icon-pos="right"
                     @click="navigate"
                  />
               </CustomLink>
            </template>
         </div>
      </div>
   </div>
</template>
