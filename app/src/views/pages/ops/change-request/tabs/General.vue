<script setup lang="ts">
import {
   CHANGE_KINDS,
   CHANGE_REQUEST_SOURCES,
   CHANGE_REQUEST_URGENCIES
} from '@/api/changeRequest';
import type { ProductRow } from '@/api/product';
import { useEntityDocumentOptions } from '@/api/purchaseOrder';
import { useLookup } from '@/api/useLookup';
import ProductMultiSelect from '@/components/service-components/product-multi-select/ProductMultiSelect.vue';
import ProjectSelect from '@/views/pages/ops/purchase-order/ProjectSelect.vue';
import { injectChangeRequestForm, useChangeRequestGates } from '../useChangeRequestForm';

// S08 A–C in the card's shared form: the customer (on a new request only), the project and the
// SKUs it touches, the title, the source and the urgency (the decision date follows), the kinds of
// change, the old and new values word for word and why, then the gate and the one document it
// touches: the document is picked on its record (the project or one of the chosen products).
const form = injectChangeRequestForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const { t } = useI18n();

const id = computed(() => values.value.id ?? null);
const customerId = computed(() => values.value.customer_id ?? null);

/** Another customer drops the project, the products and what they named. */
const setCustomer = (customer: string | null | undefined) => {
   if ((customer ?? null) === customerId.value) return;
   values.value.customer_id = customer ?? null;
   values.value.project_id = null;
   values.value.product_ids = [];
   values.value.affected_gate_code = null;
   values.value.affected_document_id = null;
};

/** Another project drops the gate of the old one. */
const setProject = (project: string | null | undefined) => {
   if ((project ?? null) === (values.value.project_id ?? null)) return;
   values.value.project_id = project ?? null;
   values.value.affected_gate_code = null;
};

const TEXTS = ['current_value', 'requested_value', 'reason'] as const;

// --- the affected gate ---

const gates = useChangeRequestGates(form);
const gateOptions = computed(() =>
   gates.value.map(({ code }) => ({ value: code, label: t(`ops.project.gate.${code}`) }))
);

// --- the affected document: its record first ---

// The same lookups as the project and product pickers (one cached query each), for the labels.
const { data: projects } = useLookup<Pick<Tables['project']['Row'], 'id' | 'code'>>(
   'project',
   () => ({
      select: 'id, code, display_name',
      order: 'code',
      in: { column: 'customer_id', values: [customerId.value] }
   }),
   () => !!customerId.value
);
const { data: products } = useLookup<Pick<ProductRow, 'id' | 'sku' | 'display_name'>>(
   'product',
   () => ({
      select: 'id, sku, display_name, status',
      order: 'sku',
      in: { column: 'customer_id', values: [customerId.value] }
   }),
   () => !!customerId.value
);

type AffectedEntity = { entityType: 'project' | 'product'; entityId: string };
const entityKey = ({ entityType, entityId }: AffectedEntity) => `${entityType}:${entityId}`;

/** The records the document may be on: the request's project and its chosen products. */
const entityOptions = computed(() => {
   const options: { value: string; label: string }[] = [];
   const projectId = values.value.project_id;
   if (projectId) {
      const project = projects.value?.find((row) => row.id === projectId);
      options.push({
         value: entityKey({ entityType: 'project', entityId: projectId }),
         label: `${t('ops.document.entity.project')}: ${project?.code ?? ''}`
      });
   }
   for (const productId of values.value.product_ids ?? []) {
      const product = products.value?.find((row) => row.id === productId);
      options.push({
         value: entityKey({ entityType: 'product', entityId: productId }),
         label: `${t('ops.document.entity.product')}: ${
            product ? [product.sku, product.display_name].filter(Boolean).join(' — ') : ''
         }`
      });
   }
   return options;
});

// The saved document's record; a draft that names another document keeps no record.
const saved = form.row.value?.affected_document;
const entity = ref<string | null>(
   saved &&
      saved.id === values.value.affected_document_id &&
      (saved.entity_type === 'project' || saved.entity_type === 'product')
      ? entityKey({ entityType: saved.entity_type, entityId: saved.entity_id })
      : null
);

const parsedEntity = computed<AffectedEntity | null>(() => {
   if (!entity.value) return null;
   const [entityType, entityId] = entity.value.split(':') as [AffectedEntity['entityType'], string];
   return { entityType, entityId };
});

const setEntity = (value: string | null | undefined) => {
   entity.value = value ?? null;
   values.value.affected_document_id = null;
};

// A record no longer on the request (another project, a product taken off) drops its document.
watch(entityOptions, (options) => {
   if (entity.value && !options.some(({ value }) => value === entity.value)) setEntity(null);
});

const documentOptions = useEntityDocumentOptions(() => ({
   entityType: parsedEntity.value?.entityType ?? 'project',
   entityId: parsedEntity.value?.entityId ?? null
}));
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
      <FormField
         fluid
         :label="$t('ops.change_request.fields.customer')"
         :error="errors.customer_id"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <SelectCustomer
            v-bind="slotProps"
            :model-value="values.customer_id"
            @update:model-value="setCustomer"
            :disabled="!!id"
            hideClosed
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.project')"
         :error="errors.project_id"
         :readonly
         v-slot="slotProps"
      >
         <ProjectSelect
            v-bind="slotProps"
            :model-value="values.project_id ?? null"
            @update:model-value="setProject"
            :customerId
            :disabled="!customerId"
            data-field="project_id"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.change_request.fields.products')"
         :error="errors.product_ids"
         :readonly
         v-slot="slotProps"
      >
         <ProductMultiSelect
            v-bind="slotProps"
            v-model="values.product_ids"
            :customerId
            :disabled="!customerId"
            data-field="product_ids"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.change_request.fields.title')"
         :error="errors.title"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values.title" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.source')"
         :error="errors.source"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.source"
            :values="CHANGE_REQUEST_SOURCES"
            i18n-prefix="ops.change_request.source"
            glossary="change_request_source"
            data-field="source"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.urgency')"
         :error="errors.urgency"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.urgency"
            :values="CHANGE_REQUEST_URGENCIES"
            i18n-prefix="ops.change_request.urgency"
            glossary="change_request_urgency"
            data-field="urgency"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.change_request.fields.change_kinds')"
         :error="errors.change_kinds"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.change_kinds"
            :values="CHANGE_KINDS"
            multiple
            i18n-prefix="ops.change_request.kind"
            glossary="change_kind"
            data-field="change_kinds"
         />
      </FormField>
      <FormField
         v-for="field in TEXTS"
         :key="field"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t(`ops.change_request.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values[field]" auto-resize rows="2" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.affected_gate')"
         :error="errors.affected_gate_code"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.affected_gate_code"
            :options="gateOptions"
            option-value="value"
            option-label="label"
            showClear
            :disabled="!values.project_id"
            data-field="affected_gate_code"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.affected_record')"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            :model-value="entity"
            @update:model-value="setEntity"
            :options="entityOptions"
            option-value="value"
            option-label="label"
            showClear
            :disabled="!entityOptions.length"
            data-field="affected_entity"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.affected_document')"
         :error="errors.affected_document_id"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.affected_document_id"
            :options="documentOptions"
            option-value="value"
            option-label="label"
            showClear
            :disabled="!entity"
            data-field="affected_document_id"
         />
      </FormField>
   </FormBox>
</template>
