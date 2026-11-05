<script setup lang="ts">
import type { DocumentEntity } from '@/api/document';
import {
   defaultLinkRoles,
   mediaKind,
   thumbPath,
   useEntityMedia,
   useLinkMedia,
   useSetLinkRole,
   useSetPrimaryMedia,
   useUnlinkMedia,
   type EntityMediaLink,
   type MediaKind,
   type MediaRole
} from '@/api/media';
import { downloadMediaFile, openMediaFile } from '@/api/media/signedUrls';
import MediaDropzone from '@/components/service-components/media/MediaDropzone.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useAuthStore } from '@/store/auth';

// The files of one record (product, customer...), embedded in its card: uploaded or linked from
// the library, one image marked primary. Unlinking keeps the file in the library.
const props = defineProps<{
   entityType: DocumentEntity;
   entityId: string;
   /** The customer new uploads belong to and the library is narrowed to (plus shared files). */
   customerId?: string | null;
   /** The record's tenant: its files and links are written there (a link shares its file's). */
   tenantId?: string | null;
}>();

const BULK_ROLES = ['gallery', 'evidence_photo', 'attachment'] as const;
type BulkRole = (typeof BULK_ROLES)[number];

const authStore = useAuthStore();
// Changing a record's files needs the right to change the record (see 025), then the right for
// each action, all in the record's tenant: linking, uploading (a new file), setting a link's role
// (the primary star too), unlinking.
const can = (action: string, subject: string) => authStore.canIn(props.tenantId, action, subject);
const canChangeRecord = computed(() => can('update', props.entityType));
const canEdit = computed(() => canChangeRecord.value && can('create', 'media_link'));
const canUpload = computed(() => canEdit.value && can('create', 'media'));
const canSetRole = computed(() => canChangeRecord.value && can('update', 'media_link'));
const canUnlink = computed(() => canChangeRecord.value && can('delete', 'media_link'));
const canSelect = computed(() => canSetRole.value || canUnlink.value);

const { data } = useEntityMedia(
   () => props.entityType,
   () => props.entityId
);
const links = computed(() => data.value ?? []);
const hasPrimary = computed(() => links.value.some(({ role }) => role === 'primary_image'));

const link = useLinkMedia();
const unlink = useUnlinkMedia();
const setLinkRole = useSetLinkRole();
const setPrimary = useSetPrimaryMedia();

const report = (promise: Promise<unknown>) => promise.catch(appErrorHandler);

/**
 * Links files after the record's others. Only the batch's first image may become the primary one,
 * and only when there is none; a newer primary would demote the old one in the database anyway.
 */
const linkFiles = (files: { id: string; kind: MediaKind }[]) => {
   if (!files.length) return;
   const roles = defaultLinkRoles(
      files.map(({ kind }) => kind),
      props.entityType,
      hasPrimary.value
   );
   return report(
      link.mutateAsync({
         entityType: props.entityType,
         entityId: props.entityId,
         tenantId: props.tenantId,
         links: files.map(({ id }, index) => ({ mediaId: id, role: roles[index] }))
      })
   );
};

const onUploaded = (media: { id: string; mime_type: string }[]) =>
   linkFiles(media.map(({ id, mime_type }) => ({ id, kind: mediaKind(mime_type) })));

const onPicked = (rows: { id: string | null; kind: string | null }[]) =>
   linkFiles(
      rows.flatMap(({ id, kind }) => (id ? [{ id, kind: (kind ?? 'image') as MediaKind }] : []))
   );

const pickerOpen = ref(false);
const linkedMediaIds = computed(() => links.value.map(({ media_id }) => media_id));

// The selection, for the bulk actions; links gone meanwhile drop out of it.
const selected = ref<string[]>([]);
const selectedIds = computed(() =>
   selected.value.filter((id) => links.value.some((row) => row.id === id))
);

const bulkRole = ref<BulkRole | null>(null);
const applyRole = async (role: string | string[] | null | undefined) => {
   if (typeof role !== 'string' || !role || !selectedIds.value.length) return;
   await report(setLinkRole.mutateAsync({ linkIds: selectedIds.value, role: role as BulkRole }));
   bulkRole.value = null;
};

const unlinkSelected = async () => {
   if (!selectedIds.value.length) return;
   await report(unlink.mutateAsync({ linkIds: selectedIds.value }));
   selected.value = [];
};

const isImage = (row: EntityMediaLink) => mediaKind(row.media.mime_type) === 'image';
const isPrimary = (row: EntityMediaLink) => row.role === 'primary_image';
const SEVERITY: Record<MediaRole, string> = {
   primary_image: 'success',
   gallery: 'info',
   evidence_photo: 'warn',
   attachment: 'secondary'
};

/** Shows the file in a tab; the tab opens in the click itself, so no pop-up blocker stops it. */
const open = (row: EntityMediaLink) => void report(openMediaFile(row.media.storage_path));
const download = (row: EntityMediaLink) =>
   void report(downloadMediaFile(row.media.storage_path, row.media.file_name));
</script>

<template>
   <section class="flex flex-col gap-3">
      <header class="flex flex-wrap items-center justify-between gap-2">
         <span class="font-semibold">{{ $t('ops.media.title') }}</span>
         <Button
            v-if="canEdit"
            data-action="link-from-library"
            variant="outlined"
            :icon="PrimeIcons.LINK"
            :label="$t('ops.media.link_from_library')"
            @click="pickerOpen = true"
         />
      </header>

      <MediaDropzone
         v-if="canUpload"
         :customerId="customerId ?? null"
         :tenantId
         @uploaded="onUploaded"
      />

      <div v-if="canSelect && links.length" data-bulk-bar class="flex flex-wrap items-center gap-2">
         <span class="text-sm text-surface-500">
            {{ $t('ops.media.selected', { count: selectedIds.length }) }}
         </span>
         <SelectEnum
            v-if="canSetRole"
            v-model="bulkRole"
            data-action="set-role"
            :values="BULK_ROLES"
            i18nPrefix="ops.media.role"
            :placeholder="$t('ops.media.set_role')"
            :disabled="!selectedIds.length"
            @update:modelValue="applyRole"
         />
         <Button
            v-if="canUnlink"
            data-action="unlink"
            severity="danger"
            variant="outlined"
            :icon="PrimeIcons.TIMES"
            :label="$t('ops.media.unlink')"
            :disabled="!selectedIds.length"
            :loading="unlink.isPending.value"
            @click="unlinkSelected"
         />
      </div>

      <p v-if="!links.length" class="text-surface-500">{{ $t('ops.media.empty') }}</p>
      <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
         <li
            v-for="row in links"
            :key="row.id"
            data-media-card
            :data-link-id="row.id"
            class="relative flex flex-col gap-2 rounded border border-surface-200 p-2 dark:border-surface-700"
         >
            <Checkbox
               v-if="canSelect"
               v-model="selected"
               :value="row.id"
               class="absolute left-3 top-3 z-10"
               :aria-label="$t('ops.media.select', { name: row.media.file_name })"
            />
            <!-- An image opens in a lightbox on the page; a PDF or video in a tab. -->
            <MediaThumb
               v-if="isImage(row)"
               class="self-center"
               :path="thumbPath(row.media)"
               :mimeType="row.media.mime_type"
               :alt="row.media.alt_text || row.media.file_name"
               :size="112"
               preview
               :previewPath="row.media.storage_path"
            />
            <button
               v-else
               type="button"
               data-action="open"
               class="flex justify-center"
               :title="$t('ops.media.open')"
               @click="open(row)"
            >
               <MediaThumb
                  :path="thumbPath(row.media)"
                  :mimeType="row.media.mime_type"
                  :alt="row.media.alt_text || row.media.file_name"
                  :size="112"
               />
            </button>
            <span class="truncate text-sm" :title="row.media.file_name">
               {{ row.media.file_name }}
            </span>
            <span class="flex items-center justify-between gap-1">
               <Tag :value="$t(`ops.media.role.${row.role}`)" :severity="SEVERITY[row.role]" />
               <Button
                  data-action="download"
                  :icon="PrimeIcons.DOWNLOAD"
                  variant="text"
                  rounded
                  size="small"
                  class="ml-auto"
                  :title="$t('ops.media.download')"
                  :aria-label="$t('ops.media.download')"
                  @click="download(row)"
               />
               <i
                  v-if="isPrimary(row)"
                  :class="PrimeIcons.STAR_FILL"
                  class="px-2 text-yellow-500"
                  :title="$t('ops.media.primary')"
                  :aria-label="$t('ops.media.primary')"
               />
               <Button
                  v-else-if="canSetRole && isImage(row)"
                  data-action="set-primary"
                  :icon="PrimeIcons.STAR"
                  variant="text"
                  rounded
                  size="small"
                  :title="$t('ops.media.set_primary')"
                  :aria-label="$t('ops.media.set_primary')"
                  @click="report(setPrimary.mutateAsync({ linkId: row.id }))"
               />
            </span>
         </li>
      </ul>

      <MediaPickerDialog
         v-if="canEdit"
         v-model:visible="pickerOpen"
         :customerId="customerId ?? null"
         :tenantId
         :excludeIds="linkedMediaIds"
         @picked="onPicked"
      />
   </section>
</template>
