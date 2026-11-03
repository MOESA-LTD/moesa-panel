<script setup lang="ts">
import { mediaResource } from '@/api/media';
import { useFormTenant } from '@/api/formTenant';
import { openMediaFile } from '@/api/media/signedUrls';
import { appErrorHandler } from '@/lib/appErrorHandler';
import MediaDropzone from '@/components/service-components/media/MediaDropzone.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import { useAuthStore } from '@/store/auth';

// A document's file: uploaded here or picked from the media library, for every document type
// (spec M19). The files offered are the document's customer's and the shared ones (shared only
// when the record has no customer), in the document's tenant.
const props = withDefaults(defineProps<{ customerId?: string | null; readonly?: boolean }>(), {
   customerId: null,
   readonly: false
});
const mediaId = defineModel<string | null>('mediaId', { default: null });

const tenantId = useFormTenant();
// Uploading creates a file, picking reads the library, both in the document's tenant.
const authStore = useAuthStore();
const canUpload = computed(() => authStore.canIn(tenantId?.value, 'create', 'media'));
const canPick = computed(() => authStore.canIn(tenantId?.value, 'read', 'media'));
const { data: file } = mediaResource.useOne(() => mediaId.value);

const picking = ref(false);
const take = ([media]: { id: string | null }[]) => {
   if (media?.id) mediaId.value = media.id;
};

/** Shows the file in a tab, opened in the click itself so no pop-up blocker stops it. */
const open = () => {
   if (file.value) openMediaFile(file.value.storage_path).catch(appErrorHandler);
};
</script>

<template>
   <span v-if="mediaId" class="flex items-center gap-2 min-w-0">
      <i :class="PrimeIcons.FILE" aria-hidden="true" />
      <span class="truncate">{{ file?.file_name ?? '…' }}</span>
      <Button
         data-action="open"
         :icon="PrimeIcons.EXTERNAL_LINK"
         variant="text"
         size="small"
         :disabled="!file"
         :aria-label="$t('ops.media.open')"
         :title="$t('ops.media.open')"
         @click="open"
      />
      <Button
         v-if="!props.readonly"
         data-action="remove"
         :icon="PrimeIcons.TIMES"
         variant="text"
         size="small"
         severity="danger"
         :aria-label="$t('ops.document.remove_file')"
         :title="$t('ops.document.remove_file')"
         @click="mediaId = null"
      />
   </span>
   <span v-else-if="!props.readonly" class="flex flex-wrap items-center gap-2">
      <MediaDropzone
         v-if="canUpload"
         compact
         :multiple="false"
         :customerId="props.customerId"
         :tenantId
         @uploaded="take"
      />
      <Button
         v-if="canPick"
         data-action="pick-from-library"
         :label="$t('ops.media.pick')"
         :icon="PrimeIcons.IMAGES"
         variant="outlined"
         @click="picking = true"
      />
      <MediaPickerDialog
         v-if="canPick"
         v-model:visible="picking"
         :customerId="props.customerId"
         :tenantId
         :multiple="false"
         @picked="take"
      />
   </span>
</template>
