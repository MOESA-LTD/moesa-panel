<script setup lang="ts">
import { thumbPath, type MediaKind, type MediaLibraryRow, type MediaRow } from '@/api/media';
import { useMediaLibrary } from '@/api/media/library';
import MediaThumb from './MediaThumb.vue';

// Picks files of the media library: a customer's and the shared ones. A plain dialog, so it can
// open inside a route dialog (a card) without stacking a route.
const props = withDefaults(
   defineProps<{
      customerId?: string | null;
      /** Only this tenant's files (those a record of it can link); every tenant shown by default. */
      tenantId?: string | null;
      multiple?: boolean;
      /** Files not offered, e.g. those already linked. */
      excludeIds?: string[];
      /** Only these kinds; every kind by default. */
      kinds?: MediaKind[];
   }>(),
   { customerId: null, tenantId: null, multiple: true, excludeIds: () => [], kinds: () => [] }
);
const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ picked: [media: MediaLibraryRow[]] }>();

// Queried only while open: a card holding the picker loads no library until it is used.
const library = useMediaLibrary(
   () => ({
      tenantId: props.tenantId,
      customerId: props.customerId,
      includeShared: true,
      kind: props.kinds
   }),
   { enabled: () => visible.value }
);

const rows = computed(() => {
   const excluded = new Set(props.excludeIds);
   return (library.data.value?.pages ?? []).flat().filter(({ id }) => !!id && !excluded.has(id));
});

const selected = ref<string[]>([]);
watch(visible, (open) => open && (selected.value = []));

const toggle = (id: string) => {
   if (!props.multiple) selected.value = [id];
   else if (selected.value.includes(id))
      selected.value = selected.value.filter((other) => other !== id);
   else selected.value = [...selected.value, id];
};

const pick = () => {
   // In the order picked, which decides the default roles (the first image may become primary).
   const byId = new Map(rows.value.map((row) => [row.id, row]));
   emit(
      'picked',
      selected.value.map((id) => byId.get(id)).filter((row): row is MediaLibraryRow => !!row)
   );
   visible.value = false;
};

const thumbOf = (row: MediaLibraryRow) => thumbPath(row as MediaRow);
</script>

<template>
   <Dialog
      v-model:visible="visible"
      modal
      :header="$t('ops.media.pick')"
      class="w-full max-w-4xl"
      :breakpoints="{ '640px': '100vw' }"
   >
      <p v-if="!rows.length && !library.isFetching.value" class="text-surface-500">
         {{ $t('ops.media.empty_library') }}
      </p>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
         <li v-for="row in rows" :key="row.id!">
            <button
               type="button"
               data-picker-item
               class="flex w-full flex-col items-center gap-1 rounded border-2 p-2 text-left"
               :class="
                  selected.includes(row.id!)
                     ? 'border-primary'
                     : 'border-transparent hover:border-surface-300'
               "
               :aria-pressed="selected.includes(row.id!)"
               @click="toggle(row.id!)"
            >
               <MediaThumb
                  :path="thumbOf(row)"
                  :mimeType="row.mime_type"
                  :alt="row.alt_text"
                  :size="96"
               />
               <span class="w-full truncate text-xs" :title="row.file_name ?? ''">
                  {{ row.file_name }}
               </span>
            </button>
         </li>
      </ul>
      <div v-if="library.hasNextPage.value" class="mt-3 flex justify-center">
         <Button
            :label="$t('ops.media.load_more')"
            variant="text"
            :loading="library.isFetching.value"
            @click="library.fetchNextPage()"
         />
      </div>
      <template #footer>
         <Button :label="$t('action.cancel')" variant="text" @click="visible = false" />
         <Button
            data-action="pick"
            :label="$t('ops.media.link_count', { count: selected.length })"
            :disabled="!selected.length"
            @click="pick"
         />
      </template>
   </Dialog>
</template>
