import { purchaseOrderFigures, piDifferences, toUnits } from '@/api/purchaseOrder/figures';
import {
   defaultUnitPrice,
   isPurchaseOrderLocked,
   nextPurchaseOrderStatuses,
   piChecklistComplete,
   PI_CHECK_KEYS,
   PO_LOCKED_FIELDS,
   PURCHASE_ORDER_STATUSES,
   psiWarning,
   purchaseOrderLineSchema,
   purchaseOrderPaymentSchema,
   purchaseOrderSchema,
   purchaseOrderUpdateSchema,
   suggestPayments,
   supplierDefaults,
   toDocumentOptions,
   toPurchaseOrderFormValues,
   toPurchaseOrderLineFormValues,
   toPurchaseOrderLinePayload,
   toPurchaseOrderPaymentFormValues,
   toPurchaseOrderPaymentPayload,
   toPurchaseOrderPayload,
   toPurchaseOrderUpdateFormValues,
   toPurchaseOrderUpdatePayload
} from '@/api/purchaseOrder';
import i18n from '@plugins/i18n';
import { describe, expect, it } from 'vitest';

const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const SUPPLIER = '00000000-0000-4000-8000-000000000002';
const ORDER = '00000000-0000-4000-8000-000000000003';
const PRODUCT = '00000000-0000-4000-8000-000000000004';
const validValues = toPurchaseOrderFormValues({
   customer_id: CUSTOMER,
   supplier_id: SUPPLIER,
   currency: 'USD',
   incoterm: 'FOB',
   deposit_rate: 30
});
const zero = { deposit_rate: 0, pi_extra_amount: 0, pi_discount_amount: 0 };

describe('toUnits', () => {
   it('counts a decimal in integer units without float arithmetic', () => {
      expect(toUnits('1.9000', 4)).toBe(19000);
      expect(toUnits(0.3333, 4)).toBe(3333);
      expect(toUnits(2, 2)).toBe(200);
      expect(toUnits('12', 0)).toBe(12);
      // 1.005 * 100 is 100.49999… in floats; the decimal string is exact.
      expect(toUnits('1.005', 2)).toBe(101);
      expect(toUnits(1.005, 2)).toBe(101);
   });

   it('rounds the digits beyond the scale half away from zero', () => {
      expect(toUnits('-0.005', 2)).toBe(-1);
      expect(toUnits('0.004', 2)).toBe(0);
      expect(toUnits('-0.004', 2)).toBe(0);
      expect(toUnits('2.345', 2)).toBe(235);
      expect(toUnits(1e-7, 4)).toBe(0);
      expect(toUnits(1e21, 0)).toBe(1e21);
   });

   it('refuses what is not a decimal', () => {
      expect(() => toUnits('abc', 2)).toThrow();
      expect(() => toUnits('', 2)).toThrow();
      expect(() => toUnits(Number.NaN, 2)).toThrow();
   });
});

describe('purchaseOrderFigures', () => {
   it('follows the S09 §C formula in integer units', () => {
      expect(
         purchaseOrderFigures(
            [
               { quantity: 1000, unit_price: 2 },
               { quantity: 10, unit_price: '1.0000' }
            ],
            { deposit_rate: 30, pi_extra_amount: 150, pi_discount_amount: 50 }
         )
      ).toEqual({ subtotal: 2010, total: 2110, deposit: 633, balance: 1477 });
      expect(purchaseOrderFigures([{ quantity: 3, unit_price: '1.9000' }], zero).subtotal).toBe(
         5.7
      );
   });

   it('rounds the subtotal and the deposit to cents, half away from zero', () => {
      expect(
         purchaseOrderFigures([{ quantity: 7, unit_price: 0.3333 }], {
            ...zero,
            deposit_rate: 33.33
         })
      ).toEqual({ subtotal: 2.33, total: 2.33, deposit: 0.78, balance: 1.55 });
      // 0.005 rounds up, not to the even cent.
      expect(purchaseOrderFigures([{ quantity: 1, unit_price: '0.0050' }], zero).subtotal).toBe(
         0.01
      );
   });

   it('is zero without lines', () => {
      expect(purchaseOrderFigures([], { ...zero, deposit_rate: 30 })).toEqual({
         subtotal: 0,
         total: 0,
         deposit: 0,
         balance: 0
      });
   });
});

describe('piDifferences', () => {
   it('lists each line, then the S09 §C rows, with the PI minus the system figure', () => {
      const s09 = piDifferences(
         [{ quantity: 1000, unit_price: 2, pi_line_total: 2500, label: 'THO-MOP' }],
         { ...zero, deposit_rate: 30 },
         {
            pi_subtotal: 2500,
            pi_total: 2500,
            pi_deposit_amount: 750,
            pi_balance_amount: 1750,
            pi_extra_amount: 0,
            pi_discount_amount: 0
         }
      );
      expect(s09.rows[0]).toMatchObject({ key: 'line', system: 2000, pi: 2500, diff: 500 });
      expect(s09.rows[0]!.label).toBe('THO-MOP');
      expect(s09.rows.map(({ key }) => key)).toEqual([
         'line',
         'subtotal',
         'extra',
         'discount',
         'total',
         'deposit',
         'balance'
      ]);
      expect(s09.rows.find(({ key }) => key === 'deposit')).toMatchObject({
         system: 600,
         pi: 750,
         diff: 150
      });
      expect(s09.matches).toBe(false);
   });

   it('matches when every figure agrees', () => {
      expect(
         piDifferences(
            [{ quantity: 1000, unit_price: 2 }],
            { ...zero, deposit_rate: 30 },
            {
               pi_subtotal: 2000,
               pi_total: 2000,
               pi_deposit_amount: 600,
               pi_balance_amount: 1400,
               pi_extra_amount: 0,
               pi_discount_amount: 0
            }
         ).matches
      ).toBe(true);
   });

   it('does not match while a PI figure is missing; its difference is empty', () => {
      const missing = piDifferences([{ quantity: 1, unit_price: 1 }], zero, {
         pi_subtotal: 1,
         pi_total: null,
         pi_deposit_amount: 0,
         pi_balance_amount: 1,
         pi_extra_amount: 0,
         pi_discount_amount: 0
      });
      expect(missing.matches).toBe(false);
      expect(missing.rows.find(({ key }) => key === 'total')).toMatchObject({
         system: 1,
         pi: null,
         diff: null
      });
   });

   it('carries the entered extra and discount on both sides and into the totals', () => {
      const { rows, matches } = piDifferences(
         [{ quantity: 10, unit_price: '0.1000', pi_line_total: null }],
         { deposit_rate: 50, pi_extra_amount: 0, pi_discount_amount: 0 },
         {
            pi_subtotal: 1,
            pi_total: 1.2,
            pi_deposit_amount: 0.6,
            pi_balance_amount: 0.6,
            pi_extra_amount: 0.3,
            pi_discount_amount: 0.1
         }
      );
      expect(rows.find(({ key }) => key === 'extra')).toEqual({
         key: 'extra',
         system: 0.3,
         pi: 0.3,
         diff: 0
      });
      expect(rows[0]).toMatchObject({ system: 1, pi: null, diff: null });
      // A line without a PI total is not compared.
      expect(matches).toBe(true);
   });
});

describe('status flow', () => {
   it('offers the next status (rule 1), then cancelling', () => {
      expect(nextPurchaseOrderStatuses({ status: 'draft', deposit_rate: 30 })).toEqual([
         'sent',
         'cancelled'
      ]);
      expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 30 })).toEqual([
         'deposit_paid',
         'cancelled'
      ]);
      expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 0 })).toEqual([
         'in_production',
         'cancelled'
      ]);
      // A masked rate: both ways are offered, the database takes the right one.
      expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: null })).toEqual([
         'deposit_paid',
         'in_production',
         'cancelled'
      ]);
      expect(nextPurchaseOrderStatuses({ status: 'balance_paid', deposit_rate: 30 })).toEqual([
         'closed',
         'cancelled'
      ]);
      expect(nextPurchaseOrderStatuses({ status: 'cancelled', deposit_rate: 30 })).toEqual([]);
      expect(nextPurchaseOrderStatuses({ status: 'closed', deposit_rate: 30 })).toEqual([]);
   });

   it('locks the terms from pi_approved on', () => {
      expect(PURCHASE_ORDER_STATUSES.filter(isPurchaseOrderLocked)).toEqual([
         'pi_approved',
         'deposit_paid',
         'in_production',
         'ready',
         'balance_paid',
         'closed',
         'cancelled'
      ]);
   });

   it('warns about a ready order without an approved PSI', () => {
      expect(psiWarning({ status: 'ready', has_approved_psi: false })).toBe(true);
      expect(psiWarning({ status: 'ready', has_approved_psi: true })).toBe(false);
      expect(psiWarning({ status: 'in_production', has_approved_psi: false })).toBe(false);
   });
});

describe('PI checklist', () => {
   const allOk = Object.fromEntries(PI_CHECK_KEYS.map((k) => [k, 'ok']));

   it('is complete when all 30 items are OK', () => {
      expect(PI_CHECK_KEYS).toHaveLength(30);
      expect(piChecklistComplete(allOk)).toBe(true);
      expect(piChecklistComplete({ ...allOk, '7': 'error' })).toBe(false);
      const missingOne = Object.fromEntries(PI_CHECK_KEYS.slice(0, 29).map((k) => [k, 'ok']));
      expect(piChecklistComplete(missingOne)).toBe(false);
      expect(piChecklistComplete(null)).toBe(false);
      expect(piChecklistComplete([])).toBe(false);
   });
});

describe('purchase order form', () => {
   it('takes the supplier defaults when the Incoterm is one of Incoterms 2020', () => {
      expect(supplierDefaults({ default_incoterm: 'Ex Works', deposit_rate: 30 })).toEqual({
         incoterm: null,
         deposit_rate: 30
      });
      expect(supplierDefaults({ default_incoterm: 'FOB', deposit_rate: null })).toEqual({
         incoterm: 'FOB',
         deposit_rate: null
      });
   });

   it('validates the order', () => {
      const parse = (values: object) =>
         purchaseOrderSchema.safeParse({ ...validValues, ...values });
      expect(parse({}).success).toBe(true);
      expect(parse({ incoterm: 'Ex Works' }).success).toBe(false);
      expect(parse({ incoterm: null }).success).toBe(false);
      expect(parse({ currency: 'usd' }).success).toBe(false);
      expect(parse({ deposit_rate: 101 }).success).toBe(false);
      expect(parse({ tolerance_pct: -1 }).success).toBe(false);
      expect(parse({ pi_discount_amount: -1 }).success).toBe(false);
      expect(parse({ pi_check: { '31': 'ok' } }).success).toBe(false);
      expect(parse({ pi_check: { '1': 'yes' } }).success).toBe(false);
      expect(parse({ pi_check: { '1': 'ok', '30': 'missing' } }).success).toBe(true);
      expect(parse({ customer_id: null }).success).toBe(false);
   });

   it('sends the customer and supplier for a new order only, never the status or code', () => {
      expect(toPurchaseOrderPayload(purchaseOrderSchema.parse(validValues))).toMatchObject({
         customer_id: CUSTOMER,
         supplier_id: SUPPLIER,
         currency: 'USD',
         incoterm: 'FOB',
         deposit_rate: 30,
         pi_extra_amount: 0,
         pi_discount_amount: 0,
         project_id: null
      });

      const draft = toPurchaseOrderPayload(
         purchaseOrderSchema.parse({ ...validValues, id: 'p1' }),
         'draft'
      );
      expect(draft).toMatchObject({ id: 'p1', currency: 'USD' });
      for (const key of [
         'customer_id',
         'supplier_id',
         'status',
         'code',
         'pi_checked_by',
         'pi_checked_at'
      ])
         expect(draft).not.toHaveProperty(key);
   });

   it('leaves the locked terms out once the PI is approved', () => {
      const update = toPurchaseOrderPayload(
         purchaseOrderSchema.parse({ ...validValues, id: 'p1', notes: 'late' }),
         'pi_approved'
      );
      expect(update).toMatchObject({ id: 'p1', notes: 'late' });
      for (const key of ['currency', 'customer_id', 'supplier_id', 'status', ...PO_LOCKED_FIELDS])
         expect(update).not.toHaveProperty(key);
      expect(PO_LOCKED_FIELDS).toHaveLength(13);
   });

   it('reads a stored order back into the form', () => {
      const values = toPurchaseOrderFormValues({
         customer_id: CUSTOMER,
         supplier_id: SUPPLIER,
         currency: 'USD',
         incoterm: 'FOB',
         deposit_rate: 30,
         id: 'p1',
         ready_on: '2026-12-01',
         pi_check: { '1': 'ok' },
         pi_total: 12.5
      });
      expect(values.ready_on).toBeInstanceOf(Date);
      expect(values.pi_check).toEqual({ '1': 'ok' });
      const parsed = purchaseOrderSchema.parse(values);
      expect(parsed.ready_on).toBe('2026-12-01');
      expect(parsed.pi_total).toBe(12.5);
   });
});

describe('lines', () => {
   it('defaults the unit price to the product purchase price in the order currency', () => {
      expect(defaultUnitPrice({ purchase_price: 1.9, purchase_currency: 'USD' }, 'EUR')).toBeNull();
      expect(defaultUnitPrice({ purchase_price: 1.9, purchase_currency: 'USD' }, 'USD')).toBe(1.9);
      expect(
         defaultUnitPrice({ purchase_price: null, purchase_currency: 'USD' }, 'USD')
      ).toBeNull();
   });

   it('validates a line and never sends its customer or line total', () => {
      const values = toPurchaseOrderLineFormValues({
         purchase_order_id: ORDER,
         product_id: PRODUCT,
         quantity: 10,
         unit_price: 1.5,
         customer_id: CUSTOMER,
         line_total: 15
      });
      const parse = (patch: object) => purchaseOrderLineSchema.safeParse({ ...values, ...patch });
      expect(parse({ quantity: 0 }).success).toBe(false);
      expect(parse({ quantity: 1.5 }).success).toBe(false);
      expect(parse({ unit_price: -1 }).success).toBe(false);
      expect(parse({ product_id: null }).success).toBe(false);
      expect(parse({ spec_document_id: 'not-a-uuid' }).success).toBe(false);

      const insert = toPurchaseOrderLinePayload(purchaseOrderLineSchema.parse(values));
      expect(insert).toMatchObject({
         purchase_order_id: ORDER,
         product_id: PRODUCT,
         quantity: 10,
         unit_price: 1.5,
         pi_line_total: null,
         spec_document_id: null
      });
      const update = toPurchaseOrderLinePayload(
         purchaseOrderLineSchema.parse({ ...values, id: 'l1' })
      );
      for (const payload of [insert, update]) {
         expect(payload).not.toHaveProperty('customer_id');
         expect(payload).not.toHaveProperty('line_total');
      }
      expect(update).toMatchObject({ id: 'l1', quantity: 10 });
   });
});

describe('payments', () => {
   it('suggests the missing deposit and balance', () => {
      const figures = { subtotal: 2000, total: 2000, deposit: 600, balance: 1400 };
      expect(suggestPayments(figures, 'USD', [{ kind: 'deposit' }])).toEqual([
         { kind: 'balance', amount: 1400, currency: 'USD', paid_by: 'company' }
      ]);
      expect(suggestPayments(figures, 'USD', [])).toEqual([
         { kind: 'deposit', amount: 600, currency: 'USD', paid_by: 'company' },
         { kind: 'balance', amount: 1400, currency: 'USD', paid_by: 'company' }
      ]);
      expect(
         suggestPayments({ ...figures, deposit: 0, balance: 2000 }, 'USD', [{ kind: 'other' }])
      ).toEqual([{ kind: 'balance', amount: 2000, currency: 'USD', paid_by: 'company' }]);
      expect(suggestPayments(figures, 'USD', [{ kind: 'deposit' }, { kind: 'balance' }])).toEqual(
         []
      );
   });

   it('validates a payment', () => {
      const values = toPurchaseOrderPaymentFormValues({
         purchase_order_id: ORDER,
         kind: 'deposit',
         amount: 600,
         currency: 'USD',
         paid_on: '2026-11-04'
      });
      expect(values.paid_by).toBe('company');
      expect(purchaseOrderPaymentSchema.safeParse({ ...values, amount: 0 }).success).toBe(false);
      expect(toPurchaseOrderPaymentPayload(purchaseOrderPaymentSchema.parse(values))).toEqual({
         purchase_order_id: ORDER,
         kind: 'deposit',
         amount: 600,
         currency: 'USD',
         planned_on: null,
         paid_on: '2026-11-04',
         paid_by: 'company',
         notes: null
      });
   });
});

describe('production updates', () => {
   it('needs a date and a note', () => {
      const values = toPurchaseOrderUpdateFormValues({ purchase_order_id: ORDER });
      expect(purchaseOrderUpdateSchema.safeParse(values).success).toBe(false);
      const filled = { ...values, happened_on: new Date(2026, 10, 4), note: ' Cutting ' };
      expect(toPurchaseOrderUpdatePayload(purchaseOrderUpdateSchema.parse(filled))).toEqual({
         purchase_order_id: ORDER,
         happened_on: '2026-11-04',
         note: 'Cutting'
      });
   });
});

describe('document options', () => {
   it('labels each version with its status, in the order loaded', () => {
      expect(
         toDocumentOptions([
            { id: 'd2', version: 12, status: 'approved' },
            { id: 'd1', version: 3, status: 'signed' }
         ])
      ).toEqual([
         { value: 'd2', label: `v12 — ${i18n.t('ops.document.status.approved')}` },
         { value: 'd1', label: `v03 — ${i18n.t('ops.document.status.signed')}` }
      ]);
   });

   it('names the type of each document when asked', () => {
      const docs = [{ id: 'd1', type: 'spec_sheet', version: 3, status: 'signed' }] as const;
      const version = `v03 — ${i18n.t('ops.document.status.signed')}`;

      expect(toDocumentOptions(docs, { withType: true })).toEqual([
         { value: 'd1', label: `${i18n.t('ops.document.type.spec_sheet')} · ${version}` }
      ]);
      expect(toDocumentOptions(docs)).toEqual([{ value: 'd1', label: version }]);
   });
});
