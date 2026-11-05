<script setup lang="ts">
import type { BoxSize, DashboardBoxDef } from '@/constants/dashboard';
import { PrimeIcons } from '@primevue/core/api';
import type { MenuItem } from 'primevue/menuitem';
import { useI18n } from 'vue-i18n';

/** The edit-mode controls above a dashboard box: drag handle, size, hide and the move menu. */
const props = defineProps<{ box: DashboardBoxDef; size: BoxSize; first: boolean; last: boolean }>();
const emit = defineEmits<{ hide: []; 'update:size': [BoxSize]; move: [-1 | 1] }>();

const { t } = useI18n();
const menu = ref<{ toggle: (event: Event) => void } | null>(null);
const menuId = useId();
const menuOpen = ref(false);
// Each control names its box, so a screen reader tabbing through the boxes can tell them apart.
const label = (key: string) => t(key, { box: t(props.box.title) });

const sizes = computed(() => [
   { value: 'narrow', label: t('dashboard.layout.size_narrow') },
   { value: 'wide', label: t('dashboard.layout.size_wide') }
]);

const model = computed<MenuItem[]>(() => [
   {
      label: t('dashboard.layout.move_left'),
      icon: PrimeIcons.ARROW_LEFT,
      disabled: props.first,
      command: () => emit('move', -1)
   },
   {
      label: t('dashboard.layout.move_right'),
      icon: PrimeIcons.ARROW_RIGHT,
      disabled: props.last,
      command: () => emit('move', 1)
   }
]);
</script>

<template>
   <div class="flex items-center gap-2 mb-2">
      <button
         type="button"
         class="dashboard-drag-handle cursor-grab p-2 rounded-lg text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800"
         :aria-label="label('dashboard.layout.drag_box')"
         :title="$t('dashboard.layout.drag')"
      >
         <i :class="PrimeIcons.BARS" />
      </button>
      <SelectButton
         size="small"
         :model-value="size"
         :options="sizes"
         option-label="label"
         option-value="value"
         :allow-empty="false"
         :aria-label="label('dashboard.layout.size_box')"
         @update:model-value="(s: BoxSize) => emit('update:size', s)"
      />
      <span class="ms-auto flex items-center gap-1">
         <Button
            :icon="PrimeIcons.EYE_SLASH"
            text
            rounded
            severity="secondary"
            size="small"
            :aria-label="label('dashboard.layout.hide_box')"
            :title="$t('dashboard.layout.hide')"
            @click="emit('hide')"
         />
         <Button
            :icon="PrimeIcons.ELLIPSIS_V"
            text
            rounded
            severity="secondary"
            size="small"
            aria-haspopup="true"
            :aria-expanded="menuOpen"
            :aria-controls="menuId"
            :aria-label="label('dashboard.layout.menu_box')"
            @click="(event: Event) => menu?.toggle(event)"
         />
         <Menu
            :id="menuId"
            ref="menu"
            popup
            append-to="self"
            :model="model"
            @show="menuOpen = true"
            @hide="menuOpen = false"
         />
      </span>
   </div>
</template>
