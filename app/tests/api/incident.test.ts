import {
   COST_PAYERS,
   customerNoticeState,
   INCIDENT_DEADLINE_DEFAULTS,
   INCIDENT_DEADLINE_KINDS,
   INCIDENT_ENTITY_TYPES,
   INCIDENT_FAMILIES,
   INCIDENT_OUTCOMES,
   INCIDENT_PARTIES,
   INCIDENT_ROOT_CAUSES,
   INCIDENT_SELECT,
   INCIDENT_SEVERITIES,
   INCIDENT_SEVERITY_SEVERITY,
   INCIDENT_STATUSES,
   INCIDENT_TYPES,
   incidentDeadlineSchema,
   incidentLogSchema,
   incidentSchema,
   incidentSeverityHints,
   incidentStatusHints,
   incidentTypesOf,
   nextIncidentStatuses,
   toIncidentDeadlineFormValues,
   toIncidentDeadlinePayload,
   toIncidentFormValues,
   toIncidentLogFormValues,
   toIncidentLogPayload,
   toIncidentPayload,
   useIncidentEntityOptions,
   useIncidentOverview,
   useOpenIncidentOptions,
   useSetIncidentStatus
} from '@/api/incident';
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
const I = '00000000-0000-4000-8000-000000000002';
const E = '00000000-0000-4000-8000-000000000003';

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

type Parsed = { error?: { issues: { path: PropertyKey[]; message: string }[] } };
const issues = (result: Parsed) =>
   (result.error?.issues ?? []).map(({ path, message }) => [path.join('.'), message]);

beforeEach(() => {
   recorded.length = 0;
   response = null;
});

describe('incident enums', () => {
   it('lists every value in enum order', () => {
      expect(INCIDENT_STATUSES).toEqual(['open', 'contained', 'closed']);
      expect(INCIDENT_SEVERITIES).toEqual(['s1', 's2', 's3']);
      expect(INCIDENT_FAMILIES).toEqual(['ol', 'oa', 'ou', 'ot', 'om']);
      expect(INCIDENT_PARTIES).toEqual([
         'customer',
         'supplier',
         'forwarder',
         'platform',
         'warehouse'
      ]);
      expect(INCIDENT_ROOT_CAUSES).toEqual([
         'human_error',
         'document_data',
         'communication',
         'supplier',
         'carrier',
         'platform_regulation',
         'customer'
      ]);
      expect(INCIDENT_OUTCOMES).toEqual(['full_recovery', 'partial_recovery', 'loss']);
      expect(COST_PAYERS).toEqual(['moesa', 'customer', 'supplier', 'carrier_insurance']);
      expect(INCIDENT_DEADLINE_KINDS).toEqual([
         'supplier_damage',
         'carrier_claim',
         'demurrage',
         'supplier_storage',
         'platform_escalation',
         'document_request',
         'other'
      ]);
      expect(INCIDENT_DEADLINE_DEFAULTS).toEqual([
         'supplier_damage',
         'carrier_claim',
         'platform_escalation',
         'document_request'
      ]);
      expect(INCIDENT_ENTITY_TYPES).toEqual([
         'project',
         'purchase_order',
         'shipment',
         'product',
         'market_cell'
      ]);
      expect(INCIDENT_SEVERITY_SEVERITY).toEqual({ s1: 'danger', s2: 'warn', s3: 'info' });
   });

   it('lists the 42 Y10 cards, by family', () => {
      expect(INCIDENT_TYPES).toHaveLength(42);
      expect(new Set(INCIDENT_TYPES).size).toBe(42);
      expect(INCIDENT_TYPES.every((type) => /^(OL|OA|OU|OT|OM)-[0-9]{2}$/.test(type))).toBe(true);
      expect(incidentTypesOf('ot')).toEqual([
         'OT-01',
         'OT-02',
         'OT-03',
         'OT-04',
         'OT-05',
         'OT-06',
         'OT-07',
         'OT-08'
      ]);
      expect(incidentTypesOf('ol')).toHaveLength(12);
      expect(incidentTypesOf('ol')[11]).toBe('OL-12');
      expect(incidentTypesOf('oa')).toHaveLength(10);
      expect(incidentTypesOf('ou')).toHaveLength(6);
      expect(incidentTypesOf('om')).toEqual(['OM-01', 'OM-02', 'OM-03', 'OM-04', 'OM-05', 'OM-06']);
   });
});

describe('incident status flow', () => {
   it('follows incident_guard (035, rule 4)', () => {
      expect(nextIncidentStatuses('open')).toEqual(['contained', 'closed']);
      expect(nextIncidentStatuses('contained')).toEqual(['closed']);
      expect(nextIncidentStatuses('closed')).toEqual([]);
      nextIncidentStatuses('open').push('open');
      expect(nextIncidentStatuses('open')).toEqual(['contained', 'closed']);
   });

   const s1 = {
      severity: 's1',
      management_notified_at: null,
      outcome: null,
      root_cause: null,
      preventive_action: null
   } as const;
   const complete = {
      ...s1,
      management_notified_at: '2026-11-06T09:30:00Z',
      outcome: 'loss',
      root_cause: 'carrier',
      preventive_action: 'Y07'
   } as const;

   it('names the management notice an s1 or s2 needs to leave open (rule 5)', () => {
      expect(incidentStatusHints(s1, 'contained', true)).toEqual([
         'incident_management_notice_required'
      ]);
      expect(incidentStatusHints({ ...s1, severity: 's2' }, 'contained', false)).toEqual([
         'incident_management_notice_required'
      ]);
      expect(incidentStatusHints({ ...s1, severity: 's3' }, 'contained', false)).toEqual([]);
      expect(incidentStatusHints(complete, 'contained', false)).toEqual([]);
      // A contained incident already left open: closing it needs no notice.
      expect(
         incidentStatusHints(
            { ...complete, management_notified_at: null, status: 'contained' },
            'closed',
            true
         )
      ).toEqual([]);
   });

   it('names what closing needs, in the guard order (rule 6)', () => {
      expect(incidentStatusHints(complete, 'closed', false)).toEqual(['incident_close_management']);
      expect(incidentStatusHints(complete, 'closed', true)).toEqual([]);
      expect(incidentStatusHints({ ...s1, severity: 's3' }, 'closed', true)).toEqual([
         'incident_closure_incomplete'
      ]);
      expect(incidentStatusHints(s1, 'closed', false)).toEqual([
         'incident_management_notice_required',
         'incident_closure_incomplete',
         'incident_close_management'
      ]);
      expect(
         incidentStatusHints(
            { ...complete, severity: 's2', preventive_action: '  ' },
            'closed',
            false
         )
      ).toEqual(['incident_closure_incomplete']);
   });

   it('lets only management lower an s1 or s2', () => {
      expect(incidentSeverityHints('s1', 's2', false)).toEqual([
         'incident_severity_downgrade_requires_management'
      ]);
      expect(incidentSeverityHints('s2', 's3', false)).toEqual([
         'incident_severity_downgrade_requires_management'
      ]);
      expect(incidentSeverityHints('s1', 's3', true)).toEqual([]);
      expect(incidentSeverityHints('s3', 's1', false)).toEqual([]);
      expect(incidentSeverityHints('s2', 's1', false)).toEqual([]);
      expect(incidentSeverityHints('s2', 's2', false)).toEqual([]);
   });
});

describe('customerNoticeState', () => {
   const now = new Date('2026-11-06T14:00:00Z');

   it('tells whether the customer was told in time', () => {
      expect(
         customerNoticeState(
            { customer_notice_due_at: '2026-11-06T13:00:00Z', customer_notified_at: null },
            now
         )
      ).toBe('late');
      expect(
         customerNoticeState(
            { customer_notice_due_at: '2026-11-06T15:00:00Z', customer_notified_at: null },
            now
         )
      ).toBe('due');
      expect(
         customerNoticeState(
            {
               customer_notice_due_at: '2026-11-06T13:00:00Z',
               customer_notified_at: '2026-11-06T12:00:00Z'
            },
            now
         )
      ).toBe('done');
      expect(
         customerNoticeState({ customer_notice_due_at: null, customer_notified_at: null }, now)
      ).toBe('none');
   });
});

const base = toIncidentFormValues({
   customer_id: C,
   family: 'ol',
   severity: 's2',
   title: 'Late truck',
   what_happened: 'The truck is late.'
});

describe('incidentSchema', () => {
   it('starts a new incident empty', () => {
      expect(toIncidentFormValues()).toMatchObject({
         id: undefined,
         customer_id: null,
         family: null,
         severity: null,
         incident_type: null,
         entity_type: null,
         entity_id: null,
         affected_parties: [],
         opened_at: null,
         title: ''
      });
   });

   it('accepts a minimal incident', () => {
      expect(incidentSchema.safeParse(base).success).toBe(true);
   });

   it('keeps the Y10 card in the family (incident_type_family)', () => {
      const result = incidentSchema.safeParse({ ...base, incident_type: 'OA-02' });
      expect(result.success).toBe(false);
      expect(issues(result)).toEqual([['incident_type', i18n.t('errors.incident_type_family')]]);
      expect(incidentSchema.safeParse({ ...base, incident_type: 'OL-09' }).success).toBe(true);
      expect(incidentSchema.safeParse({ ...base, incident_type: 'OL-13' }).success).toBe(false);
   });

   it('needs both halves of the linked record (incident_entity_pair)', () => {
      const result = incidentSchema.safeParse({ ...base, entity_type: 'shipment' });
      expect(result.success).toBe(false);
      expect(issues(result)).toEqual([['entity_id', i18n.t('errors.incident_entity_invalid')]]);
      expect(incidentSchema.safeParse({ ...base, entity_id: E }).success).toBe(false);
      expect(
         incidentSchema.safeParse({ ...base, entity_type: 'shipment', entity_id: E }).success
      ).toBe(true);
      expect(
         incidentSchema.safeParse({ ...base, entity_type: 'customer', entity_id: E }).success
      ).toBe(false);
   });
});

describe('toIncidentPayload', () => {
   it('never sends the server-set columns; the customer and family only with a new incident', () => {
      const update = toIncidentPayload(incidentSchema.parse(base), I);
      for (const key of [
         'customer_id',
         'family',
         'code',
         'status',
         'customer_notice_due_at',
         'closed_on',
         'closed_by'
      ])
         expect(update).not.toHaveProperty(key);
      expect(update).toMatchObject({ id: I, severity: 's2', title: 'Late truck' });

      const insert = toIncidentPayload(incidentSchema.parse(base));
      expect(insert).toMatchObject({ customer_id: C, family: 'ol' });
      expect(insert).not.toHaveProperty('id');
      for (const key of ['code', 'status', 'customer_notice_due_at', 'closed_on', 'closed_by'])
         expect(insert).not.toHaveProperty(key);
   });

   it('sends NULL for empty fields, times as ISO strings, and the opening time only when set', () => {
      const payload = toIncidentPayload(incidentSchema.parse(base), I);
      expect(payload).toMatchObject({
         incident_type: null,
         reported_by: null,
         current_state: null,
         immediate_action: null,
         entity_type: null,
         entity_id: null,
         owner_id: null,
         affected_parties: [],
         management_notified_at: null,
         customer_notified_at: null,
         outcome: null,
         root_cause: null,
         root_cause_note: null,
         impact_note: null,
         lessons: null,
         preventive_action: null,
         customer_closure_notified_on: null
      });
      expect(payload).not.toHaveProperty('opened_at');

      const timed = toIncidentPayload(
         incidentSchema.parse({
            ...base,
            opened_at: new Date('2026-11-06T08:00:00Z'),
            management_notified_at: new Date('2026-11-06T09:30:00Z'),
            customer_closure_notified_on: new Date(2026, 10, 9),
            affected_parties: ['customer', 'platform']
         }),
         I
      );
      expect(timed).toMatchObject({
         opened_at: '2026-11-06T08:00:00.000Z',
         management_notified_at: '2026-11-06T09:30:00.000Z',
         customer_closure_notified_on: '2026-11-09',
         affected_parties: ['customer', 'platform']
      });
   });

   it('round-trips a stored incident', () => {
      const values = toIncidentFormValues({
         id: I,
         customer_id: C,
         family: 'oa',
         severity: 's1',
         incident_type: 'OA-02',
         title: 'GPSR',
         what_happened: 'Request',
         opened_at: '2026-11-06T08:00:00Z',
         customer_closure_notified_on: '2026-11-09',
         entity_type: 'product',
         entity_id: E
      });
      expect(values.opened_at).toEqual(new Date('2026-11-06T08:00:00Z'));
      expect(toIncidentPayload(incidentSchema.parse(values))).toMatchObject({
         id: I,
         incident_type: 'OA-02',
         entity_type: 'product',
         entity_id: E,
         customer_closure_notified_on: '2026-11-09'
      });
   });
});

describe('incident log', () => {
   const now = new Date('2026-11-06T14:00:00Z');

   it('needs a cost with its amount, currency and payer, or none (incident_log_cost_complete)', () => {
      const partial = incidentLogSchema.safeParse({
         incident_id: I,
         logged_at: now,
         note: 'fee',
         cost_amount: 100
      });
      expect(partial.success).toBe(false);
      expect(issues(partial)).toEqual([
         ['cost_amount', i18n.t('errors.incident_log_cost_incomplete')]
      ]);
      expect(
         incidentLogSchema.safeParse({
            incident_id: I,
            logged_at: now,
            note: 'fee',
            cost_amount: 100,
            cost_currency: 'EUR',
            cost_payer: 'customer'
         }).success
      ).toBe(true);
      expect(
         incidentLogSchema.safeParse({ incident_id: I, logged_at: now, note: 'call' }).success
      ).toBe(true);
      expect(
         incidentLogSchema.safeParse({
            incident_id: I,
            logged_at: now,
            note: 'fee',
            cost_currency: 'EUR'
         }).success
      ).toBe(false);
   });

   it('starts now and sends a line without its author', () => {
      const values = toIncidentLogFormValues({ incident_id: I });
      expect(values.logged_at).toBeInstanceOf(Date);
      expect(values).toMatchObject({ incident_id: I, note: '', customer_approved: false });

      expect(
         toIncidentLogPayload(
            incidentLogSchema.parse({ ...values, logged_at: now, note: 'Called the carrier' })
         )
      ).toEqual({
         incident_id: I,
         logged_at: '2026-11-06T14:00:00.000Z',
         note: 'Called the carrier',
         counterparty: null,
         decision: null,
         cost_amount: null,
         cost_currency: null,
         cost_payer: null,
         customer_approved: false
      });

      const update = toIncidentLogPayload(
         incidentLogSchema.parse({ ...values, id: 'l1', logged_at: now, note: 'x' })
      );
      expect(update).toMatchObject({ id: 'l1' });
      expect(update).not.toHaveProperty('incident_id');
      expect(update).not.toHaveProperty('author_id');
   });
});

describe('incident deadlines', () => {
   it('needs a due time unless the database calculates it', () => {
      const other = incidentDeadlineSchema.safeParse({
         incident_id: I,
         kind: 'other',
         due_at: null
      });
      expect(other.success).toBe(false);
      expect(issues(other)).toEqual([['due_at', i18n.t('errors.incident_deadline_due_required')]]);
      expect(
         incidentDeadlineSchema.safeParse({ incident_id: I, kind: 'demurrage', due_at: '' }).success
      ).toBe(false);
      for (const kind of INCIDENT_DEADLINE_DEFAULTS)
         expect(
            incidentDeadlineSchema.safeParse({ incident_id: I, kind, due_at: null }).success
         ).toBe(true);
   });

   it('leaves an empty due time out, so the database fills it', () => {
      expect(
         toIncidentDeadlinePayload(
            incidentDeadlineSchema.parse({
               incident_id: I,
               kind: 'document_request',
               due_at: null
            })
         )
      ).not.toHaveProperty('due_at');
      expect(
         toIncidentDeadlinePayload(
            incidentDeadlineSchema.parse({ incident_id: I, kind: 'carrier_claim', due_at: null })
         )
      ).toEqual({ incident_id: I, kind: 'carrier_claim', label: null, met_at: null });

      const values = toIncidentDeadlineFormValues({
         id: 'd1',
         incident_id: I,
         kind: 'other',
         label: 'Customs',
         due_at: '2026-11-10T12:00:00Z',
         met_at: null
      });
      expect(toIncidentDeadlinePayload(incidentDeadlineSchema.parse(values))).toEqual({
         id: 'd1',
         kind: 'other',
         label: 'Customs',
         due_at: '2026-11-10T12:00:00.000Z',
         met_at: null
      });
   });
});

describe('INCIDENT_SELECT', () => {
   it('embeds the customer, log, deadlines and rolled-back gates by their foreign keys', () => {
      expect(INCIDENT_SELECT).toBe(
         '*, customer!incident_customer_fkey(code, display_name), incident_log!incident_log_incident_fkey(*), incident_deadline!incident_deadline_incident_fkey(*), project_gate!project_gate_rollback_incident_fkey(id, code, status, project_id)'
      );
   });
});

describe('incident queries', () => {
   it('reads one overview row', async () => {
      response = { id: I };
      const query = withSetup(() => useIncidentOverview(I));
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'incident_overview'],
         ['select', '*'],
         ['eq', 'id', I],
         ['abortSignal', expect.anything()],
         ['maybeSingle'],
         ['throwOnError']
      ]);
      expect(query.data.value).toEqual({ id: I });
   });

   it('asks nothing without an id', async () => {
      withSetup(() => useIncidentOverview(null));
      await flushPromises();
      expect(recorded).toEqual([]);
   });

   it.each([
      [
         'project',
         'project',
         'id, code, display_name',
         'code',
         { id: E, code: 'PRJ-1', display_name: 'Mop' },
         'PRJ-1 — Mop'
      ],
      ['purchase_order', 'purchase_order', 'id, code', 'code', { id: E, code: 'PO-1' }, 'PO-1'],
      ['shipment', 'shipment', 'id, code', 'code', { id: E, code: 'SHP-1' }, 'SHP-1'],
      [
         'product',
         'product',
         'id, sku, display_name',
         'sku',
         { id: E, sku: 'MOP40', display_name: 'Mop' },
         'MOP40 — Mop'
      ],
      [
         'market_cell',
         'market_cell_overview',
         'id, sku, cell_key',
         'sku',
         { id: E, sku: 'MOP40', cell_key: 'amazon_DE' },
         'MOP40 · amazon_DE'
      ]
   ] as const)('lists the customer’s %s records as options', async (...args) => {
      const [entityType, table, select, order, row, label] = args;
      response = [row];
      const options = withSetup(() => useIncidentEntityOptions({ entityType, customerId: C }));
      await flushPromises();

      expect(recorded).toEqual([
         ['from', table],
         ['select', select],
         ['eq', 'customer_id', C],
         ['order', order],
         ['abortSignal', expect.anything()],
         ['throwOnError']
      ]);
      expect(options.value).toEqual([{ value: E, label }]);
   });

   it('asks for no records without a type or a customer', async () => {
      const options = withSetup(() =>
         useIncidentEntityOptions({ entityType: null, customerId: C })
      );
      withSetup(() => useIncidentEntityOptions({ entityType: 'shipment', customerId: null }));
      await flushPromises();
      expect(recorded).toEqual([]);
      expect(options.value).toEqual([]);
   });

   it('lists the customer’s open incidents, newest first', async () => {
      response = [{ id: I, code: 'OL-THO-2026-001', title: 'Late truck' }];
      const options = withSetup(() => useOpenIncidentOptions(C));
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'incident'],
         ['select', 'id, code, title'],
         ['eq', 'customer_id', C],
         ['neq', 'status', 'closed'],
         ['order', 'opened_at', { ascending: false }],
         ['abortSignal', expect.anything()],
         ['throwOnError']
      ]);
      expect(options.value).toEqual([{ value: I, label: 'OL-THO-2026-001 — Late truck' }]);
   });

   it('patches the status only', async () => {
      response = { id: I, status: 'contained' };
      const mutation = withSetup(useSetIncidentStatus);
      await mutation.mutateAsync({ id: I, status: 'contained' });

      expect(recorded).toEqual(
         expect.arrayContaining([
            ['from', 'incident'],
            ['update', { status: 'contained' }],
            ['eq', 'id', I]
         ])
      );
   });
});
