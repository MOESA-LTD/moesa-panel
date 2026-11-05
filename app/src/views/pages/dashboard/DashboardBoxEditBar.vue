<script setup lang="ts">
import { boxMoves, type BoxSize, type DashboardBoxDef } from '@/constants/dashboard';
import { isRtlLocale } from '@/lib/theme/direction';
import { PrimeIcons } from '@primevue/core/api';
import type { MenuItem } from 'primevue/menuitem';
import { useI18n } from 'vue-i18n';

/** The edit-mode controls above a dashboard box: drag handle, size, hide and the move menu. */
const props = defineProps<{ box: DashboardBoxDef; size: BoxSize; first: boolean; last: boolean }>();
const emit = defineEmits<{ hide: []; 'update:size': [BoxSize]; move: [-1 | 1] }>();

const { t, locale } = useI18n();
const menu = ref<{ toggle: (event: Event) => void } | null>(null);
const menuId = useId();
const menuOpen = ref(false);
// Each control names its box, so a screen reader tabbing through the boxes can tell them apart.
const label = (key: string) => t(key, { box: t(props.box.title) });

const sizes = computed(() => [
   { value: 'narrow', label: t('dashboard.layout.size_narrow') },
   { value: 'wide', label: t('dashboard.layout.size_wide') }
]);

// "Left" moves toward the visual left: earlier in the order, later in a right-to-left locale.
const model = computed<MenuItem[]>(() =>
   boxMoves(isRtlLocale(locale.value)).map(({ label, icon, step }) => ({
      label: t(label),
      icon,
      disabled: step === -1 ? props.first : props.last,
      command: () => emit('move', step)
   }))
);
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
