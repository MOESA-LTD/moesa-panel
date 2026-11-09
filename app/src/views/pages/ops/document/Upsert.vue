<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import {
   DOCUMENT_STATUSES,
   DOCUMENT_TYPES,
   documentResource,
   documentSchema,
   toDocumentFormValues,
   toDocumentPayload,
   withRouteContext,
   type DocumentEntity,
   type DocumentRow
} from '@/api/document';
import { useUpsertForm } from '@/composables/useUpsertForm';
import DocumentFileField from './DocumentFileField.vue';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('document');

// Opened as a dialog from a record's document list, which passes the record in the query.
const props = defineProps<{
   id?: string | null;
   entity_type?: DocumentEntity | null;
   entity_id?: string | null;
   customer_id?: string | null;
   /** The record's code (SKU, customer, supplier or project code) the file is named after. */
   code?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: (): Partial<DocumentRow> => ({
         entity_type: props.entity_type ?? undefined,
         entity_id: props.entity_id ?? undefined,
         customer_id: props.customer_id ?? null,
         type: 'other',
         version: 1,
         status: 'draft'
      }),
      useRow: documentResource.useOne,
      useSaveRow: documentResource.useSave,
      subject: 'document',
      schema: documentSchema,
      toFormValues: toDocumentFormValues,
      toPayload: (data) => toDocumentPayload(withRouteContext(data, props), props.code)
   });
await ready;

// The customer the document is saved under (that of its record), whose files it may cite.
const customerId = computed(() => withRouteContext(values.value, props).customer_id ?? null);

const flags = ['is_signed', 'is_stamped', 'sent_from_official_email'] as const;

// What a saved document is (its record, type and version) is fixed (document_identity_immutable),
// and a superseded one stays superseded (document_superseded_sticky).
const identityFixed = computed(() => !!values.value.id);
const statusFixed = computed(() => !!values.value.id && values.value.status === 'superseded');
</script>

<template>
   <div class="card">
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
            :label="$t('ops.document.fields.type')"
            :error="errors.type"
            :readonly="readonly || identityFixed"
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.type"
               :values="DOCUMENT_TYPES"
               glossary="document_type"
               i18n-prefix="ops.document.type"
               :disabled="identityFixed"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.document.fields.version')"
            :error="errors.version"
            :readonly="readonly || identityFixed"
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values.version"
               :min="1"
               :disabled="identityFixed"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.document.fields.issued_on')"
            :error="errors.issued_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.issued_on || null"
               @update:model-value="values.issued_on = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.document.fields.status')"
            :error="errors.status"
            :readonly="readonly || statusFixed"
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="DOCUMENT_STATUSES"
               glossary="document_status"
               i18n-prefix="ops.document.status"
               :disabled="statusFixed"
            />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.document.drive_link')"
            :error="errors.url"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.url" />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.document.file')"
            :error="errors.media_id"
            :readonly
         >
            <DocumentFileField v-model:mediaId="values.media_id" :customerId :readonly />
         </FormField>
         <FormBox class="!flex-auto">
            <span v-for="flag in flags" :key="flag" class="flex items-center gap-2">
               <ToggleSwitch
                  v-model="values[flag]"
                  :inputId="`document-${flag}`"
                  :disabled="readonly"
               />
               <label :for="`document-${flag}`">{{ $t(`ops.document.fields.${flag}`) }}</label>
            </span>
         </FormBox>
         <FormField
            field="notes"
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.document.fields.notes')"
            :error="errors.notes"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
         </FormField>
      </FormBox>
   </div>
</template>
