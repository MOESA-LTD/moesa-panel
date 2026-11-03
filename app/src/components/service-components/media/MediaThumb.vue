<script setup lang="ts">
import { mediaKind } from '@/api/media';
import { useSignedUrl } from '@/api/media/signedUrls';

// A file's picture: the signed image at `path`, else an icon of its kind (an image without a path
// or not signed yet shows the image icon).
const props = withDefaults(
   defineProps<{
      path: string | null;
      mimeType?: string | null;
      alt?: string | null;
      /** Width and height in px. */
      size?: number;
   }>(),
   { mimeType: null, alt: null, size: 48 }
);

const url = useSignedUrl(() => props.path);

const icon = computed(() => {
   const kind = props.mimeType ? mediaKind(props.mimeType) : 'image';
   return kind === 'pdf'
      ? PrimeIcons.FILE_PDF
      : kind === 'video'
        ? PrimeIcons.VIDEO
        : PrimeIcons.IMAGE;
});
</script>

<template>
   <span
      class="flex shrink-0 items-center justify-center overflow-hidden rounded bg-surface-100 dark:bg-surface-800"
      :style="{ width: `${size}px`, height: `${size}px` }"
   >
      <img
         v-if="url"
         :src="url"
         :alt="alt ?? ''"
         class="h-full w-full object-cover"
         loading="lazy"
      />
      <i
         v-else
         :class="icon"
         class="text-surface-500"
         :style="{ fontSize: `${Math.round(size / 3)}px` }"
         aria-hidden="true"
      />
   </span>
</template>
