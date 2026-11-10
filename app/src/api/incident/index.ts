import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { ProjectGateRow } from '@/api/project';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { updateRow } from '@/api/saveRow';
import { useTenantKey } from '@/api/useTenantKey';
import { allValues } from '@/lib/enumValues';
import {
   dateOnly,
   optional,
   parseDateOnly,
   required,
   requiredText,
   sensitive
} from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type IncidentStatus = Enums['incident_status'];
export type IncidentSeverity = Enums['incident_severity'];
export type IncidentFamily = Enums['incident_family'];
export type IncidentParty = Enums['incident_party'];
export type IncidentRootCause = Enums['incident_root_cause'];
export type IncidentOutcome = Enums['incident_outcome'];
export type CostPayer = Enums['cost_payer'];
export type IncidentDeadlineKind = Enums['incident_deadline_kind'];
export type IncidentRow = Tables['incident']['Row'];
export type IncidentLogRow = Tables['incident_log']['Row'];
export type IncidentDeadlineRow = Tables['incident_deadline']['Row'];
/**
 * An incident with its customer code, the linked record's label (entity_label), its next open
 * deadline (next_deadline_at), how many open deadlines are past (overdue_deadline_count) and
 * whether the same Y10 card hit the customer in the 90 days before it opened (is_repeat).
 */
export type IncidentOverviewRow = Views['incident_overview']['Row'];

/** An incident as its card loads it (INCIDENT_SELECT): the gates it rolled back too. */
export type IncidentCard = IncidentRow & {
   customer: Pick<Tables['customer']['Row'], 'code' | 'display_name'> | null;
   incident_log: IncidentLogRow[];
   incident_deadline: IncidentDeadlineRow[];
   project_gate: Pick<ProjectGateRow, 'id' | 'code' | 'status' | 'project_id'>[];
};

// --- constants ---

export const INCIDENT_STATUSES = allValues<IncidentStatus>()(['open', 'contained', 'closed']);

export const INCIDENT_SEVERITIES = allValues<IncidentSeverity>()(['s1', 's2', 's3']);

export const INCIDENT_FAMILIES = allValues<IncidentFamily>()(['ol', 'oa', 'ou', 'ot', 'om']);

export const INCIDENT_PARTIES = allValues<IncidentParty>()([
   'customer',
   'supplier',
   'forwarder',
   'platform',
   'warehouse'
]);

export const INCIDENT_ROOT_CAUSES = allValues<IncidentRootCause>()([
   'human_error',
   'document_data',
   'communication',
   'supplier',
   'carrier',
   'platform_regulation',
   'customer'
]);

export const INCIDENT_OUTCOMES = allValues<IncidentOutcome>()([
   'full_recovery',
   'partial_recovery',
   'loss'
]);

export const COST_PAYERS = allValues<CostPayer>()([
   'company',
   'customer',
   'supplier',
   'carrier_insurance'
]);

export const INCIDENT_DEADLINE_KINDS = allValues<IncidentDeadlineKind>()([
   'supplier_damage',
   'carrier_claim',
   'demurrage',
   'supplier_storage',
   'platform_escalation',
   'document_request',
   'other'
]);

/**
 * The deadlines the database calculates from the incident's opening when no due time is given
 * (incident_deadline_defaults, 035): 48 hours, 7 days, 48 hours, the document request days.
 */
export const INCIDENT_DEADLINE_DEFAULTS = [
   'supplier_damage',
   'carrier_claim',
   'platform_escalation',
   'document_request'
] as const satisfies readonly IncidentDeadlineKind[];

/** The records an incident may be linked to (incident_entity_kind). */
export const INCIDENT_ENTITY_TYPES = [
   'project',
   'purchase_order',
   'shipment',
   'product',
   'market_cell'
] as const satisfies readonly Enums['document_entity'][];
export type IncidentEntityType = (typeof INCIDENT_ENTITY_TYPES)[number];

/** The 42 Y10 cards (incident_type_format), by family: OL, OA, OU, OT, OM. */
export const INCIDENT_TYPES = [
   'OL-01',
   'OL-02',
   'OL-03',
   'OL-04',
   'OL-05',
   'OL-06',
   'OL-07',
   'OL-08',
   'OL-09',
   'OL-10',
   'OL-11',
   'OL-12',
   'OA-01',
   'OA-02',
   'OA-03',
   'OA-04',
   'OA-05',
   'OA-06',
   'OA-07',
   'OA-08',
   'OA-09',
   'OA-10',
   'OU-01',
   'OU-02',
   'OU-03',
   'OU-04',
   'OU-05',
   'OU-06',
   'OT-01',
   'OT-02',
   'OT-03',
   'OT-04',
   'OT-05',
   'OT-06',
   'OT-07',
   'OT-08',
   'OM-01',
   'OM-02',
   'OM-03',
   'OM-04',
   'OM-05',
   'OM-06'
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** The Tag severity of each incident severity (Y10 §4). */
export const INCIDENT_SEVERITY_SEVERITY: Record<IncidentSeverity, 'danger' | 'warn' | 'info'> = {
   s1: 'danger',
   s2: 'warn',
   s3: 'info'
};

const typePrefix = (family: IncidentFamily) => `${family.toUpperCase()}-`;

/** The Y10 cards of a family, in order (incident_type_family: the card's prefix is the family). */
export const incidentTypesOf = (family: IncidentFamily): IncidentType[] =>
   INCIDENT_TYPES.filter((type) => type.startsWith(typePrefix(family)));

// --- status flow ---

/** The transitions of private.incident_guard (035, rule 4); closed is final. */
const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
   open: ['contained', 'closed'],
   contained: ['closed'],
   closed: []
};

export const nextIncidentStatuses = (status: IncidentStatus): IncidentStatus[] => [
   ...NEXT_STATUSES[status]
];

export type IncidentStatusHint =
   | 'incident_management_notice_required'
   | 'incident_closure_incomplete'
   | 'incident_close_management';

/**
 * What a move to `status` would break (035, rules 5–6), as errors.<code> keys in the guard's
 * order: an s1 or s2 leaves open only once management was told (an incident whose `status` is
 * given and is not open has already left it); closing needs the outcome, the root cause and a
 * preventive action, and only management (`canCloseS1`: update on public.tenant) closes an s1.
 * A display hint only; the database decides.
 */
export function incidentStatusHints(
   incident: Pick<
      IncidentRow,
      'severity' | 'management_notified_at' | 'outcome' | 'root_cause' | 'preventive_action'
   > & { status?: IncidentStatus | null },
   status: IncidentStatus,
   canCloseS1: boolean
): IncidentStatusHint[] {
   if (status === 'open') return [];
   const hints: IncidentStatusHint[] = [];
   const leavesOpen = !incident.status || incident.status === 'open';
   if (leavesOpen && incident.severity !== 's3' && !incident.management_notified_at)
      hints.push('incident_management_notice_required');
   if (status === 'closed') {
      if (!incident.outcome || !incident.root_cause || !incident.preventive_action?.trim())
         hints.push('incident_closure_incomplete');
      if (incident.severity === 's1' && !canCloseS1) hints.push('incident_close_management');
   }
   return hints;
}

/**
 * Lowering an s1 or s2 (s1 < s2 < s3) needs the management right (`isManagement`: update on
 * public.tenant), so a downgrade does not get around the notice or the s1 closure (035,
 * incident_severity_downgrade_requires_management). A display hint only; the database decides.
 */
export function incidentSeverityHints(
   from: IncidentSeverity,
   to: IncidentSeverity,
   isManagement: boolean
): 'incident_severity_downgrade_requires_management'[] {
   const lowered =
      from !== 's3' && INCIDENT_SEVERITIES.indexOf(to) > INCIDENT_SEVERITIES.indexOf(from);
   return lowered && !isManagement ? ['incident_severity_downgrade_requires_management'] : [];
}

/**
 * Where the first notice to the customer stands: none due (s3), done, past its due time (late)
 * or still due.
 */
export function customerNoticeState(
   row: Pick<IncidentRow, 'customer_notice_due_at' | 'customer_notified_at'>,
   now: Date
): 'none' | 'done' | 'late' | 'due' {
   if (row.customer_notified_at) return 'done';
   if (!row.customer_notice_due_at) return 'none';
   return new Date(row.customer_notice_due_at).getTime() < now.getTime() ? 'late' : 'due';
}

// --- incident ---

/** The card's incident, its customer, log, deadlines and the gates it rolled back. */
export const INCIDENT_SELECT =
   '*, customer!incident_customer_fkey(code, display_name), incident_log!incident_log_incident_fkey(*), incident_deadline!incident_deadline_incident_fkey(*), project_gate!project_gate_rollback_incident_fkey(id, code, status, project_id)';

export const incidentResource = defineResource<'incident', IncidentCard>('incident', {
   select: INCIDENT_SELECT
});

/** The incident's overview row (codes, linked record, deadlines, repeat). */
export function useIncidentOverview(id: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantKey.value, 'incident_overview', toValue(id))),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('incident_overview')
            .select('*')
            .eq('id', toValue(id)!)
            .abortSignal(signal)
            .maybeSingle()
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(id))
   });
}

export type IncidentOption = { value: string; label: string };

/** The table each linked record's options are read from. */
const ENTITY_TABLES = {
   project: 'project',
   purchase_order: 'purchase_order',
   shipment: 'shipment',
   product: 'product',
   market_cell: 'market_cell_overview'
} as const satisfies Record<IncidentEntityType, string>;

const fetchEntityOptions = async (
   entityType: IncidentEntityType,
   customerId: string,
   signal: AbortSignal
): Promise<IncidentOption[]> => {
   switch (entityType) {
      case 'project': {
         const { data } = await supabase
            .from('project')
            .select('id, code, display_name')
            .eq('customer_id', customerId)
            .order('code')
            .abortSignal(signal)
            .throwOnError();
         return data.map(({ id, code, display_name }) => ({
            value: id,
            label: `${code ?? ''} — ${display_name}`
         }));
      }
      case 'purchase_order':
      case 'shipment': {
         const { data } = await supabase
            .from(entityType)
            .select('id, code')
            .eq('customer_id', customerId)
            .order('code')
            .abortSignal(signal)
            .throwOnError();
         return data.map(({ id, code }) => ({ value: id, label: code ?? '' }));
      }
      case 'product': {
         const { data } = await supabase
            .from('product')
            .select('id, sku, display_name')
            .eq('customer_id', customerId)
            .order('sku')
            .abortSignal(signal)
            .throwOnError();
         return data.map(({ id, sku, display_name }) => ({
            value: id,
            label: `${sku} — ${display_name}`
         }));
      }
      case 'market_cell': {
         const { data } = await supabase
            .from('market_cell_overview')
            .select('id, sku, cell_key')
            .eq('customer_id', customerId)
            .order('sku')
            .abortSignal(signal)
            .throwOnError();
         return data.flatMap(({ id, sku, cell_key }) =>
            id ? [{ value: id, label: `${sku ?? ''} · ${cell_key ?? ''}` }] : []
         );
      }
   }
};

/**
 * The customer's records of one type, as options for the incident's linked record: projects
 * `code — name`, orders and shipments by code, products `sku — name`, market cells `sku · cell`.
 */
export function useIncidentEntityOptions(
   params: MaybeRefOrGetter<{ entityType: IncidentEntityType | null; customerId: string | null }>
) {
   const tenantKey = useTenantKey();

   const { data } = useQuery({
      queryKey: computed(() => {
         const { entityType, customerId } = toValue(params);
         return queryKeys.list(
            tenantKey.value,
            entityType ? ENTITY_TABLES[entityType] : 'incident',
            { view: 'incident-options', entityType, customerId }
         );
      }),
      queryFn: ({ signal }) => {
         const { entityType, customerId } = toValue(params);
         return fetchEntityOptions(entityType!, customerId!, signal);
      },
      enabled: computed(() => {
         const { entityType, customerId } = toValue(params);
         return !!entityType && !!customerId;
      })
   });

   return computed(() => data.value ?? []);
}

/**
 * The customer's incidents that are not closed, newest first, as `code — title` options: what a
 * gate rollback (036) may name.
 */
export function useOpenIncidentOptions(customerId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   const { data } = useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'incident', {
            view: 'open-options',
            customerId: toValue(customerId)
         })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('incident')
            .select('id, code, title')
            .eq('customer_id', toValue(customerId)!)
            .neq('status', 'closed')
            .order('opened_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data.map(({ id, code, title }) => ({
            value: id,
            label: `${code ?? ''} — ${title}`
         }));
      },
      enabled: computed(() => !!toValue(customerId))
   });

   return computed(() => data.value ?? []);
}

const text = () => optional(z.string().trim());
const parseInstant = (value?: string | null) => (value ? new Date(value) : null);
const toInstant = (value: Date | null | undefined) => value?.toISOString() ?? null;

export const incidentSchema = z
   .object({
      id: z.string().optional(),
      customer_id: required(z.uuid()),
      family: required(z.enum(INCIDENT_FAMILIES)),
      severity: required(z.enum(INCIDENT_SEVERITIES)),
      incident_type: optional(z.enum(INCIDENT_TYPES)),
      title: requiredText(),
      what_happened: requiredText(),
      reported_by: text(),
      current_state: text(),
      immediate_action: text(),
      root_cause_note: text(),
      impact_note: text(),
      lessons: text(),
      preventive_action: text(),
      entity_type: optional(z.enum(INCIDENT_ENTITY_TYPES)),
      entity_id: optional(z.uuid()),
      owner_id: optional(z.uuid()),
      affected_parties: sensitive(
         'incident',
         'affected_parties',
         z.array(z.enum(INCIDENT_PARTIES)).default([])
      ),
      opened_at: optional(z.date()),
      management_notified_at: optional(z.date()),
      customer_notified_at: optional(z.date()),
      outcome: optional(z.enum(INCIDENT_OUTCOMES)),
      root_cause: optional(z.enum(INCIDENT_ROOT_CAUSES)),
      customer_closure_notified_on: optional(dateOnly())
   })
   // Mirrors incident_entity_pair and incident_type_family, so they show before saving.
   .superRefine((incident, ctx) => {
      if (!incident.entity_type !== !incident.entity_id)
         ctx.addIssue({
            code: 'custom',
            path: ['entity_id'],
            message: i18n.t('errors.incident_entity_invalid')
         });
      if (
         incident.incident_type &&
         incident.family &&
         !incident.incident_type.startsWith(typePrefix(incident.family))
      )
         ctx.addIssue({
            code: 'custom',
            path: ['incident_type'],
            message: i18n.t('errors.incident_type_family')
         });
   });

export type IncidentFormValues = z.input<typeof incidentSchema>;
export type IncidentValues = z.output<typeof incidentSchema>;

export const toIncidentFormValues = (
   incident?: Partial<IncidentRow> | null
): IncidentFormValues => ({
   id: incident?.id ?? undefined,
   customer_id: incident?.customer_id ?? null,
   family: incident?.family ?? null,
   severity: incident?.severity ?? null,
   incident_type: (incident?.incident_type ?? null) as IncidentFormValues['incident_type'],
   title: incident?.title ?? '',
   what_happened: incident?.what_happened ?? '',
   reported_by: incident?.reported_by ?? '',
   current_state: incident?.current_state ?? '',
   immediate_action: incident?.immediate_action ?? '',
   root_cause_note: incident?.root_cause_note ?? '',
   impact_note: incident?.impact_note ?? '',
   lessons: incident?.lessons ?? '',
   preventive_action: incident?.preventive_action ?? '',
   entity_type: (incident?.entity_type ?? null) as IncidentFormValues['entity_type'],
   entity_id: incident?.entity_id ?? null,
   owner_id: incident?.owner_id ?? null,
   affected_parties: incident?.affected_parties ?? [],
   opened_at: parseInstant(incident?.opened_at),
   management_notified_at: parseInstant(incident?.management_notified_at),
   customer_notified_at: parseInstant(incident?.customer_notified_at),
   outcome: incident?.outcome ?? null,
   root_cause: incident?.root_cause ?? null,
   customer_closure_notified_on: parseDateOnly(incident?.customer_closure_notified_on)
});

/**
 * The row to save, every empty field as NULL (the guard's closing rule tests IS NULL). The code,
 * the status (useSetIncidentStatus), the customer notice due time and the closing columns are the
 * database's; the customer and the family never change, so they go with a new incident only. The
 * opening time goes only when set: the database stamps a new incident's with now().
 */
export function toIncidentPayload(
   { id: valuesId, customer_id, family, opened_at, ...values }: IncidentValues,
   id?: string | null
): ResourceInput<'incident'> {
   const rowId = id ?? valuesId;
   const editable = {
      severity: values.severity,
      incident_type: values.incident_type ?? null,
      title: values.title,
      what_happened: values.what_happened,
      reported_by: values.reported_by ?? null,
      current_state: values.current_state ?? null,
      immediate_action: values.immediate_action ?? null,
      root_cause_note: values.root_cause_note ?? null,
      impact_note: values.impact_note ?? null,
      lessons: values.lessons ?? null,
      preventive_action: values.preventive_action ?? null,
      entity_type: values.entity_type ?? null,
      entity_id: values.entity_id ?? null,
      owner_id: values.owner_id ?? null,
      affected_parties: values.affected_parties,
      ...(opened_at ? { opened_at: opened_at.toISOString() } : {}),
      management_notified_at: toInstant(values.management_notified_at),
      customer_notified_at: toInstant(values.customer_notified_at),
      outcome: values.outcome ?? null,
      root_cause: values.root_cause ?? null,
      customer_closure_notified_on: values.customer_closure_notified_on ?? null
   };
   if (rowId) return { id: rowId, ...editable } as ResourceInput<'incident'>;
   return { ...editable, customer_id, family };
}

/** Moves an incident to another status; the database checks the flow and its data (035). */
export function useSetIncidentStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ id, status }: { id: string; status: IncidentStatus }) =>
         updateRow('incident', id, { status }),
      onSuccess: () => invalidateTables(queryClient, ['incident'])
   });
}

// --- log ---

export const incidentLogResource = defineResource('incident_log');

export const incidentLogSchema = z
   .object({
      id: z.string().optional(),
      incident_id: z.uuid(),
      logged_at: z.date(),
      note: sensitive('incident_log', 'note', requiredText()),
      counterparty: text(),
      decision: text(),
      cost_amount: optional(z.number().min(0)),
      cost_currency: optional(
         z
            .string()
            .trim()
            .regex(/^[A-Z]{3}$/)
      ),
      cost_payer: optional(z.enum(COST_PAYERS)),
      customer_approved: z.boolean().default(false)
   })
   // Mirrors incident_log_cost_complete: a cost has its amount, currency and payer, or none.
   .superRefine((line, ctx) => {
      const set = [line.cost_amount, line.cost_currency, line.cost_payer].filter(
         (value) => value !== null && value !== undefined
      ).length;
      if (set !== 0 && set !== 3)
         ctx.addIssue({
            code: 'custom',
            path: ['cost_amount'],
            message: i18n.t('errors.incident_log_cost_incomplete')
         });
   });

export type IncidentLogFormValues = z.input<typeof incidentLogSchema>;

/** A new line is logged now. */
export const toIncidentLogFormValues = (
   line?: Partial<IncidentLogRow> | null
): IncidentLogFormValues => ({
   id: line?.id ?? undefined,
   incident_id: line?.incident_id ?? '',
   logged_at: parseInstant(line?.logged_at) ?? new Date(),
   note: line?.note ?? '',
   counterparty: line?.counterparty ?? '',
   decision: line?.decision ?? '',
   cost_amount: line?.cost_amount ?? null,
   cost_currency: line?.cost_currency ?? '',
   cost_payer: line?.cost_payer ?? null,
   customer_approved: line?.customer_approved ?? false
});

/**
 * The line to save, empty fields as NULL. A line stays on its incident, so the incident goes with
 * a new line only; the author is the database's (auth.uid()).
 */
export const toIncidentLogPayload = ({
   id,
   incident_id,
   ...values
}: z.output<typeof incidentLogSchema>): ResourceInput<'incident_log'> => {
   const editable = {
      logged_at: values.logged_at.toISOString(),
      note: values.note,
      counterparty: values.counterparty ?? null,
      decision: values.decision ?? null,
      cost_amount: values.cost_amount ?? null,
      cost_currency: values.cost_currency ?? null,
      cost_payer: values.cost_payer ?? null,
      customer_approved: values.customer_approved
   };
   if (id) return { id, ...editable } as ResourceInput<'incident_log'>;
   return { incident_id, ...editable };
};

// --- deadlines ---

export const incidentDeadlineResource = defineResource('incident_deadline');

const DEFAULTED_KINDS: readonly IncidentDeadlineKind[] = INCIDENT_DEADLINE_DEFAULTS;

export const incidentDeadlineSchema = z
   .object({
      id: z.string().optional(),
      incident_id: z.uuid(),
      kind: required(z.enum(INCIDENT_DEADLINE_KINDS)),
      label: text(),
      due_at: optional(z.date()),
      met_at: optional(z.date())
   })
   // Only the INCIDENT_DEADLINE_DEFAULTS are calculated; the others need their due time (23502).
   .superRefine((deadline, ctx) => {
      if (!deadline.due_at && deadline.kind && !DEFAULTED_KINDS.includes(deadline.kind))
         ctx.addIssue({
            code: 'custom',
            path: ['due_at'],
            message: i18n.t('errors.incident_deadline_due_required')
         });
   });

export type IncidentDeadlineFormValues = z.input<typeof incidentDeadlineSchema>;

export const toIncidentDeadlineFormValues = (
   deadline?: Partial<IncidentDeadlineRow> | null
): IncidentDeadlineFormValues => ({
   id: deadline?.id ?? undefined,
   incident_id: deadline?.incident_id ?? '',
   kind: deadline?.kind ?? null,
   label: deadline?.label ?? '',
   due_at: parseInstant(deadline?.due_at),
   met_at: parseInstant(deadline?.met_at)
});

/**
 * The deadline to save. An empty due time is left out, so the database fills it
 * (incident_deadline_defaults); the incident goes with a new deadline only.
 */
export const toIncidentDeadlinePayload = ({
   id,
   incident_id,
   due_at,
   ...values
}: z.output<typeof incidentDeadlineSchema>): ResourceInput<'incident_deadline'> => {
   const editable = {
      kind: values.kind,
      label: values.label ?? null,
      ...(due_at ? { due_at: due_at.toISOString() } : {}),
      met_at: toInstant(values.met_at)
   };
   // due_at is NOT NULL, but the database fills an empty one for the calculated kinds.
   if (id) return { id, ...editable } as ResourceInput<'incident_deadline'>;
   return { incident_id, ...editable } as ResourceInput<'incident_deadline'>;
};
