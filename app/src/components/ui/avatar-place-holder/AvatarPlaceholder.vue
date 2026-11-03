<script setup>
import { findPalette, PRIMARY_COLORS, SURFACES } from '@/lib/theme/palettes';

const props = defineProps({
   src: {
      type: String
   },
   placeholder: {
      type: String,
      required: true
   },
   size: {
      type: [String, Number],
      default: '100%'
   },
   backgroundColor: {
      type: String,
      default: null
   },
   textColor: {
      type: String,
      default: null
   }
});

const theme = useThemeStore();

const firstLetters = computed(() => {
   const words = props.placeholder?.split?.(' ');
   if (words?.length >= 2) {
      return words
         ?.slice?.(0, 2)
         ?.map?.((word) => word.charAt?.(0).toUpperCase?.())
         ?.join?.('');
   } else {
      return words?.join?.('').slice?.(0, 2).toUpperCase?.();
   }
});

const bg = computed(
   () => props.backgroundColor || findPalette(PRIMARY_COLORS, theme.profile.primary)?.['500']
);
const color = computed(
   () =>
      props.textColor ||
      findPalette(SURFACES, theme.profile.surface)?.[theme.isDark ? '700' : '200']
);
const label = computed(() => firstLetters.value || '♥');
</script>

<template>
   <Image class="avatar_placeholder">
      <template #image="slotProps">
         <img v-if="src" :src :alt="placeholder" v-bind="slotProps" />
         <svg
            v-else
            :width="size"
            :height="size"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            v-bind="slotProps"
            class="avatar_placeholder__image"
         >
            <rect width="100%" height="100%" :fill="bg" />
            <text
               x="50%"
               y="50%"
               dominant-baseline="middle"
               text-anchor="middle"
               :fill="color"
               font-size="40"
               class="avatar_placeholder__label"
            >
               {{ label }}
            </text>
         </svg>
      </template>
      <template #original="slotProps">
         <img v-if="src" :src :alt="placeholder" v-bind="slotProps" />
         <svg
            v-else
            :width="size"
            :height="size"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            v-bind="slotProps"
            class="avatar_placeholder__image"
         >
            <rect width="100%" height="100%" :fill="bg" />
            <text
               x="50%"
               y="50%"
               dominant-baseline="middle"
               text-anchor="middle"
               :fill="color"
               font-size="40"
               class="avatar_placeholder__label"
            >
               {{ label }}
            </text>
         </svg>
      </template>
   </Image>
</template>

<style lang="scss">
.avatar_placeholder {
   &__image {
      @apply w-full h-full;
   }

   &__label {
      @apply font-bold first-letter:uppercase;
   }
}
</style>
