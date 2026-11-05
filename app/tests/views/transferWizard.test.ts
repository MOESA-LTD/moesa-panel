import '../setup/mockMain';
import type { TransferOptions, TransferReport } from '@/api/transfer';
import en from '@/plugins/i18n/locales/en/index.json';
import ReportStep from '@/views/pages/ops/transfer/ReportStep.vue';
import TargetStep from '@/views/pages/ops/transfer/TargetStep.vue';
import {
   useTransferWizard,
   type TransferWizard
} from '@/views/pages/ops/transfer/useTransferWizard';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

// The transfer API is a stand-in: the options, the rehearsal and the run. The target lookups go
// through the real useLookup to a stand-in query builder, which records the tenant headers.
const api = vi.hoisted(() => ({
   options: null as unknown as TransferOptions,
   rehearse: vi.fn(),
   run: vi.fn(),
   forTenant: [] as (string | null | undefined)[],
   requests: [] as { table: string; headers: Record<string, string>; in: unknown[] }[]
}));

vi.mock('@/api/transfer', async (importOriginal) => {
   const { ref } = await import('vue');
   const original = await importOriginal<typeof import('@/api/transfer')>();
   return {
      ...original,
      useTransferOptions: () => ({ data: ref(api.options), isLoading: ref(false) }),
      useRehearseTransfer: () => ({ mutateAsync: api.rehearse, isPending: ref(false) }),
      useRunTransfer: () => ({ mutateAsync: api.run, isPending: ref(false) })
   };
});
vi.mock('@/api/formTenant', async (importOriginal) => {
   const original = await importOriginal<typeof import('@/api/formTenant')>();
   return {
      ...original,
      forTenant: ((query, tenantId) => {
         api.forTenant.push(tenantId);
         return original.forTenant(query, tenantId);
      }) as typeof original.forTenant
   };
});
vi.mock('@/api/useTenantKey', async () => {
   const { computed } = await import('vue');
   return { useTenantKey: () => computed(() => 'source') };
});
vi.mock('@/composables/useConfirmAction', () => ({
   useConfirmAction:
      () =>
      async ({ accept }: { accept: () => Promise<void> | void }) => {
         await accept();
         return true;
      }
}));
vi.mock('@/lib/supabase', () => ({
   supabase: {
      from: (table: string) => {
         const request = { table, headers: {} as Record<string, string>, in: [] as unknown[] };
         api.requests.push(request);
         const builder: Record<string, unknown> = {
            select: () => builder,
            abortSignal: () => builder,
            order: () => builder,
            in: (column: string, values: unknown[]) => {
               request.in.push([column, values]);
               return builder;
            },
            setHeader: (name: string, value: string) => {
               request.headers[name] = value;
               return builder;
            },
            throwOnError: () =>
               Promise.resolve({ data: [{ id: 'tc1', code: 'ABC', display_name: 'Acme' }] })
         };
         return builder;
      }
   }
}));

const options = (sourceWritable = true): TransferOptions => ({
   source_writable: sourceWritable,
   targets: [
      { id: 'branch', display_name: 'Branch', same_company: true, refusal: null },
      {
         id: 'locked',
         display_name: 'Locked Ltd',
         same_company: false,
         refusal: 'transfer_target_read_only'
      },
      { id: 'other', display_name: 'Other Ltd', same_company: false, refusal: null }
   ]
});

const report = (overrides: Partial<TransferReport> = {}): TransferReport => ({
   customer: { id: 'c1', code: 'ACM', display_name: 'Acme' },
   path: 'copy',
   mode: 'copy',
   counts: { customer: 1, product: 2 },
   conflicts: [],
   users: [],
   left_behind: [],
   settings_gaps: [],
   files: 0,
   unresolved: 0,
   report_hash: 'hash-1',
   ...overrides
});

const customerCode = {
   key: 'customer:c1',
   kind: 'customer_code' as const,
   table: 'customer',
   source_id: 'c1',
   label: 'ACM',
   existing_id: 'tc1',
   actions: ['map' as const, 'new_code' as const]
};
const projectCode = {
   key: 'project:p1',
   kind: 'code' as const,
   table: 'project',
   source_id: 'p1',
   label: 'ACM-001',
   existing_id: null,
   actions: ['new_code' as const, 'skip' as const],
   skip_drops: { project_task: 3 }
};

let wizard: TransferWizard;

const Host = defineComponent({
   setup() {
      wizard = useTransferWizard({ sourceTenant: 'source', customerId: 'c1', productIds: null });
      return () =>
         h('div', [
            h(TargetStep, { wizard }),
            wizard.report.value ? h(ReportStep, { wizard }) : null
         ]);
   }
});

const mountWizard = async () => {
   const wrapper = mount(Host, {
      attachTo: document.body,
      global: {
         plugins: [i18NPlugin, PrimeVue, [VueQueryPlugin, { queryClient: new QueryClient() }]],
         directives: { tooltip: {} }
      }
   });
   await flushPromises();
   return wrapper;
};

const rehearseTo = async (next: TransferReport) => {
   api.rehearse.mockResolvedValueOnce(next);
   await wizard.rehearse();
   await flushPromises();
};

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   api.options = options();
   api.rehearse.mockReset();
   api.run.mockReset();
   api.forTenant = [];
   api.requests = [];
   document.body.innerHTML = '';
});

describe('transfer wizard', () => {
   it('starts on copy and disables move for a read-only source', async () => {
      api.options = options(false);
      const wrapper = await mountWizard();

      expect(wizard.mode.value).toBe('copy');
      wizard.mode.value = 'move';
      await nextTick();
      expect(wizard.mode.value).toBe('copy');

      const buttons = wrapper.findAll('[data-mode] button');
      expect(buttons).toHaveLength(2);
      expect(buttons[1]!.attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-read-only]').text()).toBe(en.ops.transfer.mode.move_read_only);
   });

   it('a decision makes the report stale until rehearsed again', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ conflicts: [customerCode], unresolved: 1 }));

      expect(wizard.stale.value).toBe(false);
      expect(wizard.canRun.value).toBe(false);

      wizard.decide('customer:c1', { action: 'new_code', code: 'XYZ' });
      await nextTick();
      expect(wizard.stale.value).toBe(true);
      expect(wizard.canRun.value).toBe(false);
      expect(wrapper.find('[data-rehearse-again]').exists()).toBe(true);

      await rehearseTo(report({ conflicts: [customerCode], unresolved: 0 }));
      expect(api.rehearse).toHaveBeenLastCalledWith(
         expect.objectContaining({
            target_tenant: 'branch',
            decisions: { 'customer:c1': { action: 'new_code', code: 'XYZ' } }
         })
      );
      expect(wizard.stale.value).toBe(false);
      expect(wizard.canRun.value).toBe(true);
   });

   it('changing the target clears decisions', async () => {
      await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ conflicts: [customerCode], unresolved: 1 }));
      wizard.decide('customer:c1', { action: 'map', target_id: 'tc1' });

      wizard.target.value = 'other';
      await nextTick();

      expect(wizard.decisions.value).toEqual({});
      expect(wizard.report.value).toBeNull();
      expect(wizard.stale.value).toBe(false);
   });

   it("lists the target's refusal", async () => {
      const wrapper = await mountWizard();
      await wrapper.find('[data-pc-name="select"]').trigger('click');
      await flushPromises();

      const refused = document.body.querySelector('[data-target="locked"]');
      expect(refused?.querySelector('[data-refusal]')?.textContent?.trim()).toBe(
         en.errors.transfer_target_read_only
      );
      const option = refused?.closest('li');
      expect(option?.getAttribute('aria-disabled')).toBe('true');
      expect(
         document.body
            .querySelector('[data-target="branch"]')
            ?.closest('li')
            ?.getAttribute('aria-disabled')
      ).toBe('false');
   });

   it('shows a code input only for typed codes', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ conflicts: [customerCode, projectCode], unresolved: 2 }));

      wizard.decide('customer:c1', { action: 'new_code' });
      wizard.decide('project:p1', { action: 'new_code' });
      await nextTick();

      expect(wrapper.find('[data-conflict="customer:c1"] [data-code]').exists()).toBe(true);
      expect(wrapper.find('[data-conflict="project:p1"] [data-code]').exists()).toBe(false);

      wizard.decide('project:p1', { action: 'skip' });
      await nextTick();
      expect(wrapper.find('[data-conflict="project:p1"] [data-drops]').text()).toBe(
         'Also drops: Project task (3)'
      );
   });

   it("run sends the last report's hash", async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ report_hash: 'hash-1' }));
      // Rehearsed again with nothing changed: the run must carry the newer hash.
      await rehearseTo(report({ report_hash: 'hash-7' }));
      api.run.mockResolvedValueOnce({ id: 'tr1' });

      await wrapper.find('[data-run]').trigger('click');
      await flushPromises();

      expect(api.run).toHaveBeenCalledWith({
         args: {
            source_tenant: 'source',
            target_tenant: 'branch',
            customer_id: 'c1',
            mode: 'copy',
            decisions: {},
            product_ids: null
         },
         reportHash: 'hash-7'
      });
      expect(wizard.step.value).toBe('result');
   });

   it('blocks a move that would leave links in the source', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      wizard.mode.value = 'move';
      await rehearseTo(
         report({
            mode: 'move',
            left_behind: [
               {
                  table: 'purchase_order_line',
                  source_id: 'l1',
                  column: 'product_id',
                  label: 'PO-1',
                  refers_to: 'product'
               }
            ]
         })
      );

      expect(wizard.canRun.value).toBe(false);
      expect(wrapper.find('[data-move-blocked]').exists()).toBe(true);
      expect(wrapper.find('[data-left-behind]').text()).toContain(
         'Purchase order line PO-1: its Product refers to a Product outside the transfer'
      );
      expect(wrapper.find('[data-run]').attributes('disabled')).toBeDefined();
   });

   it('looks up target rows in the target tenant', async () => {
      await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ conflicts: [customerCode], unresolved: 1 }));

      wizard.decide('customer:c1', { action: 'map', target_id: 'tc1' });
      await flushPromises();

      const lookup = api.requests.find(({ table }) => table === 'customer');
      expect(lookup?.headers).toEqual({ 'x-tenant-id': 'branch', 'x-tenant-ids': 'branch' });
      expect(lookup?.in).toEqual([['tenant_id', ['branch']]]);
      expect(api.forTenant).toContain('branch');
   });
   it('blocks the run while two conflicts of one table get the same new code', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      const supplier = (id: string) => ({
         ...customerCode,
         key: `supplier:${id}`,
         kind: 'supplier_code' as const,
         table: 'supplier',
         source_id: id,
         label: id,
         existing_id: null
      });
      wizard.decide('supplier:s1', { action: 'new_code', code: 'AB1' });
      wizard.decide('supplier:s2', { action: 'new_code', code: 'AB1' });
      // The rehearsal checks each decision alone, so it reports them resolved.
      await rehearseTo(report({ conflicts: [supplier('s1'), supplier('s2')], unresolved: 0 }));

      expect(wizard.duplicateCodes.value).toEqual(new Set(['supplier:s1', 'supplier:s2']));
      expect(wizard.canRun.value).toBe(false);
      for (const key of ['supplier:s1', 'supplier:s2']) {
         const row = wrapper.find(`[data-conflict="${key}"]`);
         expect(row.find('[data-code]').attributes('aria-invalid')).toBe('true');
         expect(row.find('[data-code-reason]').text()).toBe(
            en.ops.transfer.conflict.duplicate_code
         );
      }

      wizard.decide('supplier:s2', { action: 'new_code', code: 'AB2' });
      await rehearseTo(report({ conflicts: [supplier('s1'), supplier('s2')], unresolved: 0 }));
      expect(wizard.duplicateCodes.value.size).toBe(0);
      expect(wizard.canRun.value).toBe(true);
   });

   it('says why a typed code taken in the target stays unresolved', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(report({ conflicts: [customerCode], unresolved: 1 }));

      // The stand-in lookup holds the target's customer ABC.
      wizard.decide('customer:c1', { action: 'new_code', code: 'ABC' });
      await flushPromises();

      const row = wrapper.find('[data-conflict="customer:c1"]');
      expect(row.find('[data-code]').attributes('aria-invalid')).toBe('true');
      expect(row.find('[data-code-reason]').text()).toBe(en.ops.transfer.conflict.code_taken);

      wizard.decide('customer:c1', { action: 'new_code', code: 'XYZ' });
      await flushPromises();
      expect(row.find('[data-code-reason]').exists()).toBe(false);
   });

   it('shows a failed rehearsal or run in the dialog', async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      const refused = { code: 'P0001', message: 'transfer_code_invalid' };

      api.rehearse.mockRejectedValueOnce(refused);
      await expect(wizard.rehearse()).rejects.toBe(refused);
      await nextTick();
      expect(wrapper.find('[data-error]').text()).toBe(en.errors.transfer_code_invalid);

      await rehearseTo(report());
      expect(wizard.error.value).toBeNull();

      api.run.mockRejectedValueOnce({ code: 'P0001', message: 'transfer_report_stale' });
      await expect(wizard.run()).rejects.toBeDefined();
      await nextTick();
      expect(wrapper.find('[data-run-error]').text()).toBe(en.errors.transfer_report_stale);
   });

   it('does not read a decision set again in another order as a change', async () => {
      await mountWizard();
      wizard.target.value = 'branch';
      wizard.decide('customer:c1', { action: 'map', target_id: 'tc1' });
      wizard.decide('project:p1', { action: 'skip' });
      await rehearseTo(report({ conflicts: [customerCode, projectCode] }));

      wizard.decide('customer:c1', null);
      wizard.decide('customer:c1', { target_id: 'tc1', action: 'map' });
      expect(wizard.stale.value).toBe(false);
   });

   it("labels the users' columns", async () => {
      const wrapper = await mountWizard();
      wizard.target.value = 'branch';
      await rehearseTo(
         report({
            users: [
               { user_id: 'u1', display_name: 'Ayşe', columns: ['user_id', 'odd_col'], rows: 2 }
            ]
         })
      );
      expect(wrapper.find('[data-users] li').text()).toBe('Ayşe (User, odd_col: 2)');
   });
});
