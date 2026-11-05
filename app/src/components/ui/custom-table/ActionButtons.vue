<script setup lang="ts">
import type { CustomTableRowAction } from './types';
import { computed, defineProps } from 'vue';

const props = defineProps<{
   body: object;
   items?: CustomTableRowAction[];
}>();

const getSeverity = (item: { icon?: unknown }): string => {
   switch (item?.icon) {
      case PrimeIcons.TRASH:
         return 'danger';
      case PrimeIcons.PENCIL:
         return 'info';
      default:
         return '';
   }
};

const authStore = useAuthStore();

type RowButton = {
   command?: (event: Event) => void;
   label?: string;
   icon?: string;
   disabled?: boolean;
   tooltip?: string;
   [key: string]: unknown;
};

const buttons = computed<RowButton[]>(() => {
   const row = (props.body as { data?: { tenant_id?: string | null } }).data;
   // Loading skeleton rows carry no data: row callbacks cannot run, so the buttons stay disabled.
   if (row == null) {
      return (props.items ?? []).map(({ icon, label }) => ({
         icon: typeof icon === 'string' ? icon : undefined,
         label: typeof label === 'string' ? label : undefined,
         disabled: true
      }));
   }
   return props.items
      ? props.items.map(({ requires, ...item }) => {
           const pairs = _toPairs(item);
           const transformedPairs = pairs.map(([key, value]) => [
              key,
              typeof value === 'function' ? value(props.body) : value
           ]);
           const button: RowButton = _fromPairs(transformedPairs);
           const allowed =
              !requires || authStore.canIn(row?.tenant_id, requires.action, requires.subject);
           return { ...button, disabled: !!button.disabled || !allowed };
        })
      : [];
});
</script>

<template>
   <div class="custom_table__action_buttons">
      <template
         v-for="({ tooltip, ...item }, index) in buttons"
         :key="_uniqueId('actionButton' + index)"
      >
         <span v-if="tooltip" v-tooltip.left="tooltip" class="inline-flex" data-row-action-tooltip>
            <Button
               size="small"
               @click="item.command"
               :severity="getSeverity(item)"
               v-bind="item"
               :aria-label="tooltip"
               label=""
            />
         </span>
         <Button
            v-else
            size="small"
            @click="item.command"
            v-tooltip.left="item.label"
            :severity="getSeverity(item)"
            v-bind="item"
            label=""
         />
      </template>
   </div>
</template>

<style lang="scss">
.custom_table {
   &__action_buttons {
      @apply flex gap-2 items-center min-w-fit;
   }
}
</style>
