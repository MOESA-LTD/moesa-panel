<script setup lang="ts">
import { DOCUMENT_ENTITIES, type DocumentEntity } from '@/api/document';
import {
   MEDIA_KINDS,
   mediaKind,
   thumbPath,
   useDeleteMedia,
   type MediaKind,
   type MediaLibraryRow,
   type MediaRow
} from '@/api/media';
import { isMediaInUse, useMediaLibrary, type MediaLibraryFilters } from '@/api/media/library';
import { downloadMediaFile, openMediaFile } from '@/api/media/signedUrls';
import MediaDropzone from '@/components/service-components/media/MediaDropzone.vue';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { DIALOG_POSITIONS } from '@/constants/router';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useAuthStore } from '@/store/auth';
import { useCustomerFilter } from '@/store/customerFilter';

// Every file of the tenant as a grid, narrowed by customer, type, tag and the record it is linked
// to. A file in use (linked, or cited by a document) is not deleted; unlink it first.
type Linked = DocumentEntity | 'none';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();

const queryValue = (key: string) => {
   const value = route.query[key];
   return typeof value === 'string' && value ? value : null;
};
const isLinked = (value: string | null): value is Linked =>
   value === 'none' || (DOCUMENT_ENTITIES as readonly string[]).includes(value ?? '');

// A link may ask for one record's files (?entity_type=product&entity_id=…) or the unlinked ones.
const presetType = queryValue('entity_type');
const presetId = queryValue('entity_id');

const customerId = ref<string | null>(useCustomerFilter().customerId);
const kind = ref<MediaKind | null>(null);
const tagInput = ref('');
const tag = ref<string | null>(null);
const linked = ref<Linked | null>(isLinked(presetType) ? presetType : null);
// The one record of the link, kept while its type stays selected.
const entityId = computed(() =>
   linked.value && linked.value !== 'none' && linked.value === presetType ? presetId : null
);

const applyTag = () => (tag.value = tagInput.value.trim().toLowerCase() || null);

const LINKED_OPTIONS = computed(() => [
   ...DOCUMENT_ENTITIES.map((value) => ({
      value,
      label: t(`ops.document.entity.${value}`)
   })),
   { value: 'none', label: t('ops.media.filter.unlinked') }
]);

const filters = computed<MediaLibraryFilters>(() => ({
   customerId: customerId.value,
   kind: kind.value ? [kind.value] : null,
   tag: tag.value,
   linkedType: linked.value,
   entityId: entityId.value
}));

const library = useMediaLibrary(filters);
const rows = computed(() => (library.data.value?.pages ?? []).flat().filter(({ id }) => !!id));

const report = (promise: Promise<unknown>) => promise.catch(appErrorHandler);

const isImage = (row: MediaLibraryRow) => !!row.mime_type && mediaKind(row.mime_type) === 'image';
/** Shows the file in a tab; the tab opens in the click itself, so no pop-up blocker stops it. */
const open = (row: MediaLibraryRow) => void report(openMediaFile(row.storage_path!));
const download = (row: MediaLibraryRow) =>
   void report(downloadMediaFile(row.storage_path!, row.file_name!));

const canEdit = (row: MediaLibraryRow) => authStore.canIn(row.tenant_id, 'update', 'media');
const canDelete = (row: MediaLibraryRow) => authStore.canIn(row.tenant_id, 'delete', 'media');

const edit = (row: MediaLibraryRow) =>
   router.push({
      name: 'ops-media-edit',
      params: { id: row.id },
      query: { showDialog: DIALOG_POSITIONS.CENTER }
   });

const confirmDelete = useConfirmDelete();
const deleteMedia = useDeleteMedia();
// The row goes first (the database refuses a file in use), then its file and thumbnail.
const remove = async (row: MediaLibraryRow) => {
   if (isMediaInUse(row) || !(await confirmDelete({ id: row.id, name: row.file_name }))) return;
   await report(deleteMedia.mutateAsync({ media: row as MediaRow }));
};
</script>

<template>
   <div class="flex flex-col gap-4 p-4">
      <h2 class="m-0 text-xl font-semibold">{{ $t('ops.media.library') }}</h2>

      <div data-filters class="flex flex-wrap items-center gap-2">
         <SelectCustomer v-model="customerId" data-filter="customer" class="w-64" />
         <SelectEnum
            v-model="kind"
            data-filter="kind"
            :values="MEDIA_KINDS"
            i18nPrefix="ops.media.kind"
            :placeholder="$t('ops.media.filter.kind')"
            showClear
            class="w-40"
         />
         <InputText
            v-model="tagInput"
            data-filter="tag"
            :placeholder="$t('ops.media.filter.tag')"
            :aria-label="$t('ops.media.fields.tags')"
            class="w-48"
            @keydown.enter="applyTag"
         />
         <Select
            v-model="linked"
            data-filter="linked"
            :options="LINKED_OPTIONS"
            optionValue="value"
            optionLabel="label"
            :placeholder="$t('ops.media.filter.linked')"
            showClear
            class="w-52"
         />
      </div>

      <MediaDropzone v-if="$can('create', 'media')" :customerId />

      <p v-if="!rows.length && !library.isFetching.value" class="text-surface-500">
         {{ $t('ops.media.empty_library') }}
      </p>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
         <li
            v-for="row in rows"
            :key="row.id!"
            data-media-card
            :data-media-id="row.id"
            class="flex flex-col gap-2 rounded border border-surface-200 p-2 dark:border-surface-700"
         >
            <!-- An image opens in a lightbox on the page; a PDF or video in a tab. -->
            <MediaThumb
               v-if="isImage(row)"
               class="self-center"
               :path="thumbPath(row as MediaRow)"
               :mimeType="row.mime_type"
               :alt="row.alt_text || row.file_name"
               :size="112"
               preview
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
                  :path="thumbPath(row as MediaRow)"
                  :mimeType="row.mime_type"
                  :alt="row.alt_text || row.file_name"
                  :size="112"
               />
            </button>
            <span class="truncate text-sm" :title="row.file_name ?? ''">
               {{ row.title || row.file_name }}
            </span>
            <span v-if="row.tags?.length" class="flex flex-wrap gap-1">
               <Tag v-for="item in row.tags" :key="item" :value="item" severity="secondary" />
            </span>
            <span class="flex items-center gap-1">
               <Tag :value="$t(`ops.media.kind.${row.kind}`)" severity="info" class="mr-auto" />
               <Button
                  data-action="download"
                  :icon="PrimeIcons.DOWNLOAD"
                  variant="text"
                  rounded
                  size="small"
                  :title="$t('ops.media.download')"
                  :aria-label="$t('ops.media.download')"
                  @click="download(row)"
               />
               <Button
                  v-if="canEdit(row)"
                  data-action="edit"
                  :icon="PrimeIcons.PENCIL"
                  variant="text"
                  rounded
                  size="small"
                  :title="$t('action.edit')"
                  :aria-label="$t('action.edit')"
                  @click="edit(row)"
               />
               <!-- A disabled button gets no hover, so the reason sits on its wrapper. -->
               <span
                  v-if="canDelete(row)"
                  v-tooltip.top="isMediaInUse(row) ? $t('errors.media_in_use') : undefined"
               >
                  <Button
                     data-action="delete"
                     :icon="PrimeIcons.TRASH"
                     severity="danger"
                     variant="text"
                     rounded
                     size="small"
                     :disabled="isMediaInUse(row)"
                     :aria-label="$t('action.delete')"
                     @click="remove(row)"
                  />
               </span>
            </span>
         </li>
      </ul>
      <div v-if="library.hasNextPage.value" class="flex justify-center">
         <Button
            :label="$t('ops.media.load_more')"
            variant="text"
            :loading="library.isFetching.value"
            @click="library.fetchNextPage()"
         />
      </div>
   </div>
</template>
