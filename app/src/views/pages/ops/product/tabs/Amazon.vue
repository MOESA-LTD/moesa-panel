<script setup lang="ts">
import {
   AMAZON_LANGUAGE_TAGS,
   amazonErrorText,
   orderAmazonCells,
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
// shape, filled against the type's schema. The tab works in one Amazon cell's marketplace and
// shows the issues of that cell's latest submission: the cell of the market a link names
// (`?market=<country>`), else the first cell in the EU country order (DE, FR, IT, ES, NL, PL, SE,
// BE, GB, then id; DE without a cell). A link may also name the language (`?lang=<xx_YY>`) and a
// field to open (`?field=<attribute>`), as the cell drawer's links do.
const props = defineProps<{ id: string }>();

/** The locale of the schema's titles and descriptions (Amazon's own text). */
const SCHEMA_LOCALE = 'en_GB';
const DEFAULT_COUNTRY = 'DE';

const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();

const { data: product } = productResource.useOne(() => props.id);
const { data: cells } = useProductAmazonCells(() => props.id);
const queryText = (name: string) =>
   typeof route.query[name] === 'string' ? (route.query[name] as string) : null;
const market = computed(() => queryText('market')?.toUpperCase() ?? null);
const cell = computed(() => {
   const ordered = orderAmazonCells(cells.value ?? []);
   return ordered.find(({ country }) => country === market.value) ?? ordered[0] ?? null;
});
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
/** Bumped whenever the values are replaced from the product, so fields drop unsaved local text. */
const resetKey = ref(0);
const loadSaved = (saved: Attributes) => {
   attributes.value = _cloneDeep(saved);
   resetKey.value += 1;
};
const isDirty = computed(
   () =>
      !_isEqual(attributes.value, savedAttributes.value) ||
      productType.value !== (product.value?.amazon_product_type ?? null)
);
// The product loading after the tab, or refetched after another tab saved it, replaces the values
// unless they were edited here (compared with what was saved before).
// A refetch that brings the same values back (a new but equal object) changes nothing, so local
// text that does not parse yet (a JSON field) is kept.
watch(savedAttributes, (saved, before) => {
   if (_isEqual(saved, before)) return;
   if (_isEqual(attributes.value, before)) loadSaved(saved);
});

// The language a link names, else the working cell's language, until the user picks one.
const linkedLanguage = computed(() => {
   const tag = queryText('lang');
   return tag && (AMAZON_LANGUAGE_TAGS as readonly string[]).includes(tag) ? tag : null;
});
const languagePicked = ref(!!linkedLanguage.value);
const languageTag = ref(
   linkedLanguage.value ??
      defaultLanguageTag(country.value, cell.value?.listing_language) ??
      'de_DE'
);
watch(cell, (first) => {
   if (languagePicked.value) return;
   languageTag.value =
      defaultLanguageTag(country.value, first?.listing_language) ?? languageTag.value;
});
const pickLanguage = (tag: string) => {
   languagePicked.value = true;
   languageTag.value = tag;
};
watch(linkedLanguage, (tag) => tag && pickLanguage(tag));

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

const focusField = computed(() => queryText('field'));

// --- save ---
const { mutateAsync: saveProduct, isPending: isSubmitting } = productResource.useSave();

const reset = () => {
   loadSaved(savedAttributes.value);
   productType.value = product.value?.amazon_product_type ?? null;
   typeInput.value = productType.value;
};

const submit = async () => {
   if (!product.value || !canEdit.value || !productType.value || !definition.value) return;
   try {
      // Only the Amazon columns: saveRow updates by id and sends nothing else.
      const row = {
         id: props.id,
         amazon_product_type: productType.value,
         amazon_schema_version: definition.value.version,
         listing_attributes: attributes.value
      } as unknown as ResourceInput<'product'>;
      const saved = (await saveProduct(row)) as ProductRow;
      loadSaved((saved.listing_attributes ?? {}) as unknown as Attributes);
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
      :dirty="isDirty && !!product && !!definition"
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
               :languageTag
               :resetKey
               @update:languageTag="pickLanguage"
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
