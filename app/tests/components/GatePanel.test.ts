import '../setup/mockMain';
import { gateEvidenceEntityIds, type ProjectCard, type ProjectGateRow } from '@/api/project';
import GatePanel from '@/components/service-components/gate-panel/GatePanel.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import { ability } from '@/plugins/casl';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref, toValue } from 'vue';

const I1 = '00000000-0000-4000-8000-000000000011';
const G1 = '00000000-0000-4000-8000-000000000021';

const api = vi.hoisted(() => ({
   lookupCalls: [] as { table: string; options: unknown }[],
   operationsFor: [] as unknown[],
   incidentsFor: [] as unknown[],
   incidents: [] as { value: string; label: string }[]
}));
const rollbackGate = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/useLookup', () => ({
   useLookup: (table: string, options: unknown) => {
      api.lookupCalls.push({ table, options });
      return { data: ref(undefined) };
   }
}));
vi.mock('@/api/project', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/project')>()),
   usePassGate: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
   useRollbackGate: () => ({ mutateAsync: rollbackGate, isPending: ref(false) }),
   useProjectOperations: (projectId: unknown) => {
      api.operationsFor.push(toValue(projectId as string));
      return { purchaseOrderIds: ref(['o']), shipmentIds: ref(['s']) };
   }
}));

// The open incidents of the project's customer, as the rollback picker offers them.
vi.mock('@/api/incident', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/incident')>()),
   useOpenIncidentOptions: (customerId: unknown) => {
      api.incidentsFor.push(toValue(customerId as string));
      return computed(() => api.incidents);
   }
}));

const gate = {
   id: 'g',
   project_id: 'p',
   code: 'G3',
   position: 1,
   status: 'pending',
   needs_customer_approval: true,
   evidence_document_ids: []
} as unknown as ProjectGateRow;

const project = {
   id: 'p',
   code: 'THO-2026-001',
   customer_id: 'c',
   project_gate: [gate]
} as unknown as ProjectCard;

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   api.lookupCalls = [];
   api.operationsFor = [];
   api.incidentsFor = [];
   api.incidents = [{ value: I1, label: 'OL-THO-2026-001 — Pallets short' }];
   rollbackGate.mockClear();
   ability.update([{ action: 'manage', subject: 'all' }]);
});

describe('gate evidence', () => {
   it("lists the gate, the project, then the project's orders and shipments", () => {
      expect(
         gateEvidenceEntityIds({
            gateId: 'g',
            projectId: 'p',
            purchaseOrderIds: ['o'],
            shipmentIds: ['s']
         })
      ).toEqual(['g', 'p', 'o', 's']);
   });

   it("looks up the documents of the gate, the project and the project's operations", async () => {
      mount(GatePanel, {
         props: { gate, project },
         global: {
            plugins: [
               i18NPlugin,
               PrimeVue,
               ToastService,
               [abilitiesPlugin, ability, { useGlobalProperties: true }]
            ] as never,
            directives: { tooltip: {} },
            stubs: { EntityDocuments: true, teleport: true }
         }
      });
      await flushPromises();

      expect(api.operationsFor).toEqual(['p']);
      const documents = api.lookupCalls.find(({ table }) => table === 'document');
      const options = toValue(documents!.options as () => { in: { values: unknown[] } });
      expect(options.in.values).toEqual(['g', 'p', 'o', 's']);
   });
});

describe('gate rollback', () => {
   const passed = { ...gate, id: G1, status: 'passed' } as ProjectGateRow;
   const CustomLink = defineComponent({
      props: ['to'],
      setup:
         (props, { slots }) =>
         () =>
            h(
               'span',
               {
                  'data-link': props.to.name,
                  'data-query': JSON.stringify(props.to.query ?? {})
               },
               slots.default?.({ navigate: () => {} })
            )
   });

   /** The panel of a passed gate with its rollback dialog open and the reason typed. */
   const openRollback = async () => {
      const wrapper = mount(GatePanel, {
         props: { gate: passed, project: { ...project, project_gate: [passed] } as ProjectCard },
         global: {
            plugins: [
               i18NPlugin,
               PrimeVue,
               ToastService,
               [abilitiesPlugin, ability, { useGlobalProperties: true }]
            ] as never,
            directives: { tooltip: {} },
            stubs: { EntityDocuments: true, CustomLink, teleport: true }
         }
      });
      await flushPromises();
      const rollback = wrapper
         .findAll('button')
         .find((button) => button.text() === i18n.t('ops.project.gate_panel.rollback'))!;
      await rollback.trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="rollback-form"] textarea').setValue('brief changed');
      return wrapper;
   };
   const submitButton = (wrapper: Awaited<ReturnType<typeof openRollback>>) =>
      wrapper.find('[data-test="rollback-form"] button[type="submit"]');

   it('needs an incident to roll back', async () => {
      const wrapper = await openRollback();

      expect(api.incidentsFor).toContain('c');
      expect(submitButton(wrapper).attributes('disabled')).toBeDefined();
   });

   it('rolls back with the incident', async () => {
      const wrapper = await openRollback();
      const picker = wrapper
         .findAllComponents({ name: 'Select' })
         .find((select) => select.attributes('data-field') === 'incident_id')!;
      picker.vm.$emit('update:modelValue', I1);
      await flushPromises();
      expect(submitButton(wrapper).attributes('disabled')).toBeUndefined();

      await wrapper.find('[data-test="rollback-form"]').trigger('submit');
      await flushPromises();

      expect(rollbackGate).toHaveBeenCalledTimes(1);
      expect(rollbackGate).toHaveBeenCalledWith({
         gateId: G1,
         reason: 'brief changed',
         incidentId: I1
      });
   });

   it('offers to open an incident when there is none', async () => {
      api.incidents = [];
      const wrapper = await openRollback();

      expect(wrapper.text()).toContain(i18n.t('ops.project.gate_panel.no_incident'));
      const link = wrapper.find('[data-link="ops-incident-manage"]');
      expect(link.exists()).toBe(true);
      expect(JSON.parse(link.attributes('data-query')!)).toMatchObject({
         entity_type: 'project'
      });
   });
});
