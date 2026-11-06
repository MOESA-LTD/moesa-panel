<script setup lang="ts">
import { mediaResource, thumbPath, type MediaRow } from '@/api/media';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';

// One entry of an Amazon image slot: a library file held as `media:<id>` (the server copies it to
// a public URL on publish), or a URL Amazon was given otherwise, shown as text.
const props = defineProps<{
   /** The entry's media_location, or null for an empty slot. */
   location: string | null;
   inputId?: string;
   readonly?: boolean;
   customerId?: string | null;
   tenantId?: string | null;
}>();
const emit = defineEmits<{ pick: [mediaId: string]; clear: [] }>();

const MEDIA_PREFIX = 'media:';
const mediaId = computed(() =>
   props.location?.startsWith(MEDIA_PREFIX) ? props.location.slice(MEDIA_PREFIX.length) : null
);
const { data: media } = mediaResource.useOne(mediaId);

const pickerOpen = ref(false);
const onPicked = (rows: { id: string | null }[]) => {
   const id = rows[0]?.id;
   if (id) emit('pick', id);
};
</script>

<template>
   <div class="flex items-center gap-3">
      <MediaThumb
         :path="media ? thumbPath(media as MediaRow) : null"
         :mimeType="media?.mime_type ?? null"
         :alt="media?.file_name ?? null"
         :size="64"
      />
      <span
         class="min-w-0 flex-1 truncate text-sm"
         :title="location ?? undefined"
         v-text="media?.file_name ?? location ?? ''"
      />
      <template v-if="!readonly">
         <Button
            :id="inputId"
            data-action="image-pick"
            variant="outlined"
            size="small"
            :icon="PrimeIcons.IMAGES"
            :label="$t('ops.amazon.tab.image_pick')"
            @click="pickerOpen = true"
         />
         <Button
            v-if="location"
            data-action="image-clear"
            variant="text"
            severity="secondary"
            size="small"
            :icon="PrimeIcons.TIMES"
            :title="$t('ops.amazon.tab.image_clear')"
            :aria-label="$t('ops.amazon.tab.image_clear')"
            @click="emit('clear')"
         />
         <MediaPickerDialog
            v-model:visible="pickerOpen"
            :customerId="customerId ?? null"
            :tenantId="tenantId ?? null"
            :multiple="false"
            :kinds="['image']"
            @picked="onPicked"
         />
      </template>
   </div>
</template>
