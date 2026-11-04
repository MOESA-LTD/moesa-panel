import en from '@/plugins/i18n/locales/en/index.json';
import PurchaseOrderTable from '@/components/service-components/purchase-order-table/PurchaseOrderTable.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

const api = vi.hoisted(() => ({
   ids: undefined as string[] | undefined,
   idFilters: [] as unknown[],
   tableFilters: null as null | Record<string, { constraints: unknown[] }>
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// The locale loader reads PrimeVue's config from the app; the app itself (and its router) stays out.
vi.mock('@/main', () => ({ app: undefined }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/customerFilter', () => ({ useCustomerFilter: () => ({ customerId: null }) }));
vi.mock('@/api/purchaseOrder', async (importOriginal) => {
   const { toValue } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/purchaseOrder')>()),
      usePurchaseOrderIds: (filter: () => unknown) => {
         api.idFilters.push(toValue(filter));
         return { data: ref(api.ids) };
      }
   };
});

const ResourceTable = defineComponent({
   name: 'ResourceTable',
   props: ['filters', 'from'],
   setup: (props) => {
      api.tableFilters = props.filters;
      return () => h('div', { 'data-table': props.from });
   }
});

const mountTable = async (filters: Record<string, string>) => {
   const wrapper = mount(PurchaseOrderTable, {
      props: { filters },
      global: { plugins: [i18NPlugin, PrimeVue], stubs: { ResourceTable } }
   });
   await flushPromises();
   return wrapper;
};

describe('purchase order table', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   beforeEach(() => {
      api.ids = undefined;
      api.idFilters = [];
      api.tableFilters = null;
   });

   it('shows no table, but "no orders", for a product on none', async () => {
      api.ids = [];
      const wrapper = await mountTable({ productId: 'p1' });

      expect(api.idFilters.at(-1)).toEqual({ productId: 'p1' });
      expect(wrapper.find('[data-table]').exists()).toBe(false);
      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.no_rows'));
   });

   it('shows no table while the orders of a product load', async () => {
      const wrapper = await mountTable({ productId: 'p1' });
      expect(wrapper.find('[data-table]').exists()).toBe(false);
   });

   it("narrows the table to the product's orders", async () => {
      api.ids = ['o1'];
      const wrapper = await mountTable({ productId: 'p1' });

      expect(wrapper.get('[data-table]').attributes('data-table')).toBe('purchase_order_overview');
      expect(api.tableFilters!.id!.constraints[0]).toEqual({ value: ['o1'], matchMode: 'in' });
   });

   it("narrows the table to a supplier's and a project's orders", async () => {
      await mountTable({ supplierId: 's1', projectId: 'pr1' });

      expect(api.tableFilters!.supplier_id!.constraints[0]).toEqual({
         value: 's1',
         matchMode: 'equals'
      });
      expect(api.tableFilters!.project_id!.constraints[0]).toEqual({
         value: 'pr1',
         matchMode: 'equals'
      });
      expect(api.tableFilters).not.toHaveProperty('id');
   });
});
