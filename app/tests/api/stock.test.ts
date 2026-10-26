import { stockSchema, toStockFormValues, toStockPayload } from '@/api/stock';
import { productSchema, toProductPayload } from '@/api/product';
import { describe, expect, it } from 'vitest';

const validStock = () => ({
   ...toStockFormValues(),
   product_id: 'p1',
   unit_cost: 100,
   unit_discount: 10,
   unit_tax: 18,
   quantity: 3,
   stocked_at: new Date('2026-05-01T09:30:00Z')
});

const issuePaths = (values: unknown) => {
   const result = stockSchema.safeParse(values);
   return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('stockSchema', () => {
   it('accepts a valid stock row', () => {
      expect(issuePaths(validStock())).toEqual([]);
   });

   it('rejects a discount above the unit cost', () => {
      expect(issuePaths({ ...validStock(), unit_discount: 150 })).toEqual(['unit_discount']);
   });

   it('limits a serial-numbered item to a quantity of one', () => {
      expect(issuePaths({ ...validStock(), serial_number: 'SN-1' })).toEqual(['quantity']);
      expect(issuePaths({ ...validStock(), serial_number: 'SN-1', quantity: 1 })).toEqual([]);
   });

   it('requires a product', () => {
      expect(issuePaths({ ...validStock(), product_id: '' })).toEqual(['product_id']);
   });
});

describe('toStockPayload', () => {
   it('sends stock columns only, with an ISO timestamp and null for empty text', () => {
      const payload = toStockPayload(
         stockSchema.parse({ ...validStock(), product: { category: [] }, vendor: '' })
      );

      expect(payload).not.toHaveProperty('product');
      expect(payload.stocked_at).toBe('2026-05-01T09:30:00.000Z');
      expect(payload.vendor).toBeNull();
      expect(payload.quantity).toBe(3);
   });

   it('reads numeric strings from the view as numbers', () => {
      const values = toStockFormValues({ unit_cost: '12.5' as unknown as number, quantity: null });
      expect(values.unit_cost).toBe(12.5);
      expect(values.quantity).toBe(1);
   });
});

describe('toProductPayload', () => {
   it('splits the product row from its category ids and drops tenant_id', () => {
      const payload = toProductPayload(
         productSchema.parse({
            id: 'p1',
            tenant_id: 't1',
            display_name: 'Hearing aid',
            brand: '',
            details: '',
            categories: [{ id: 'c1', display_name: 'device' }, { id: 'c2' }]
         })
      );

      expect(payload).toEqual({
         product: { id: 'p1', display_name: 'Hearing aid', brand: null, details: null },
         categoryIds: ['c1', 'c2']
      });
   });

   it('requires at least one category', () => {
      expect(productSchema.safeParse({ display_name: 'x', categories: [] }).success).toBe(false);
   });
});
