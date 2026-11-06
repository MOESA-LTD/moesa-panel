import '../setup/mockMain';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import AmazonBulkPublish from '@/views/pages/ops/product/AmazonBulkPublish.vue';
import ProductIndex from '@/views/pages/ops/product/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

// Bulk publishing from the product list: the selection action (one customer's products) and the
// dialog that publishes them to one Amazon marketplace and reports each product's result.
const api = vi.hoisted(() => ({ publishBulk: vi.fn(), push: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: api.push })
}));
vi.mock('@/api/useTenantKey', async () => {
   const { computed } = await import('vue');
   return { useTenantKey: () => computed(() => 't1') };
});
vi.mock('@/api/amazon', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/amazon')>()),
      usePublishBulk: () => ({ mutateAsync: api.publishBulk, isPending: ref(false) })
   };
});

const PRODUCTS = [
   { id: 'p1', sku: 'THO-MOP40-2P', display_name: 'Mop 40' },
   { id: 'p2', sku: 'THO-TIPS-6-50', display_name: 'Tips' },
   { id: 'p3', sku: 'THO-CONES-100', display_name: 'Cones' }
];

const plugins = [
   i18NPlugin,
   PrimeVue,
   [VueQueryPlugin, { queryClient: new QueryClient() }],
   [abilitiesPlugin, ability, { useGlobalProperties: true }]
] as const;

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
});

describe('AmazonBulkPublish', () => {
   it('publishes the selected products to the chosen marketplace and reports skipped ones', async () => {
      api.publishBulk.mockResolvedValue([
         { product_id: 'p1', cell_id: 'c1', result: 'submitted' },
         { product_id: 'p2', cell_id: null, result: 'skipped_no_cell' },
         {
            product_id: 'p3',
            cell_id: 'c3',
            result: 'skipped_incomplete',
            code: 'listing_incomplete'
         }
      ]);
      const wrapper = mount(AmazonBulkPublish, {
         props: { productIds: ['p1', 'p2', 'p3'], products: PRODUCTS },
         global: { plugins: [...plugins] as never }
      });

      const country = wrapper.getComponent(Select);
      expect(country.props('options')).toEqual([
         'DE',
         'FR',
         'IT',
         'ES',
         'NL',
         'PL',
         'SE',
         'BE',
         'GB'
      ]);
      country.vm.$emit('update:modelValue', 'FR');
      await nextTick();

      await wrapper.get('[data-action="bulk-publish"]').trigger('click');
      await flushPromises();

      expect(api.publishBulk).toHaveBeenCalledWith({
         productIds: ['p1', 'p2', 'p3'],
         country: 'FR'
      });
      const rows = wrapper.findAll('[data-result]');
      expect(rows.map((row) => row.attributes('data-result'))).toEqual([
         'submitted',
         'skipped_no_cell',
         'skipped_incomplete'
      ]);
      expect(rows[0]!.text()).toContain('THO-MOP40-2P');
      expect(rows[0]!.text()).toContain(en.ops.amazon.bulk.result.submitted);
      expect(rows[1]!.text()).toContain(en.ops.amazon.bulk.result.skipped_no_cell);
      expect(rows[2]!.text()).toContain('THO-CONES-100');
      expect(rows[2]!.text()).toContain(en.errors.listing_incomplete);
      expect(wrapper.get('[data-summary]').text()).toBe(
         en.ops.amazon.bulk.summary.replace('{submitted}', '1').replace('{total}', '3')
      );
      // Headers from the bulk keys.
      for (const header of Object.values(en.ops.amazon.bulk.col))
         expect(wrapper.text()).toContain(header);
   });

   it('shows a refused call instead of a result table', async () => {
      const { AmazonApiError } = await import('@/api/amazon');
      api.publishBulk.mockRejectedValue(new AmazonApiError('amazon_not_connected'));
      const wrapper = mount(AmazonBulkPublish, {
         props: { productIds: ['p1'], products: PRODUCTS },
         global: { plugins: [...plugins] as never }
      });
      await wrapper.get('[data-action="bulk-publish"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-result]').exists()).toBe(false);
      expect(wrapper.get('[data-bulk-error]').text()).toBe(en.errors.amazon_not_connected);
   });
});

describe('product list: publish selected to Amazon', () => {
   // The table is a stand-in: its toolbar and the selection it reports.
   const Table = defineComponent({
      name: 'ResourceTable',
      props: {
         selection: { type: Array, default: undefined },
         selectionMode: String,
         filters: { type: Object, default: undefined }
      },
      emits: ['update:selection', 'update:filters'],
      setup:
         (_props, { slots }) =>
         () =>
            h('div', slots.header?.())
   });
   const Dialog = defineComponent({
      name: 'Dialog',
      props: { visible: Boolean, header: String },
      setup:
         (props, { slots }) =>
         () =>
            props.visible ? h('div', { 'data-dialog': props.header }, slots.default?.()) : null
   });
   const mountList = () =>
      mount(ProductIndex, {
         global: {
            plugins: [...plugins] as never,
            stubs: {
               ResourceTable: Table,
               CustomLink: true,
               teleport: true,
               Dialog,
               AmazonBulkPublish: defineComponent({
                  name: 'AmazonBulkPublish',
                  props: ['productIds', 'products'],
                  setup: () => () => h('span')
               })
            }
         }
      });

   it('needs one customer and opens the dialog with the selected products', async () => {
      const wrapper = mountList();
      const table = wrapper.findComponent(Table);
      const button = () => wrapper.find('[data-amazon-bulk] button');
      const hint = () =>
         (wrapper.find('[data-amazon-bulk]').element as HTMLElement & { $_ptooltipValue?: unknown })
            .$_ptooltipValue;
      const select = async (rows: Record<string, unknown>[]) => {
         table.vm.$emit('update:selection', rows);
         await nextTick();
      };

      expect(button().attributes('disabled')).toBeDefined();
      expect(button().text()).toBe(en.ops.amazon.bulk.open);
      expect(hint()).toBe(en.ops.amazon.bulk.open_disabled_empty);

      await select([
         { id: 'p1', customer_id: 'k1', sku: 'A', display_name: 'a' },
         { id: 'p2', customer_id: 'k2', sku: 'B', display_name: 'b' }
      ]);
      expect(button().attributes('disabled')).toBeDefined();
      expect(hint()).toBe(en.ops.amazon.bulk.open_disabled_mixed);

      await select([
         { id: 'p1', customer_id: 'k1', sku: 'A', display_name: 'a' },
         { id: 'p2', customer_id: 'k1', sku: 'B', display_name: 'b' }
      ]);
      expect(button().attributes('disabled')).toBeUndefined();
      expect(button().text()).toBe(en.ops.amazon.bulk.open_count.replace('{count}', '2'));

      await button().trigger('click');
      const dialog = wrapper.getComponent({ name: 'AmazonBulkPublish' });
      expect(dialog.props('productIds')).toEqual(['p1', 'p2']);
      expect(wrapper.get('[data-dialog]').attributes('data-dialog')).toBe(en.ops.amazon.bulk.title);
   });

   it('is not offered without the right to submit listings', () => {
      ability.update([{ action: 'select', subject: 'product' }]);
      expect(mountList().find('[data-amazon-bulk]').exists()).toBe(false);
   });
});
