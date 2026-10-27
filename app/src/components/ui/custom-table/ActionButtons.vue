<script setup lang="ts">
import type { CustomTableRowAction } from './types';
import { computed, defineProps } from 'vue';

const props = defineProps<{
   body: object;
   items?: CustomTableRowAction[];
}>();

const getSeverity = (item: CustomTableRowAction): string => {
   switch (item?.icon) {
      case PrimeIcons.TRASH:
         return 'danger';
      case PrimeIcons.PENCIL:
         return 'info';
      default:
         return '';
   }
};

const buttons = computed(() => {
   return props.items
      ? props.items.map((item) => {
           const pairs = _toPairs(item);
           const transformedPairs = pairs.map(([key, value]) => [
              key,
              typeof value === 'function' ? value(props.body) : value
           ]);
           return _fromPairs(transformedPairs);
        })
      : [];
});
</script>

<template>
   <div class="custom_table__action_buttons">
      <Button
         v-for="(item, index) in buttons"
         :key="_uniqueId('actionButton' + index)"
         size="small"
         @click="item.command"
         v-tooltip.left="item.label"
         :severity="getSeverity(item)"
         v-bind="item"
         label=""
      />
   </div>
</template>

<style lang="scss">
.custom_table {
   &__action_buttons {
      @apply flex gap-2 items-center min-w-fit;
   }
}
</style>
