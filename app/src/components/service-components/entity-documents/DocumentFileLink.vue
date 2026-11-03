<script setup lang="ts">
import { downloadMediaFile } from '@/api/media/signedUrls';
import { appErrorHandler } from '@/lib/appErrorHandler';

// A document list's file cell: its uploaded file (downloaded under its name) and its Drive link,
// whichever it has.
const props = defineProps<{
   url?: string | null;
   media?: { storage_path: string; file_name: string } | null;
}>();

const download = () => {
   if (props.media)
      downloadMediaFile(props.media.storage_path, props.media.file_name).catch(appErrorHandler);
};
</script>

<template>
   <span class="flex items-center gap-3">
      <a
         v-if="media"
         href="#"
         data-action="download"
         :title="`${$t('ops.media.download')}: ${media.file_name}`"
         :aria-label="`${$t('ops.media.download')}: ${media.file_name}`"
         @click.prevent="download"
      >
         <i :class="PrimeIcons.FILE" />
      </a>
      <a
         v-if="url"
         :href="url"
         target="_blank"
         rel="noopener"
         :title="$t('ops.document.open_link')"
         :aria-label="$t('ops.document.open_link')"
      >
         <i :class="PrimeIcons.EXTERNAL_LINK" />
      </a>
   </span>
</template>
