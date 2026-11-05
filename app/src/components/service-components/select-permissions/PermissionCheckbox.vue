<script setup lang="ts">
export type PermissionState = 'all' | 'some' | 'none';

defineOptions({ inheritAttrs: false });

defineProps<{
   /** Names the permissions the box covers, e.g. `all`, `kind:read`, `group:product:read`. */
   scope?: string;
   state: PermissionState;
   readonly?: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
   <span class="inline-flex items-center" :data-permission-cell="scope">
      <!-- A partial box selects the rest on click; a full one clears; see SelectPermissions. -->
      <Checkbox
         v-bind="$attrs"
         binary
         :model-value="state === 'all'"
         :indeterminate="state === 'some'"
         :readonly
         @update:model-value="emit('toggle')"
      />
      <span class="sr-only">{{ $t(`component.select_permission.state.${state}`) }}</span>
   </span>
</template>
