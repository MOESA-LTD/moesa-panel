<script setup lang="ts">
import {
   mediaResource,
   mediaSchema,
   thumbPath,
   toMediaFormValues,
   toMediaPayload
} from '@/api/media';
import { isMediaInUse, useMediaUsage } from '@/api/media/library';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';
import { useUpsertForm } from '@/composables/useUpsertForm';

// A file's description, opened as a dialog from the library. The file itself is fixed once
// uploaded; a new version is a new upload.
const props = defineProps<{ id: string }>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft, row } =
   useUpsertForm({
      id: () => props.id,
      useRow: mediaResource.useOne,
      useSaveRow: mediaResource.useSave,
      subject: 'media',
      schema: mediaSchema,
      toFormValues: toMediaFormValues,
      toPayload: toMediaPayload
   });

// A file linked to a record or cited by a document keeps its customer (media_customer_locked).
const usage = useMediaUsage(() => props.id);
const customerLocked = computed(() => isMediaInUse(usage.data.value));

await Promise.all([ready, usage.suspense()]);
</script>

<template>
   <div class="card">
      <div v-if="row" class="mb-4 flex items-center gap-3">
         <MediaThumb :path="thumbPath(row)" :mimeType="row.mime_type" :alt="row.alt_text" />
         <span class="truncate" data-file-name>{{ row.file_name }}</span>
      </div>
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField
            fluid
            :label="$t('ops.media.fields.title')"
            :error="errors.title"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.title" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.media.fields.customer')"
            :error="errors.customer_id"
            :readonly="readonly || customerLocked"
            v-slot="slotProps"
         >
            <SelectCustomer
               v-bind="slotProps"
               v-model="values.customer_id"
               data-field="customer_id"
               :disabled="customerLocked"
            />
            <small v-if="customerLocked" data-customer-locked class="text-surface-500">
               {{ $t('errors.media_customer_locked') }}
            </small>
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.media.fields.alt_text')"
            :error="errors.alt_text"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.alt_text" />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.media.fields.tags')"
            :error="errors.tags"
            :readonly
            v-slot="slotProps"
         >
            <!-- Free text: each tag is added with Enter. -->
            <AutoComplete v-bind="slotProps" v-model="values.tags" multiple :typeahead="false" />
         </FormField>
      </FormBox>
   </div>
</template>
