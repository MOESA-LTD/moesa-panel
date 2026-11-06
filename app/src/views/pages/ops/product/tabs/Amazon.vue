<script setup lang="ts">
import {
   amazonErrorText,
   useDefinition,
   useListingSubmissions,
   useProductAmazonCells,
   useProductTypeSearch
} from '@/api/amazon';
import { productResource, type ProductRow } from '@/api/product';
import type { ResourceInput } from '@/api/defineResource';
import AmazonAttributeForm from '@/components/service-components/amazon-form/AmazonAttributeForm.vue';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useAuthStore } from '@/store/auth';
import {
   languageTag as defaultLanguageTag,
   serverProvided,
   type Attributes
} from '@edge-shared/listingCompleteness';
import i18n from '@plugins/i18n';
import { ToastSeverity } from '@primevue/core/api';
import { useToast } from 'primevue/usetoast';

// The product's Amazon content: its Amazon product type and the attribute values in Amazon's own
// shape, filled against the type's schema. The tab works in the marketplace of the product's first
// Amazon cell (DE without one) and shows the issues of that cell's latest submission. A link may
// name a field to open (`?field=<attribute>`), e.g. from the cell drawer.
const props = defineProps<{ id: string }>();

/** The locale of the schema's titles and descriptions (Amazon's own text). */
const SCHEMA_LOCALE = 'en_GB';
const DEFAULT_COUNTRY = 'DE';

const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();

const { data: product } = productResource.useOne(() => props.id);
const { data: cells } = useProductAmazonCells(() => props.id);
const cell = computed(() => cells.value?.[0] ?? null);
const country = computed(() => cell.value?.country ?? DEFAULT_COUNTRY);
const customerId = computed(() => product.value?.customer_id ?? null);
const canEdit = computed(
   () => !!product.value && authStore.canIn(product.value.tenant_id, 'update', 'product')
);

// --- product type ---
type TypeOption = { name: string; label: string };
const productType = ref<string | null>(product.value?.amazon_product_type ?? null);
const typeInput = ref<TypeOption | string | null>(productType.value);
const query = ref('');
const { data: found } = useProductTypeSearch(query, country, customerId);
const typeOptions = computed<TypeOption[]>(() =>
   (found.value ?? []).map(({ name, displayName }) => ({
      name,
      label: `${displayName} (${name})`
   }))
);
// The product loads after the tab when it was not cached yet; its type is taken unless one was picked.
watch(
   () => product.value?.amazon_product_type ?? null,
   (type, old) => {
      if (productType.value !== (old ?? null)) return;
      productType.value = type;
      typeInput.value = type;
   }
);
const pickType = (option: TypeOption) => {
   productType.value = option.name;
   typeInput.value = option.name;
};

const { data: definition, error: definitionError } = useDefinition(() =>
   productType.value && customerId.value
      ? {
           productType: productType.value,
           country: country.value,
           locale: SCHEMA_LOCALE,
           customerId: customerId.value
        }
      : null
);

// --- values ---
const savedAttributes = computed(
   () => (product.value?.listing_attributes ?? {}) as unknown as Attributes
);
const attributes = ref<Attributes>(_cloneDeep(savedAttributes.value));
const isDirty = computed(
   () =>
      !_isEqual(attributes.value, savedAttributes.value) ||
      productType.value !== (product.value?.amazon_product_type ?? null)
);
// A refetched product (another tab saved it) replaces the values unless they were edited here.
watch(savedAttributes, (saved) => {
   if (!isDirty.value) attributes.value = _cloneDeep(saved);
});

const languageTag = ref(defaultLanguageTag(country.value, cell.value?.listing_language) ?? 'de_DE');
watch(cell, (first) => {
   languageTag.value =
      defaultLanguageTag(country.value, first?.listing_language) ?? languageTag.value;
});

const provided = computed(() =>
   product.value ? serverProvided(product.value, cell.value ?? {}) : []
);

const schemaMoved = computed(
   () =>
      !!definition.value &&
      !!product.value?.amazon_schema_version &&
      product.value.amazon_schema_version !== definition.value.version
);

const { data: submissions } = useListingSubmissions(() => cell.value?.id ?? null);
const issues = computed(() => submissions.value?.[0]?.issues ?? []);

const focusField = computed(() =>
   typeof route.query.field === 'string' ? route.query.field : null
);

// --- save ---
const { mutateAsync: saveProduct, isPending: isSubmitting } = productResource.useSave();

const reset = () => {
   attributes.value = _cloneDeep(savedAttributes.value);
   productType.value = product.value?.amazon_product_type ?? null;
   typeInput.value = productType.value;
};

const submit = async () => {
   if (!canEdit.value || !productType.value || !definition.value) return;
   try {
      // Only the Amazon columns: saveRow updates by id and sends nothing else.
      const row = {
         id: props.id,
         amazon_product_type: productType.value,
         amazon_schema_version: definition.value.version,
         listing_attributes: attributes.value
      } as unknown as ResourceInput<'product'>;
      const saved = (await saveProduct(row)) as ProductRow;
      attributes.value = _cloneDeep((saved.listing_attributes ?? {}) as unknown as Attributes);
      toast.add({
         life: 3000,
         severity: ToastSeverity.SUCCESS,
         summary: i18n.t('toast.success'),
         detail: i18n.t('toast.saved')
      });
   } catch (error) {
      appErrorHandler(error);
   }
};
</script>

<template>
   <FormBox
      v-if="product"
      :readonly="!canEdit"
      :dirty="isDirty && !!definition"
      :submitting="isSubmitting"
      :submitText="$t('ops.amazon.tab.save')"
      @submit="submit"
      @reset="reset"
   >
      <div class="flex w-full flex-col gap-4">
         <FormField
            fluid
            :label="$t('ops.amazon.tab.product_type')"
            :readonly="!canEdit"
            v-slot="slotProps"
         >
            <AutoComplete
               v-bind="slotProps"
               v-model="typeInput"
               :suggestions="typeOptions"
               optionLabel="label"
               :placeholder="$t('ops.amazon.tab.product_type_search')"
               :disabled="!canEdit"
               :emptySearchMessage="$t('ops.amazon.tab.product_type_none')"
               @complete="query = $event.query"
               @optionSelect="pickType($event.value)"
            />
         </FormField>

         <Message v-if="definitionError" severity="error">
            {{ amazonErrorText(definitionError) }}
         </Message>
         <Message v-else-if="!productType" severity="secondary">
            {{ $t('ops.amazon.tab.product_type_empty') }}
         </Message>

         <template v-if="definition">
            <span
               class="text-sm text-surface-500"
               v-text="$t('ops.amazon.tab.schema_version', { version: definition.version })"
            />
            <Message v-if="schemaMoved" data-schema-moved severity="warn">
               {{ $t('ops.amazon.tab.schema_moved', { version: definition.version }) }}
            </Message>
            <AmazonAttributeForm
               v-model="attributes"
               v-model:languageTag="languageTag"
               :definition
               :provided
               :readonly="!canEdit"
               :issues
               :customerId
               :tenantId="product.tenant_id"
               :focusField
            />
         </template>
      </div>
   </FormBox>
</template>
