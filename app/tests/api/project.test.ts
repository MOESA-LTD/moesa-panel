import {
   GATE_CLOSES_PHASE,
   PHASES_FOR_PATH,
   projectPhases,
   projectSchema,
   toProjectFormValues,
   toProjectPayload,
   useRollbackGate,
   type ProjectGateRow
} from '@/api/project';
import i18n from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const rpc = vi.hoisted(() =>
   vi.fn(() => ({ throwOnError: () => Promise.resolve({ data: null, error: null }) }))
);
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, publicSchema: { rpc } }));

const CUSTOMER = '6f1c2b0e-8f4a-4d6e-9a51-2b7c3d4e5f60';

const gate = (code: ProjectGateRow['code'], position: number) =>
   ({ id: code, code, position, status: 'pending' }) as ProjectGateRow;

describe('project form', () => {
   const parse = (values: Partial<ReturnType<typeof toProjectFormValues>>) =>
      projectSchema.safeParse({
         ...toProjectFormValues({ customer_id: CUSTOMER, display_name: 'Mop launch' }),
         ...values
      });

   it('needs a path for a new product (npi)', () => {
      const result = parse({ type: 'npi', path: null });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ path, message }) => [path[0], message])).toEqual([
         ['path', i18n.t('form.required')]
      ]);
      expect(parse({ type: 'npi', path: 'a_sourcing' }).success).toBe(true);
   });

   it('takes no path for the other types', () => {
      const result = parse({ type: 'reorder', path: 'b_private_label' });
      expect(result.success).toBe(true);
      expect(result.success && toProjectPayload(result.data).path).toBeNull();
   });

   it('needs a customer and a name', () => {
      expect(parse({ customer_id: null }).success).toBe(false);
      expect(parse({ display_name: '' }).success).toBe(false);
   });

   it('sends no fixed field when editing', () => {
      const result = parse({ id: 'p1', type: 'npi', path: 'a_sourcing', packages: ['A1'] });
      expect(result.success).toBe(true);
      const payload = result.success ? toProjectPayload(result.data) : {};
      expect(payload).not.toHaveProperty('customer_id');
      expect(payload).not.toHaveProperty('type');
      expect(payload).not.toHaveProperty('path');
      expect(payload).not.toHaveProperty('packages');
      expect(payload).toMatchObject({ id: 'p1', display_name: 'Mop launch' });
   });
});

describe('phases', () => {
   it('runs path A through P1–P6 and the listing phases', () => {
      expect(PHASES_FOR_PATH('a_sourcing')).toEqual([
         'P1',
         'P2',
         'P3',
         'P4',
         'P5',
         'P6',
         'L1',
         'L2',
         'L3',
         'L4',
         'L5'
      ]);
      // Projects without a path (variant, revision, reorder) follow path A.
      expect(PHASES_FOR_PATH(null)).toEqual(PHASES_FOR_PATH('a_sourcing'));
   });

   it('runs path B through the private label phases instead of P2', () => {
      const phases = PHASES_FOR_PATH('b_private_label');
      expect(phases).toEqual(
         expect.arrayContaining(['PL1', 'PL2', 'PL3', 'PL4', 'PL5', 'PL6', 'PL7'])
      );
      expect(phases).not.toContain('P2');
      expect(phases.indexOf('PL7')).toBeLessThan(phases.indexOf('P3'));
   });

   it('knows the phase each gate closes (public.phase_before)', () => {
      expect(GATE_CLOSES_PHASE).toEqual({
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
      });
   });

   it("shows a project's phases from its start up to its last gate, then closed", () => {
      const npi = ['G1', 'G2', 'G3', 'G4', 'G5'] as const;
      expect(projectPhases('a_sourcing', npi.map(gate))).toEqual([
         'P1',
         'P2',
         'P3',
         'P4',
         'P5',
         'P6',
         'closed'
      ]);
      const reorder = ['G3', 'G4', 'G5', 'L_G1', 'L_G2'] as const;
      expect(projectPhases(null, reorder.map(gate))).toEqual([
         'P3',
         'P4',
         'P5',
         'P6',
         'L1',
         'L2',
         'L3',
         'L4',
         'L5',
         'closed'
      ]);
      // An A0-only project runs the private label concept phases whatever its path.
      expect(projectPhases(null, [gate('PL_G1', 1), gate('PL_G2', 2)])).toEqual([
         'PL1',
         'PL2',
         'PL3',
         'closed'
      ]);
   });
});

describe('gate rollback', () => {
   const I1 = '00000000-0000-4000-8000-000000000011';
   const G1 = '00000000-0000-4000-8000-000000000021';

   it('rolls a gate back through an incident', async () => {
      let mutation!: ReturnType<typeof useRollbackGate>;
      mount(
         defineComponent({
            setup() {
               mutation = useRollbackGate();
               return () => h('div');
            }
         }),
         { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
      );

      await mutation.mutateAsync({ gateId: G1, reason: 'brief changed', incidentId: I1 });

      expect(rpc).toHaveBeenCalledWith('rollback_gate', {
         gate_id: G1,
         reason: 'brief changed',
         incident_id: I1
      });
   });
});
