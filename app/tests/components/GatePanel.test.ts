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
import { ref, toValue } from 'vue';

const api = vi.hoisted(() => ({
   lookupCalls: [] as { table: string; options: unknown }[],
   operationsFor: [] as unknown[]
}));

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
   useRollbackGate: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
   useProjectOperations: (projectId: unknown) => {
      api.operationsFor.push(toValue(projectId as string));
      return { purchaseOrderIds: ref(['o']), shipmentIds: ref(['s']) };
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
