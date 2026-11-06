import { productResource, type ProductRow } from '@/api/product';
import type { ResourceInput } from '@/api/defineResource';
import type { Attributes } from '@edge-shared/listingCompleteness';
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/**
 * A product's `listing_attributes` being edited, shared by the product's Amazon tab and the cell
 * drawer. The values start from the product, and a product that loads late or is reloaded with
 * other values replaces them unless they were edited here. A save writes only what was edited
 * here onto the latest saved values: every other attribute (and language) stays as it is saved.
 */
export function useListingAttributes(
   product: MaybeRefOrGetter<Pick<ProductRow, 'id' | 'listing_attributes'> | null | undefined>
) {
   const stored = computed(
      () => (toValue(product)?.listing_attributes ?? {}) as unknown as Attributes
   );
   /** A save's answer, until the product is loaded again. */
   const answered = ref<Attributes | null>(null);
   /** The latest saved values (what completeness counts as filled). */
   const saved = computed(() => answered.value ?? stored.value);
   /** The saved values the edits started from. */
   const base = ref<Attributes>(_cloneDeep(stored.value));
   const attributes = ref<Attributes>(_cloneDeep(stored.value));
   /** Bumped whenever the values are replaced from the product, so fields drop unsaved local text. */
   const resetKey = ref(0);

   const load = (values: Attributes) => {
      base.value = _cloneDeep(values);
      attributes.value = _cloneDeep(values);
      resetKey.value += 1;
   };
   const changed = computed(() => !_isEqual(attributes.value, base.value));

   // A refetch that brings the same values back (a new but equal object) changes nothing, so local
   // text that does not parse yet (a JSON field) is kept; nor does the reload after a save.
   watch(stored, (next, before) => {
      answered.value = null;
      if (_isEqual(next, before) || _isEqual(next, base.value)) return;
      if (!changed.value) load(next);
   });

   /** The latest saved values with this form's edits: only the attributes edited here change. */
   const merged = (): Attributes => {
      const next = { ...saved.value };
      const names = new Set([...Object.keys(attributes.value), ...Object.keys(base.value)]);
      for (const name of names) {
         const value = attributes.value[name];
         if (_isEqual(value, base.value[name])) continue;
         if (value === undefined) delete next[name];
         else next[name] = value;
      }
      return next;
   };

   const { mutateAsync, isPending: saving } = productResource.useSave();

   /** Saves the edits, with the other product columns given; the answer becomes the saved values. */
   const save = async (columns: Record<string, unknown> = {}) => {
      const row = toValue(product);
      if (!row) return null;
      // Only these columns: saveRow updates by id and sends nothing else.
      const answer = (await mutateAsync({
         id: row.id,
         ...columns,
         listing_attributes: merged()
      } as unknown as ResourceInput<'product'>)) as ProductRow;
      answered.value = (answer.listing_attributes ?? {}) as unknown as Attributes;
      load(answered.value);
      return answer;
   };

   return {
      attributes,
      saved,
      resetKey,
      changed,
      saving,
      /** Drops the edits: back to the latest saved values. */
      reset: () => load(saved.value),
      save
   };
}
