import {
   CHANGE_KINDS,
   CHANGE_REQUEST_SELECT,
   CHANGE_REQUEST_SOURCES,
   CHANGE_REQUEST_STATUSES,
   CHANGE_REQUEST_URGENCIES,
   changeRequestSchema,
   changeRequestStatusHints,
   needsCustomerApproval,
   nextChangeRequestStatuses,
   toChangeRequestFormValues,
   toChangeRequestPayload,
   useNewerDocumentOptions,
   useSetChangeRequestProducts,
   useSetChangeRequestStatus,
   type ChangeRequestCard
} from '@/api/changeRequest';
import { useEntityDocumentOptions } from '@/api/purchaseOrder';
import i18n from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

// Every builder call as [method, ...args]; throwOnError resolves with `response`.
const recorded: unknown[][] = [];
let response: unknown = null;
const builder: object = new Proxy(
   {},
   {
      get: (_, method: string) =>
         method === 'then'
            ? undefined
            : (...args: unknown[]) => {
                 recorded.push([method, ...args]);
                 return method === 'throwOnError'
                    ? Promise.resolve({ data: response, error: null })
                    : builder;
              }
   }
);
vi.mock('@/lib/supabase', () => ({
   supabase: {
      from: (table: string) => {
         recorded.push(['from', table]);
         return builder;
      }
   }
}));
vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => computed(() => 't1') }));

const C = '00000000-0000-4000-8000-000000000001';
const R = '00000000-0000-4000-8000-000000000002';
const P1 = '00000000-0000-4000-8000-000000000011';
const P2 = '00000000-0000-4000-8000-000000000012';
const P3 = '00000000-0000-4000-8000-000000000013';
const D = '00000000-0000-4000-8000-000000000021';

/** Runs a composable inside a component with its own query client. */
const withSetup = <T>(composable: () => T): T => {
   let result!: T;
   mount(
      defineComponent({
         setup() {
            result = composable();
            return () => h('div');
         }
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
   );
   return result;
};

const gates = [
   { code: 'G1', status: 'passed', needs_customer_approval: true },
   { code: 'G4', status: 'passed', needs_customer_approval: false },
   { code: 'G5', status: 'pending', needs_customer_approval: true }
];

beforeEach(() => {
   recorded.length = 0;
   response = null;
});

describe('change request enums', () => {
   it('lists every value in enum order', () => {
      expect(CHANGE_REQUEST_STATUSES).toEqual(['open', 'approved', 'rejected', 'applied']);
      expect(CHANGE_REQUEST_SOURCES).toEqual(['customer', 'supplier', 'company', 'regulation']);
      expect(CHANGE_REQUEST_URGENCIES).toEqual(['normal', 'urgent']);
      expect(CHANGE_KINDS).toEqual([
         'spec',
         'design',
         'packaging',
         'price',
         'deadline',
         'supplier',
         'content'
      ]);
   });
});

describe('change request status flow', () => {
   it('follows change_request_guard (037, rule 4)', () => {
      expect(nextChangeRequestStatuses('open')).toEqual(['approved', 'rejected']);
      expect(nextChangeRequestStatuses('approved')).toEqual(['applied']);
      expect(nextChangeRequestStatuses('rejected')).toEqual([]);
      expect(nextChangeRequestStatuses('applied')).toEqual([]);
   });

   it('needs the customer’s approval after a passed gate that asks for it (S08 §4)', () => {
      expect(needsCustomerApproval({ affected_gate_code: 'G1' }, gates)).toBe(true);
      expect(needsCustomerApproval({ affected_gate_code: 'G4' }, gates)).toBe(false);
      expect(needsCustomerApproval({ affected_gate_code: 'G5' }, gates)).toBe(false);
      expect(needsCustomerApproval({ affected_gate_code: 'G2' }, gates)).toBe(false);
      expect(needsCustomerApproval({ affected_gate_code: null }, gates)).toBe(false);
   });

   const cr = {
      affected_gate_code: 'G1',
      customer_approved_on: null,
      customer_approval_document_id: null,
      decision_note: null,
      affected_document_id: 'd1',
      result_document_id: null
   } as const;

   it('names what each move lacks', () => {
      expect(changeRequestStatusHints(cr, 'approved', gates)).toEqual([
         'change_request_customer_approval_required'
      ]);
      expect(changeRequestStatusHints(cr, 'rejected', gates)).toEqual([
         'change_request_decision_note_required'
      ]);
      expect(changeRequestStatusHints(cr, 'applied', gates)).toEqual([
         'change_request_new_version_required'
      ]);
      expect(changeRequestStatusHints(cr, 'open', gates)).toEqual([]);
   });

   it('names nothing once the data is there', () => {
      // Both the date and the document are needed.
      expect(
         changeRequestStatusHints({ ...cr, customer_approved_on: '2026-11-04' }, 'approved', gates)
      ).toEqual(['change_request_customer_approval_required']);
      expect(
         changeRequestStatusHints(
            { ...cr, customer_approved_on: '2026-11-04', customer_approval_document_id: 'a1' },
            'approved',
            gates
         )
      ).toEqual([]);
      expect(
         changeRequestStatusHints({ ...cr, affected_gate_code: 'G4' }, 'approved', gates)
      ).toEqual([]);
      expect(changeRequestStatusHints({ ...cr, decision_note: '  ' }, 'rejected', gates)).toEqual([
         'change_request_decision_note_required'
      ]);
      expect(changeRequestStatusHints({ ...cr, decision_note: 'No' }, 'rejected', gates)).toEqual(
         []
      );
      expect(
         changeRequestStatusHints({ ...cr, result_document_id: 'd2' }, 'applied', gates)
      ).toEqual([]);
      expect(
         changeRequestStatusHints({ ...cr, affected_document_id: null }, 'applied', gates)
      ).toEqual([]);
   });
});

const filled = {
   customer_id: C,
   title: 't',
   source: 'company',
   current_value: 'a',
   requested_value: 'b',
   reason: 'c'
} as const;

describe('changeRequestSchema', () => {
   it('starts a new request', () => {
      expect(toChangeRequestFormValues()).toMatchObject({
         id: undefined,
         customer_id: null,
         project_id: null,
         source: null,
         urgency: 'normal',
         change_kinds: [],
         product_ids: [],
         affected_gate_code: null,
         title: ''
      });
   });

   it('needs at least one kind of change (change_request_kinds_required)', () => {
      const result = changeRequestSchema.safeParse({
         ...toChangeRequestFormValues(),
         ...filled,
         change_kinds: []
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ path, message }) => [path.join('.'), message])).toEqual([
         ['change_kinds', i18n.t('errors.change_request_kinds_required')]
      ]);
   });

   it('checks the gate, the delay and the products', () => {
      const values = { ...toChangeRequestFormValues(), ...filled, change_kinds: ['price'] };
      expect(changeRequestSchema.safeParse(values).success).toBe(true);
      expect(changeRequestSchema.safeParse({ ...values, affected_gate_code: 'G9' }).success).toBe(
         false
      );
      expect(changeRequestSchema.safeParse({ ...values, delay_days: -1 }).success).toBe(false);
      expect(changeRequestSchema.safeParse({ ...values, delay_days: 1.5 }).success).toBe(false);
      expect(changeRequestSchema.safeParse({ ...values, product_ids: ['p'] }).success).toBe(false);
   });
});

describe('toChangeRequestPayload', () => {
   const values = toChangeRequestFormValues();

   it('never sends the server-set columns or the products; the customer only when new', () => {
      const payload = toChangeRequestPayload(
         changeRequestSchema.parse({
            ...values,
            ...filled,
            change_kinds: ['price'],
            product_ids: []
         }),
         'r1'
      );
      for (const key of [
         'customer_id',
         'code',
         'status',
         'decision_due_on',
         'product_ids',
         'company_approved_on',
         'company_approved_by',
         'closed_on'
      ])
         expect(payload).not.toHaveProperty(key);
      expect(payload).toMatchObject({ id: 'r1', change_kinds: ['price'], urgency: 'normal' });

      const insert = toChangeRequestPayload(
         changeRequestSchema.parse({ ...values, ...filled, change_kinds: ['spec'] })
      );
      expect(insert).toMatchObject({ customer_id: C, source: 'company' });
      expect(insert).not.toHaveProperty('id');
      expect(insert).not.toHaveProperty('product_ids');
   });

   it('sends NULL for the empty fields and the approval date as a date', () => {
      const payload = toChangeRequestPayload(
         changeRequestSchema.parse({
            ...values,
            ...filled,
            change_kinds: ['price'],
            customer_approved_on: new Date(2026, 10, 4)
         }),
         'r1'
      );
      expect(payload).toMatchObject({
         project_id: null,
         affected_gate_code: null,
         affected_document_id: null,
         customer_approval_document_id: null,
         result_document_id: null,
         other_documents: null,
         cost_impact: null,
         cost_payer: null,
         delay_days: null,
         quality_impact: null,
         listing_impact: null,
         decision_note: null,
         customer_approved_on: '2026-11-04'
      });
   });

   it('loads the products from the card', () => {
      const card = {
         id: R,
         customer_id: C,
         title: 't',
         source: 'customer',
         urgency: 'urgent',
         change_kinds: ['spec'],
         current_value: 'a',
         requested_value: 'b',
         reason: 'c',
         customer_approved_on: '2026-11-04',
         change_request_product: [
            { product_id: P1, product: { sku: 'A', display_name: 'A' } },
            { product_id: P2, product: { sku: 'B', display_name: 'B' } }
         ]
      } as unknown as ChangeRequestCard;
      const form = toChangeRequestFormValues(card);
      expect(form).toMatchObject({
         id: R,
         urgency: 'urgent',
         product_ids: [P1, P2],
         customer_approved_on: new Date(2026, 10, 4)
      });
   });
});

describe('CHANGE_REQUEST_SELECT', () => {
   it('embeds the customer, project gates, products and documents by their foreign keys', () => {
      expect(CHANGE_REQUEST_SELECT).toBe(
         '*, customer!change_request_customer_fkey(code, display_name), project!change_request_project_fkey(code, display_name, project_gate!project_gate_project_fkey(code, status, needs_customer_approval)), change_request_product!change_request_product_cr_fkey(product_id, product!change_request_product_product_fkey(sku, display_name)), affected_document:document!change_request_affected_document_fkey(id, entity_type, entity_id, type, version, status), result_document:document!change_request_result_document_fkey(id, type, version, status)'
      );
   });
});

describe('change request mutations', () => {
   it('patches the status only', async () => {
      response = { id: R, status: 'approved' };
      const mutation = withSetup(useSetChangeRequestStatus);
      await mutation.mutateAsync({ id: R, status: 'approved' });

      expect(recorded).toEqual(
         expect.arrayContaining([
            ['from', 'change_request'],
            ['update', { status: 'approved' }],
            ['eq', 'id', R]
         ])
      );
   });

   it('adds the new products and removes the dropped ones', async () => {
      const mutation = withSetup(useSetChangeRequestProducts);
      await mutation.mutateAsync({ id: R, tenantId: 't2', before: [P1, P2], after: [P2, P3] });

      expect(recorded).toEqual([
         ['from', 'change_request_product'],
         ['insert', [{ change_request_id: R, product_id: P3, tenant_id: 't2' }]],
         ['throwOnError'],
         ['from', 'change_request_product'],
         ['delete'],
         ['eq', 'change_request_id', R],
         ['in', 'product_id', [P1]],
         ['throwOnError']
      ]);
   });

   it('asks nothing when the products did not change', async () => {
      const mutation = withSetup(useSetChangeRequestProducts);
      await mutation.mutateAsync({ id: R, tenantId: 't2', before: [P1], after: [P1] });
      expect(recorded).toEqual([]);
   });
});

describe('affected document options', () => {
   it("offers the record's documents of every type, each named by its type", async () => {
      response = [
         { id: D, type: 'spec_sheet', version: 2, status: 'approved' },
         { id: R, type: 'label_artwork', version: 2, status: 'approved' }
      ];
      const options = withSetup(() =>
         useEntityDocumentOptions({ entityType: 'product', entityId: P1 })
      );
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'document'],
         ['select', 'id, type, version, status'],
         ['eq', 'entity_type', 'product'],
         ['eq', 'entity_id', P1],
         ['order', 'version', { ascending: false }],
         ['abortSignal', expect.anything()],
         ['throwOnError']
      ]);
      const approved = `v02 — ${i18n.t('ops.document.status.approved')}`;
      expect(options.value).toEqual([
         { value: D, label: `${i18n.t('ops.document.type.spec_sheet')} · ${approved}` },
         { value: R, label: `${i18n.t('ops.document.type.label_artwork')} · ${approved}` }
      ]);
   });

   it('keeps the plain version labels when a type is asked for', async () => {
      response = [{ id: D, type: 'spec_sheet', version: 2, status: 'approved' }];
      const options = withSetup(() =>
         useEntityDocumentOptions({ entityType: 'product', entityId: P1, type: 'spec_sheet' })
      );
      await flushPromises();

      expect(options.value).toEqual([
         { value: D, label: `v02 — ${i18n.t('ops.document.status.approved')}` }
      ]);
   });
});

describe('useNewerDocumentOptions', () => {
   it('lists the higher versions of the affected document, newest first', async () => {
      response = [{ id: D, version: 3, status: 'signed' }];
      const options = withSetup(() =>
         useNewerDocumentOptions({
            entity_type: 'product',
            entity_id: P1,
            type: 'spec_sheet',
            version: 2
         })
      );
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'document'],
         ['select', 'id, version, status'],
         ['eq', 'entity_type', 'product'],
         ['eq', 'entity_id', P1],
         ['eq', 'type', 'spec_sheet'],
         ['gt', 'version', 2],
         ['order', 'version', { ascending: false }],
         ['abortSignal', expect.anything()],
         ['throwOnError']
      ]);
      expect(options.value).toEqual([
         { value: D, label: `v03 — ${i18n.t('ops.document.status.signed')}` }
      ]);
   });

   it('asks nothing without an affected document', async () => {
      const options = withSetup(() => useNewerDocumentOptions(null));
      await flushPromises();
      expect(recorded).toEqual([]);
      expect(options.value).toEqual([]);
   });
});
