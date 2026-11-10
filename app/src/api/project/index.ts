import { allValues } from '@/lib/enumValues';
import { PACKAGES } from '@/api/customer';
import { defineResource, type ResourceInput } from '@/api/defineResource';
import { invalidateTables } from '@/api/queryKeys';
import { useLookup } from '@/api/useLookup';
import { dateOnly, optional, parseDateOnly, required, requiredText } from '@/lib/form/fields';
import { publicSchema, supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type ProjectType = Enums['project_type'];
export type ProjectPath = Enums['project_path'];
export type ProjectStatus = Enums['project_status'];
export type ProjectPhase = Enums['project_phase'];
export type GateCode = Enums['gate_code'];
export type GateStatus = Enums['gate_status'];
export type TaskStatus = Enums['task_status'];
export type ProjectRow = Tables['project']['Row'];
export type ProjectGateRow = Tables['project_gate']['Row'];
export type ProjectTaskRow = Tables['project_task']['Row'];
export type ProjectProductRow = Tables['project_product']['Row'];

/** A project as its card loads it: with its customer, gates and linked products. */
export type ProjectCard = ProjectRow & {
   customer: Pick<Tables['customer']['Row'], 'code' | 'display_name'> | null;
   project_gate: ProjectGateRow[];
   project_product: {
      product: Pick<Tables['product']['Row'], 'id' | 'sku' | 'display_name'> | null;
   }[];
};

export const PROJECT_TYPES = allValues<ProjectType>()(['npi', 'variant', 'revision', 'reorder']);

export const PROJECT_PATHS = allValues<ProjectPath>()(['a_sourcing', 'b_private_label']);

export const PROJECT_STATUSES = [
   'active',
   'on_hold',
   'closed',
   'cancelled'
] as const satisfies readonly ProjectStatus[];

export const TASK_STATUSES = allValues<TaskStatus>()(['todo', 'doing', 'done', 'blocked']);

/** Who does a task (checked by the database too). */
export const TASK_ROLES = [
   'coordinator',
   'supply_qc',
   'compliance',
   'content_listing',
   'logistics',
   'finance',
   'management'
] as const;

// --- phases and gates ---

/** Every phase a project works in, in order (the enum without closed): what tasks belong to. */
export const WORK_PHASES = [
   'P1',
   'P2',
   'PL1',
   'PL2',
   'PL3',
   'PL4',
   'PL5',
   'PL6',
   'PL7',
   'P3',
   'P4',
   'P5',
   'P6',
   'L1',
   'L2',
   'L3',
   'L4',
   'L5'
] as const satisfies readonly ProjectPhase[];

/**
 * The phases of a path in order: A skips the private label phases, B replaces P2 with them.
 * Projects without a path (variant, revision, reorder) follow A.
 */
export const PHASES_FOR_PATH = (path: ProjectPath | null): ProjectPhase[] =>
   WORK_PHASES.filter((phase) =>
      path === 'b_private_label' ? phase !== 'P2' : !phase.startsWith('PL')
   );

/** The phase each gate closes (public.phase_before). */
export const GATE_CLOSES_PHASE: Record<GateCode, ProjectPhase> = {
   G1: 'P1',
   G2: 'P2',
   PL_G1: 'PL2',
   PL_G2: 'PL3',
   PL_G3: 'PL5',
   PL_G4: 'PL6',
   G3: 'P3',
   G4: 'P4',
   G5: 'P6',
   L_G1: 'L3',
   L_G2: 'L5'
};

/** Every gate code (the keys above), for the glossary and pickers. */
export const GATE_CODES = Object.keys(GATE_CLOSES_PHASE) as [GateCode, ...GateCode[]];

/** Where a project whose first gate this is starts, when not the phase it closes (initial_phase). */
const STARTS_AT: Partial<Record<GateCode, ProjectPhase>> = { PL_G1: 'PL1', G5: 'P5' };

/** Gates in their order (position). */
export const byPosition = <G extends Pick<ProjectGateRow, 'position'>>(gates: readonly G[]) =>
   [...gates].sort((a, b) => a.position - b.position);

/**
 * The phases a project goes through: from the one it starts in up to the one its last gate
 * closes, then closed. The private label gates run on path B whatever the project's path.
 */
export function projectPhases(
   path: ProjectPath | null,
   gates: readonly Pick<ProjectGateRow, 'code' | 'position'>[]
): ProjectPhase[] {
   const ordered = byPosition(gates);
   const first = ordered[0]?.code;
   const last = ordered.at(-1)?.code;
   const phases = PHASES_FOR_PATH(
      ordered.some(({ code }) => code.startsWith('PL_')) ? 'b_private_label' : path
   );
   if (!first || !last) return [...phases, 'closed'];

   const start = phases.indexOf(STARTS_AT[first] ?? GATE_CLOSES_PHASE[first]);
   const end = phases.indexOf(GATE_CLOSES_PHASE[last]);
   return [...phases.slice(Math.max(start, 0), end + 1), 'closed'];
}

/** The first gate not passed: the one the project waits for. */
export const openGate = <G extends Pick<ProjectGateRow, 'position' | 'status'>>(
   gates: readonly G[]
) => byPosition(gates).find(({ status }) => status !== 'passed');

// --- project ---

export const projectResource = defineResource<'project', ProjectCard>('project', {
   select:
      '*, customer(code, display_name), project_gate(*), project_product(product(id, sku, display_name))'
});

const text = () => optional(z.string().trim());

export const projectSchema = z
   .object({
      id: z.string().optional(),
      customer_id: required(z.uuid()),
      display_name: requiredText(),
      type: z.enum(PROJECT_TYPES),
      path: optional(z.enum(PROJECT_PATHS)),
      packages: z.array(z.enum(PACKAGES)),
      status: z.enum(PROJECT_STATUSES).default('active'),
      target_delivery_on: optional(dateOnly()),
      target_live_on: optional(dateOnly()),
      coordinator_id: optional(z.uuid()),
      notes: text()
   })
   // A new product's project (npi) follows path A or B.
   .superRefine((project, ctx) => {
      if (project.type === 'npi' && !project.path)
         ctx.addIssue({ code: 'custom', path: ['path'], message: i18n.t('form.required') });
   });

export type ProjectFormValues = z.input<typeof projectSchema>;

export const toProjectFormValues = (project?: Partial<ProjectRow> | null): ProjectFormValues => ({
   id: project?.id ?? undefined,
   customer_id: project?.customer_id ?? null,
   display_name: project?.display_name ?? '',
   type: project?.type ?? 'npi',
   path: project?.path ?? null,
   packages: (project?.packages ?? []) as (typeof PACKAGES)[number][],
   status: project?.status ?? 'active',
   target_delivery_on: parseDateOnly(project?.target_delivery_on),
   target_live_on: parseDateOnly(project?.target_live_on),
   coordinator_id: project?.coordinator_id ?? null,
   notes: project?.notes ?? ''
});

/**
 * The row to save, empty fields as null. The customer, type, path and packages decide the gates and
 * never change, so they are sent for a new project only; only an npi project has a path.
 */
export const toProjectPayload = ({
   id,
   customer_id,
   type,
   path,
   packages,
   ...values
}: z.output<typeof projectSchema>): ResourceInput<'project'> => {
   const editable = {
      display_name: values.display_name,
      status: values.status,
      target_delivery_on: values.target_delivery_on ?? null,
      target_live_on: values.target_live_on ?? null,
      coordinator_id: values.coordinator_id ?? null,
      notes: values.notes ?? null
   };
   // An update needs no customer or type: the row has them.
   if (id) return { id, ...editable } as ResourceInput<'project'>;
   return {
      ...editable,
      customer_id,
      type,
      path: type === 'npi' ? (path ?? null) : null,
      packages
   };
};

// --- people ---

export type MemberOption = Pick<Views['tenant_member']['Row'], 'id' | 'email' | 'user_metadata'>;

/** The branch's members (coordinators, assignees), each once, labelled by name. */
export function useMemberOptions() {
   const { data } = useLookup<MemberOption>('tenant_member', {
      select: 'id, email, user_metadata'
   });
   return computed(() => {
      const members = new Map<string, string>();
      for (const { id, email, user_metadata } of data.value ?? []) {
         const name = (user_metadata as { display_name?: string } | null)?.display_name;
         if (id && !members.has(id)) members.set(id, name || email || id);
      }
      return [...members].map(([value, label]) => ({ value, label }));
   });
}

// --- gates ---

export type PassGateInput = {
   gateId: string;
   note: string;
   customerApprovedOn?: string | null;
   approvalDocumentId?: string | null;
   evidenceDocumentIds?: string[];
};

/**
 * The entities whose documents a gate may cite (032_gate_links.sql): the gate, its project, the
 * project's purchase orders and the shipments of those orders.
 */
export const gateEvidenceEntityIds = ({
   gateId,
   projectId,
   purchaseOrderIds,
   shipmentIds
}: {
   gateId: string;
   projectId: string;
   purchaseOrderIds: readonly string[];
   shipmentIds: readonly string[];
}): string[] => [gateId, projectId, ...purchaseOrderIds, ...shipmentIds];

/**
 * The project's purchase orders and the shipments linked to them, as id lists. The shipments are
 * looked up only once there are orders: an empty `in` is skipped and would match every link.
 */
export function useProjectOperations(
   projectId: MaybeRefOrGetter<string>,
   /** Loads only while true, e.g. while the pass dialog is open. */
   enabled: MaybeRefOrGetter<boolean> = true
) {
   const { data: orders } = useLookup<{ id: string }>(
      'purchase_order',
      () => ({ select: 'id', in: { column: 'project_id', values: [toValue(projectId)] } }),
      () => toValue(enabled) && !!toValue(projectId)
   );
   const purchaseOrderIds = computed(() => (orders.value ?? []).map(({ id }) => id));

   const { data: links } = useLookup<{ shipment_id: string }>(
      'shipment_purchase_order',
      () => ({
         select: 'shipment_id',
         in: { column: 'purchase_order_id', values: purchaseOrderIds.value }
      }),
      () => toValue(enabled) && purchaseOrderIds.value.length > 0
   );
   const shipmentIds = computed(() =>
      purchaseOrderIds.value.length
         ? [...new Set((links.value ?? []).map(({ shipment_id }) => shipment_id))]
         : []
   );

   return { purchaseOrderIds, shipmentIds };
}

// Passing or rolling back a gate moves the project's phase and may add its checklists.
const GATE_TABLES = ['project_gate', 'project', 'project_task'] as const;

/** Passes a gate; the database checks its rules (see 021_projects.sql). */
export function usePassGate() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (input: PassGateInput) => {
         const { data } = await publicSchema
            .rpc('pass_gate', {
               gate_id: input.gateId,
               note: input.note,
               customer_approved_on: input.customerApprovedOn ?? undefined,
               approval_document_id: input.approvalDocumentId ?? undefined,
               evidence_document_ids: input.evidenceDocumentIds ?? []
            })
            .throwOnError();
         return data;
      },
      onSuccess: () => invalidateTables(queryClient, GATE_TABLES)
   });
}

export type RollbackGateInput = { gateId: string; reason: string; incidentId: string };

/**
 * Rolls a gate back, and every later passed gate with it, through an open incident of the
 * project's customer (036): the incident lists the gates it rolled back.
 */
export function useRollbackGate() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ gateId, reason, incidentId }: RollbackGateInput) => {
         const { data } = await publicSchema
            .rpc('rollback_gate', { gate_id: gateId, reason, incident_id: incidentId })
            .throwOnError();
         return data;
      },
      onSuccess: () => invalidateTables(queryClient, [...GATE_TABLES, 'incident'])
   });
}

// --- tasks ---

export const projectTaskResource = defineResource('project_task');

export const projectTaskSchema = z.object({
   id: z.string().optional(),
   project_id: z.string().min(1),
   phase: z.enum(WORK_PHASES),
   display_name: requiredText(),
   role: optional(z.enum(TASK_ROLES)),
   assignee_id: optional(z.uuid()),
   due_on: optional(dateOnly()),
   status: z.enum(TASK_STATUSES).default('todo'),
   blocks_gate: z.boolean(),
   position: z.number().int().min(0)
});

export type ProjectTaskFormValues = z.input<typeof projectTaskSchema>;

export const toProjectTaskFormValues = (
   task?: Partial<ProjectTaskRow> | null
): ProjectTaskFormValues => ({
   id: task?.id ?? undefined,
   project_id: task?.project_id ?? '',
   phase: (task?.phase ?? 'P1') as ProjectTaskFormValues['phase'],
   display_name: task?.display_name ?? '',
   role: (task?.role ?? null) as ProjectTaskFormValues['role'],
   assignee_id: task?.assignee_id ?? null,
   due_on: parseDateOnly(task?.due_on),
   status: task?.status ?? 'todo',
   blocks_gate: task?.blocks_gate ?? false,
   position: task?.position ?? 0
});

export const toProjectTaskPayload = ({
   id,
   ...values
}: z.output<typeof projectTaskSchema>): ResourceInput<'project_task'> => ({
   ...(id ? { id } : {}),
   ...values,
   role: values.role ?? null,
   assignee_id: values.assignee_id ?? null,
   due_on: values.due_on ?? null
});

/** Changes a task's status only, e.g. from its row in the checklist. */
export function useSetTaskStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
         await supabase.from('project_task').update({ status }).eq('id', id).throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, ['project_task'])
   });
}

// --- products ---

// The card reads the links embedded in the project.
const LINK_TABLES = ['project_product', 'project'] as const;

/** Links a product to a project, in the project's tenant. */
export function useLinkProduct() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (link: Omit<ProjectProductRow, 'created_at'>) => {
         await supabase.from('project_product').insert(link).throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, LINK_TABLES)
   });
}

export function useUnlinkProduct() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ projectId, productId }: { projectId: string; productId: string }) => {
         await supabase
            .from('project_product')
            .delete()
            .match({ project_id: projectId, product_id: productId })
            .throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, LINK_TABLES)
   });
}
