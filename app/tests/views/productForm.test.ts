import { tabForField, useProductForm } from '@/views/pages/ops/product/useProductForm';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The card's form is useUpsertForm; what useProductForm adds is checked against a stand-in.
const discardDraft = vi.fn();
let options: { onSaved?: (row: { id: string }) => void };
vi.mock('@/composables/useUpsertForm', () => ({
   useUpsertForm: (given: typeof options) => {
      options = given;
      return { discardDraft };
   }
}));

beforeEach(() => {
   setActivePinia(createPinia());
   discardDraft.mockClear();
});

describe('tabForField', () => {
   it('names the card tab that shows a field', () => {
      expect(tabForField('unit_net_g')).toBe('dimensions');
      expect(tabForField('pallet_type')).toBe('dimensions');
      expect(tabForField('purchase_price')).toBe('cost');
      expect(tabForField('landed_cost_on')).toBe('cost');
      expect(tabForField('sku')).toBe('general');
      expect(tabForField('gtin')).toBe('general');
   });
});

describe('useProductForm', () => {
   it('drops the draft of a new product once it is saved, then reports the save', () => {
      const onSaved = vi.fn();
      useProductForm(() => null, onSaved);
      const saved = { id: 'p1' };

      options.onSaved?.(saved);

      expect(discardDraft).toHaveBeenCalledOnce();
      expect(onSaved).toHaveBeenCalledWith(saved);
   });

   it('keeps the draft of a product edited under its id', () => {
      useProductForm(() => 'p1');
      options.onSaved?.({ id: 'p1' });
      expect(discardDraft).not.toHaveBeenCalled();
   });
});
