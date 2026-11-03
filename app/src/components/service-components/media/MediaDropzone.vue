<script setup lang="ts">
import { MEDIA_TYPES, useMediaMaxBytes, type MediaRow } from '@/api/media';
import { useUploadMedia } from '@/api/media/upload';
import { appErrorHandler } from '@/lib/appErrorHandler';
import type { FileUploadUploaderEvent } from 'primevue/fileupload';

// Drop or choose files to add them to the media library. They are uploaded one by one; a file that
// fails is reported and the others go on. The uploaded files are emitted together, in drop order.
const props = withDefaults(
   defineProps<{
      customerId: string | null;
      /** The tenant the files go to (that of the record they are for); else the active one. */
      tenantId?: string | null;
      multiple?: boolean;
      /** A button only, without the drop area. */
      compact?: boolean;
   }>(),
   { tenantId: null, multiple: true, compact: false }
);
const emit = defineEmits<{ uploaded: [media: MediaRow[]] }>();

const accept = MEDIA_TYPES.join(',');
const { data: maxBytes } = useMediaMaxBytes();
const maxMb = computed(() => (maxBytes.value ? Math.floor(maxBytes.value / 1048576) : '…'));

const upload = useUploadMedia();
const uploading = ref(false);
const fileUpload = useTemplateRef<{ clear: () => void }>('fileUpload');

const onUpload = async (event: FileUploadUploaderEvent) => {
   const files = [...(Array.isArray(event.files) ? event.files : [event.files])];
   fileUpload.value?.clear();
   uploading.value = true;
   const uploaded: MediaRow[] = [];
   try {
      for (const file of files) {
         try {
            uploaded.push(
               await upload.mutateAsync({
                  file,
                  customerId: props.customerId,
                  tenantId: props.tenantId
               })
            );
         } catch (error) {
            void appErrorHandler(error);
         }
      }
   } finally {
      uploading.value = false;
   }
   if (uploaded.length) emit('uploaded', uploaded);
};
</script>

<template>
   <FileUpload
      ref="fileUpload"
      :mode="compact ? 'basic' : 'advanced'"
      :accept
      :multiple
      auto
      customUpload
      :chooseLabel="$t('ops.media.upload')"
      :disabled="uploading"
      @uploader="onUpload"
      :pt="compact ? undefined : { header: { class: '!border-0 !pb-0' } }"
   >
      <template v-if="!compact" #header="{ chooseCallback }">
         <Button
            :label="$t('ops.media.upload')"
            :icon="PrimeIcons.UPLOAD"
            variant="outlined"
            :loading="uploading"
            @click="chooseCallback()"
         />
      </template>
      <template v-if="!compact" #empty>
         <div class="flex flex-col items-center gap-1 py-4 text-center text-surface-500">
            <i :class="PrimeIcons.CLOUD_UPLOAD" class="text-3xl" aria-hidden="true" />
            <span>{{ $t('ops.media.drop_hint') }}</span>
            <small>{{ $t('ops.media.upload_hint', { mb: maxMb }) }}</small>
         </div>
      </template>
   </FileUpload>
   <small v-if="compact" class="text-surface-500">
      {{ $t('ops.media.upload_hint', { mb: maxMb }) }}
   </small>
</template>
