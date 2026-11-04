import '../setup/mockMain';
import { useProjectOperations } from '@/api/project';
import en from '@/plugins/i18n/locales/en/index.json';
import { ability } from '@/plugins/casl';
import ProductOrders from '@/views/pages/ops/product/tabs/Orders.vue';
import { PRODUCT_CARD_TABS } from '@/views/pages/ops/product/useProductForm';
import ProjectPurchaseOrders from '@/views/pages/ops/project/tabs/PurchaseOrders.vue';
import ProjectShipments from '@/views/pages/ops/project/tabs/Shipments.vue';
import SupplierPurchaseOrders from '@/views/pages/ops/supplier/tabs/PurchaseOrders.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, ref, toValue, type Component } from 'vue';

// The history tabs only embed the purchase order and shipment tables with their filters; the
// tables themselves (and their empty-IN guard) are tested in their own files.
const api = vi.hoisted(() => ({
   lookups: {} as Record<string, unknown[]>,
   lookupCalls: [] as { table: string; options: unknown; enabled: unknown }[],
   operationsFor: [] as unknown[]
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/useLookup', () => ({
   useLookup: (table: string, options: unknown, enabled: unknown = true) => {
      api.lookupCalls.push({ table, options, enabled });
      return { data: ref(api.lookups[table]) };
   }
}));
vi.mock('@/api/project', async (importOriginal) => {
   const original = await importOriginal<typeof import('@/api/project')>();
   return {
      ...original,
      projectResource: {
         ...original.projectResource,
         useOne: () => ({ data: ref({ id: 'p', customer_id: 'c' }) })
      }
   };
});

const Table = (name: string) =>
   defineComponent({
      name,
      props: ['filters'],
      setup: (props) => () =>
         h('div', { 'data-table': name, 'data-filters': JSON.stringify(props.filters) })
   });

const CustomLink = defineComponent({
   props: ['to'],
   setup:
      (props, { slots }) =>
      () =>
         h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.({ navigate: () => {} }))
});

const mountTab = async (component: Component, id = 'p') => {
   const wrapper = mount(component, {
      props: { id } as never,
      global: {
         plugins: [
            i18NPlugin,
            PrimeVue,
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ] as never,
         stubs: {
            PurchaseOrderTable: Table('PurchaseOrderTable'),
            ShipmentTable: Table('ShipmentTable'),
            CustomLink
         }
      }
   });
   await flushPromises();
   return wrapper;
};

const filtersOf = (wrapper: Awaited<ReturnType<typeof mountTab>>, table: string) =>
   JSON.parse(wrapper.get(`[data-table="${table}"]`).attributes('data-filters')!);

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   api.lookups = {};
   api.lookupCalls = [];
   ability.update([{ action: 'manage', subject: 'all' }]);
});

describe('useProjectOperations', () => {
   it("finds the project's orders, then the shipments linked to them", () => {
      api.lookups = {
         purchase_order: [{ id: 'o1' }, { id: 'o2' }],
         shipment_purchase_order: [{ shipment_id: 's' }, { shipment_id: 's' }]
      };
      const scope = effectScope();
      const result = scope.run(() => useProjectOperations('p'))!;

      const [orders, links] = api.lookupCalls;
      expect(orders!.table).toBe('purchase_order');
      expect(toValue(orders!.options as () => unknown)).toMatchObject({
         in: { column: 'project_id', values: ['p'] }
      });
      expect(links!.table).toBe('shipment_purchase_order');
      expect(toValue(links!.options as () => unknown)).toMatchObject({
         select: 'shipment_id',
         in: { column: 'purchase_order_id', values: ['o1', 'o2'] }
      });
      expect(toValue(links!.enabled as () => boolean)).toBe(true);
      expect(result.purchaseOrderIds.value).toEqual(['o1', 'o2']);
      expect(result.shipmentIds.value).toEqual(['s']);
      scope.stop();
   });

   it('does not look up shipment links while the project has no orders', () => {
      api.lookups = { purchase_order: [], shipment_purchase_order: [{ shipment_id: 'any' }] };
      const scope = effectScope();
      const result = scope.run(() => useProjectOperations('p'))!;

      expect(toValue(api.lookupCalls[1]!.enabled as () => boolean)).toBe(false);
      expect(result.shipmentIds.value).toEqual([]);
      scope.stop();
   });
});

describe('history tabs', () => {
   it("embeds the project's orders, with a new order for the project and its customer", async () => {
      const wrapper = await mountTab(ProjectPurchaseOrders);

      expect(filtersOf(wrapper, 'PurchaseOrderTable')).toEqual({ projectId: 'p' });
      const link = JSON.parse(wrapper.get('[data-to]').attributes('data-to')!);
      expect(link.name).toBe('ops-purchase-order-manage');
      expect(link.query).toMatchObject({ project_id: 'p', customer_id: 'c' });
      expect(wrapper.get('[data-test="new-purchase-order"]').text()).toBe(
         i18n.t('ops.project.new_purchase_order')
      );
   });

   it('offers no new order without the right to create one', async () => {
      ability.update([{ action: 'read', subject: 'purchase_order' }]);
      const wrapper = await mountTab(ProjectPurchaseOrders);

      expect(wrapper.find('[data-test="new-purchase-order"]').exists()).toBe(false);
   });

   it("embeds the shipments of the project's orders", async () => {
      api.lookups = { purchase_order: [{ id: 'o1' }] };
      const wrapper = await mountTab(ProjectShipments);

      expect(filtersOf(wrapper, 'ShipmentTable')).toEqual({ purchaseOrderIds: ['o1'] });
   });

   it("embeds the supplier's orders", async () => {
      const wrapper = await mountTab(SupplierPurchaseOrders, 's1');
      expect(filtersOf(wrapper, 'PurchaseOrderTable')).toEqual({ supplierId: 's1' });
   });

   it("embeds the product's orders and shipments, each for those who may read them", async () => {
      let wrapper = await mountTab(ProductOrders, 'pr');
      expect(filtersOf(wrapper, 'PurchaseOrderTable')).toEqual({ productId: 'pr' });
      expect(filtersOf(wrapper, 'ShipmentTable')).toEqual({ productId: 'pr' });

      wrapper.unmount();
      ability.update([{ action: 'read', subject: 'shipment' }]);
      wrapper = await mountTab(ProductOrders, 'pr');
      expect(wrapper.find('[data-table="PurchaseOrderTable"]').exists()).toBe(false);
      expect(wrapper.find('[data-table="ShipmentTable"]').exists()).toBe(true);
   });

   it("puts the product's orders tab before its documents", () => {
      expect(PRODUCT_CARD_TABS.indexOf('orders')).toBe(PRODUCT_CARD_TABS.indexOf('documents') - 1);
   });
});
