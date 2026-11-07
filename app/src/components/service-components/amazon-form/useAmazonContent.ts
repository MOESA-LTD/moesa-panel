import { AMAZON_SCHEMA_LOCALE, useDefinition, useProductTypeSearch } from '@/api/amazon';
import type { ProductRow } from '@/api/product';
import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { useListingAttributes } from './useListingAttributes';

export type ProductTypeOption = { name: string; label: string };

type ContentProduct = Pick<
   ProductRow,
   | 'id'
   | 'tenant_id'
   | 'customer_id'
   | 'listing_attributes'
   | 'amazon_product_type'
   | 'amazon_schema_version'
>;

/**
 * A product's Amazon content being edited: its Amazon product type (picked from a search in the
 * country) with the type's schema for the country, and its `listing_attributes`
 * (useListingAttributes). Shared by the product's Amazon tab and the cell drawer, which render it
 * with AmazonContentForm. A product that loads late gives its type unless one was picked here,
 * as its values replace the form's unless they were edited here.
 */
export function useAmazonContent(
   product: Ref<ContentProduct | null | undefined>,
   country: MaybeRefOrGetter<string>
) {
   const listing = useListingAttributes(product);
   const productId = computed(() => product.value?.id ?? null);
   const customerId = computed(() => product.value?.customer_id ?? null);
   const tenantId = computed(() => product.value?.tenant_id ?? null);
   const savedType = computed(() => product.value?.amazon_product_type ?? null);

   // --- product type ---
   const productType = ref<string | null>(savedType.value);
   const typeInput = ref<ProductTypeOption | string | null>(productType.value);
   const query = ref('');
   const { data: found } = useProductTypeSearch(query, country, customerId);
   const typeOptions = computed<ProductTypeOption[]>(() =>
      (found.value ?? []).map(({ name, displayName }) => ({
         name,
         label: `${displayName} (${name})`
      }))
   );
   // The product loads after the form when it was not cached yet; its type is taken unless one was picked.
   watch(savedType, (type, old) => {
      if (productType.value !== (old ?? null)) return;
      productType.value = type;
      typeInput.value = type;
   });
   const pickType = (option: ProductTypeOption) => {
      productType.value = option.name;
      typeInput.value = option.name;
   };
   const typeChanged = computed(() => productType.value !== savedType.value);

   const { data: definition, error: definitionError } = useDefinition(() =>
      productType.value && customerId.value
         ? {
              productType: productType.value,
              country: toValue(country),
              locale: AMAZON_SCHEMA_LOCALE,
              customerId: customerId.value
           }
         : null
   );

   const schemaMoved = computed(
      () =>
         !!definition.value &&
         !!product.value?.amazon_schema_version &&
         product.value.amazon_schema_version !== definition.value.version
   );

   /** Edited here: an attribute or the product type. */
   const dirty = computed(() => listing.changed.value || typeChanged.value);

   /** The product type and the version of its schema, as saved with the attributes. */
   const typeColumns = () =>
      productType.value && definition.value
         ? {
              amazon_product_type: productType.value,
              amazon_schema_version: definition.value.version
           }
         : null;

   /** Drops the edits: back to the saved values and type. */
   const reset = () => {
      listing.reset();
      productType.value = savedType.value;
      typeInput.value = productType.value;
   };

   return {
      ...listing,
      productId,
      customerId,
      tenantId,
      productType,
      typeInput,
      query,
      typeOptions,
      pickType,
      typeChanged,
      definition,
      definitionError,
      schemaMoved,
      dirty,
      typeColumns,
      reset
   };
}

export type AmazonContent = ReturnType<typeof useAmazonContent>;
