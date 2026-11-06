import '../setup/mockMain';
import {
   marketCellSchema,
   toMarketCellFormValues,
   type MarketCellCard,
   type MarketCellFormValues
} from '@/api/marketMatrix';
import StatusActions from '@/components/service-components/status-actions/StatusActions.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import { useCustomerFilter } from '@/store/customerFilter';
import CellsAdd from '@/views/pages/ops/market/CellsAdd.vue';
import CellUpsert from '@/views/pages/ops/market/CellUpsert.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import MultiSelect from 'primevue/multiselect';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense, type Component, type Ref } from 'vue';

// The bulk "add cells" dialog and the cell dialog's status section. The matrix queries, the
// pickers and the cell form are stand-ins; what is checked is what the dialogs make of them.
const api = vi.hoisted(() => ({
   useMarketCells: vi.fn(),
   useAddMarketCells: vi.fn(),
   addCells: vi.fn(),
   toast: vi.fn(),
   values: null as unknown as Ref<MarketCellFormValues>,
   options: undefined as undefined | { toPayload: (data: unknown) => Record<string, unknown> },
   row: null as unknown
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/auth', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/store/auth')>()),
   useAuthStore: () => ({ currentTenant: { id: 't1' } })
}));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('@/api/useLookup', async () => {
   const { ref } = await import('vue');
   return { useLookup: () => ({ data: ref([]) }) };
});
vi.mock('@/api/customer', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/customer')>()),
      usePlatformOptions: () => ({
         data: ref([{ id: 'amazon', display_name: 'Amazon', countries: ['DE', 'FR', 'IT'] }])
      })
   };
});
vi.mock('@/api/marketMatrix', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/marketMatrix')>()),
   useMarketCells: api.useMarketCells,
   useAddMarketCells: api.useAddMarketCells,
   useSetMarketCellStatus: () => ({ mutateAsync: vi.fn() })
}));
vi.mock('@/composables/useUpsertForm', async () => {
   const { ref } = await import('vue');
   return {
      useUpsertForm: (options: typeof api.options) => {
         api.options = options;
         return {
            values: api.values,
            errors: ref({}),
            isDirty: ref(false),
            isSubmitting: ref(false),
            readonly: ref(false),
            reset: vi.fn(),
            save: vi.fn(),
            ready: Promise.resolve(),
            draft: {},
            row: ref(api.row)
         };
      }
   };
});

/** A picker: holds a v-model and nothing else. */
const picker = (name: string) =>
   defineComponent({
      name,
      props: ['modelValue', 'customerId'],
      emits: ['update:modelValue'],
      setup: () => () => h('span')
   });
const ProductMultiSelect = picker('ProductMultiSelect');
const SelectPlatform = picker('SelectPlatform');
const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});
const FormBox = defineComponent({
   emits: ['submit'],
   setup:
      (_, { slots, emit }) =>
      () =>
         h(
            'form',
            {
               onSubmit: (event: Event) => {
                  event.preventDefault();
                  emit('submit');
               }
            },
            [slots.default?.({})]
         )
});

const mountDialog = async (page: Component, props: Record<string, unknown> = {}) => {
   const wrapper = mount(
      defineComponent({
         render: () => h(Suspense, null, { default: () => h(page, props) })
      }),
      {
         global: {
            plugins: [
               i18NPlugin,
               PrimeVue,
               ConfirmationService,
               [abilitiesPlugin, ability, { useGlobalProperties: true }]
            ],
            directives: { focustrap: {}, tooltip: {} },
            stubs: {
               FormBox,
               FormField: Slot,
               ProductMultiSelect,
               SelectPlatform,
               SelectCustomer: picker('SelectCustomer'),
               ProjectSelect: picker('ProjectSelect'),
               ProductSelect: picker('ProductSelect'),
               teleport: true
            }
         }
      }
   );
   await flushPromises();
   return wrapper;
};

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.addCells.mockResolvedValue(1);
   api.useAddMarketCells.mockReturnValue({ mutateAsync: api.addCells, isPending: ref(false) });
   api.useMarketCells.mockReturnValue({
      data: ref([{ product_id: 'p1', platform_id: 'amazon', country: 'DE', customer_id: 'k1' }])
   });
});

describe('market cell dialogs', () => {
   it('adds only the missing cells', async () => {
      useCustomerFilter().set('k1');
      const wrapper = await mountDialog(CellsAdd);

      wrapper.getComponent(ProductMultiSelect).vm.$emit('update:modelValue', ['p1', 'p2']);
      wrapper.getComponent(SelectPlatform).vm.$emit('update:modelValue', 'amazon');
      await flushPromises();
      wrapper.getComponent(MultiSelect).vm.$emit('update:modelValue', ['DE']);
      await flushPromises();
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(api.addCells).toHaveBeenCalledTimes(1);
      expect(api.addCells).toHaveBeenCalledWith([
         {
            product_id: 'p2',
            platform_id: 'amazon',
            country: 'DE',
            priority: 2,
            project_id: null,
            tenant_id: 't1'
         }
      ]);
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({
            detail: i18n.t('ops.market.cells_added', { added: 1, skipped: 1 })
         })
      );
   });

   it('creates a candidate with empty fields as NULL', async () => {
      const PRODUCT = '00000000-0000-4000-8000-000000000021';
      api.row = null;
      api.values = ref(
         toMarketCellFormValues({ product_id: PRODUCT, platform_id: 'amazon', country: 'DE' })
      );
      await mountDialog(CellUpsert, { product_id: PRODUCT, platform_id: 'amazon', country: 'DE' });

      const payload = api.options!.toPayload(marketCellSchema.parse(api.values.value));
      expect(payload).not.toHaveProperty('status');
      expect(payload).not.toHaveProperty('customer_id');
      expect(payload).toMatchObject({
         product_id: PRODUCT,
         platform_id: 'amazon',
         country: 'DE',
         priority: 2,
         compliance: 'pending',
         compliance_note: null,
         open_issue: null,
         notes: null,
         project_id: null
      });
   });

   it('warns what live still needs', async () => {
      const cell = {
         id: 'c1',
         customer_id: 'k1',
         product_id: 'p1',
         platform_id: 'amazon',
         country: 'DE',
         status: 'uploaded',
         priority: 2,
         compliance: 'green',
         platform_product_id: 'B0X',
         platform_sku: 'THO-MOP-DE',
         price: 12.99,
         currency: 'EUR',
         stock_source: 'platform',
         content_status: 'translated',
         product: { sku: 'THO-MOP', display_name: 'Mop' },
         project: null,
         platform: { display_name: 'Amazon', countries: ['DE'], product_id_label: 'ASIN' }
      } as unknown as MarketCellCard;
      api.row = cell;
      api.values = ref(toMarketCellFormValues(cell));

      const wrapper = await mountDialog(CellUpsert, { id: 'c1' });
      const actions = wrapper.getComponent(StatusActions);

      expect(actions.props('next')).toEqual(['live', 'suppressed']);
      // An Amazon cell opens its listing drawer.
      expect(wrapper.get('[data-action="amazon-open"]').text()).toBe(
         i18n.t('ops.amazon.cell.open')
      );
      expect(actions.props('warnings')).toEqual({
         live: i18n.t('ops.market.live_missing', {
            fields: i18n.t('ops.market.fields.content_status')
         })
      });
   });
});
