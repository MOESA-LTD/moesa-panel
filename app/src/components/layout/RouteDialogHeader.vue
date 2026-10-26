<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { usePrimeVue } from 'primevue/config';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const primevue = usePrimeVue();
const root = ref<HTMLElement | null>(null);

// Escape closes the dialog that has focus, through the same guarded path as the button.
useEventListener(
   () => root.value?.closest<HTMLElement>('.p-dialog'),
   'keydown',
   (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      emit('close');
   }
);
</script>

<template>
   <div ref="root" class="flex items-center justify-between gap-4 w-full">
      <span class="p-dialog-title first-letter:uppercase" v-text="title" />
      <Button
         :icon="PrimeIcons.TIMES"
         severity="secondary"
         rounded
         text
         :aria-label="primevue.config.locale?.aria?.close"
         @click="emit('close')"
      />
   </div>
</template>
