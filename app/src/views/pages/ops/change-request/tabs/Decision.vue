<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import { needsCustomerApproval, useNewerDocumentOptions } from '@/api/changeRequest';
import { useMemberOptions } from '@/api/project';
import { useEntityDocumentOptions } from '@/api/purchaseOrder';
import { injectChangeRequestForm, useChangeRequestGates } from '../useChangeRequestForm';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('change_request');

// S08 E in the card's shared form. the company's approval is the database's (who moved the request to
// approved, and when). A request that touches a passed (M) gate also needs the customer's written
// approval (S08 §4): its date and a signed or approved document of this request. It may be entered
// after the company approves, but once entered on an approved request it no longer changes (037). Then
// the decision note (why, above all when rejected), the new version of the affected document that
// applying needs, and the closing date (the database's).
const form = injectChangeRequestForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const id = computed(() => values.value.id ?? null);
const row = computed(() => form.row.value ?? null);

// --- the company's approval ---

const memberOptions = useMemberOptions();
const approver = computed(() => {
   const by = row.value?.company_approved_by;
   if (!by) return null;
   return memberOptions.value.find(({ value }) => value === by)?.label ?? null;
});

// --- the customer's approval ---

const gates = useChangeRequestGates(form);
const needsApproval = computed(() =>
   needsCustomerApproval(
      { affected_gate_code: values.value.affected_gate_code || null },
      gates.value
   )
);

/** Shown when needed, and whenever one is entered (so it is never hidden). */
const showApproval = computed(
   () =>
      needsApproval.value ||
      !!values.value.customer_approved_on ||
      !!values.value.customer_approval_document_id
);

/** Once the request is approved, an entered approval no longer changes or clears (037). */
const approved = computed(() => ['approved', 'applied'].includes(row.value?.status ?? ''));
const dateLocked = computed(() => approved.value && !!row.value?.customer_approved_on);
const documentLocked = computed(() => approved.value && !!row.value?.customer_approval_document_id);

const approvalDocumentOptions = useEntityDocumentOptions(() => ({
   entityType: 'change_request',
   entityId: id.value,
   statuses: ['signed', 'approved']
}));

// --- the new version ---

/** The saved affected document, while the form still names it. */
const affectedDocument = computed(() => {
   const doc = row.value?.affected_document ?? null;
   return doc && doc.id === values.value.affected_document_id ? doc : null;
});
const resultOptions = useNewerDocumentOptions(affectedDocument);
</script>

<template>
   <FormBox
      @submit="submit"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
   >
      <div class="flex flex-col gap-2">
         <span class="text-muted-color">{{
            $t('ops.change_request.fields.company_approved')
         }}</span>
         <span data-test="company-approved">
            {{
               row?.company_approved_on
                  ? [row.company_approved_on, approver].filter(Boolean).join(' · ')
                  : '—'
            }}
         </span>
      </div>

      <template v-if="showApproval">
         <Message
            v-if="needsApproval"
            class="w-full"
            severity="warn"
            data-test="customer-approval-hint"
         >
            <TermText :text="$t('ops.change_request.customer_approval_hint')" />
         </Message>
         <FormField
            fluid
            :label="$t('ops.change_request.fields.customer_approved_on')"
            :error="errors.customer_approved_on"
            :readonly="readonly || dateLocked"
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               data-field="customer_approved_on"
               :model-value="values.customer_approved_on || null"
               @update:model-value="values.customer_approved_on = $event as Date | null"
               :disabled="dateLocked"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.change_request.fields.customer_approval_document')"
            :error="errors.customer_approval_document_id"
            :readonly="readonly || documentLocked"
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.customer_approval_document_id"
               :options="approvalDocumentOptions"
               option-value="value"
               option-label="label"
               :showClear="!documentLocked"
               :disabled="documentLocked"
               data-field="customer_approval_document_id"
            />
         </FormField>
      </template>

      <FormField
         field="decision_note"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.change_request.fields.decision_note')"
         :error="errors.decision_note"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.decision_note" auto-resize rows="3" />
      </FormField>

      <FormField
         v-if="values.affected_document_id"
         fluid
         :label="$t('ops.change_request.fields.result_document')"
         :error="errors.result_document_id"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.result_document_id"
            :options="resultOptions"
            option-value="value"
            option-label="label"
            showClear
            data-field="result_document_id"
         />
      </FormField>

      <div class="flex flex-col gap-2">
         <span class="text-muted-color">{{ $t('ops.change_request.fields.closed_on') }}</span>
         <span data-test="closed-on">{{ row?.closed_on ?? '—' }}</span>
      </div>
   </FormBox>
</template>
