import {
   createRecordSchema,
   toRecordFormValues,
   toRecordPayload,
   type RecordStock
} from '@/api/record';
import { describe, expect, it } from 'vitest';

const deviceStock = {
   id: 's1',
   unit_type: 'pcs',
   available_quantity: 3,
   product: { category: [{ display_name: 'device' }] }
} as RecordStock;

const schema = (maxQuantity = 3) => createRecordSchema({ maxQuantity, unitType: 'pcs' });

const validSale = () => ({
   ...toRecordFormValues(),
   client_id: 'c1',
   stock_id: 's1',
   stock: deviceStock,
   record_type: 'sale',
   record_status: 'pending',
   quantity: 1,
   payment_type: 'cash',
   bid: 100,
   bid_discount: 10,
   tax: 5,
   attributes: { device_side: 'left' }
});

const issuePaths = (values: unknown, maxQuantity?: number) => {
   const result = schema(maxQuantity).safeParse(values);
   return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.')).sort();
};

describe('createRecordSchema', () => {
   it('accepts a valid sale', () => {
      expect(issuePaths(validSale())).toEqual([]);
   });

   it('limits the quantity to what the stock has available', () => {
      expect(issuePaths({ ...validSale(), quantity: 4 })).toEqual(['quantity']);
      expect(issuePaths({ ...validSale(), quantity: 4 }, 5)).toEqual([]);
   });

   it('requires the device side for hearing devices only', () => {
      expect(issuePaths({ ...validSale(), attributes: {} })).toEqual(['attributes.device_side']);
      expect(
         issuePaths({ ...validSale(), stock: { ...deviceStock, product: null }, attributes: {} })
      ).toEqual([]);
   });

   it('only requires a payment type when something is charged', () => {
      expect(issuePaths({ ...validSale(), payment_type: '' })).toEqual(['payment_type']);
      expect(
         issuePaths({ ...validSale(), payment_type: '', bid: 0, bid_discount: 0, tax: 0 })
      ).toEqual([]);
   });

   it('accepts "no insurance" and asks for contributions once an insurance is chosen', () => {
      expect(
         issuePaths({ ...validSale(), attributes: { device_side: 'left', insurance_type: null } })
      ).toEqual([]);
      expect(
         issuePaths({
            ...validSale(),
            attributes: { device_side: 'left', insurance_type: 'retired' }
         })
      ).toEqual(['attributes.client_insurance_contribution', 'attributes.insurance_contribution']);
   });

   it('checks the status against the record type', () => {
      expect(issuePaths({ ...validSale(), record_status: 'pending_service' })).toEqual([
         'record_status'
      ]);
   });

   it('requires the fields of every ear device', () => {
      expect(
         issuePaths({
            ...validSale(),
            attributes: { device_side: 'left', inner_ear_devices: [{ side: 'left' }] }
         })
      ).toEqual([
         'attributes.inner_ear_devices.0.model',
         'attributes.inner_ear_devices.0.speaker_power',
         'attributes.inner_ear_devices.0.ventilation'
      ]);
   });
});

describe('toRecordPayload', () => {
   it('drops the joined stock and client', () => {
      const payload = toRecordPayload(
         schema().parse({ ...validSale(), client: { id: 'c1', display_name: 'X' } })
      );
      expect(payload).not.toHaveProperty('stock');
      expect(payload).not.toHaveProperty('client');
      expect(payload.stock_id).toBe('s1');
   });
});
