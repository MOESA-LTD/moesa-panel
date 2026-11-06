import '../setup/mockMain';
import type { MarketCellRow } from '@/api/marketMatrix';
import { ability } from '@/plugins/casl';
import { abilitiesPlugin } from '@casl/vue';
import en from '@/plugins/i18n/locales/en/index.json';
import CellUpsert from '@/views/pages/ops/market/CellUpsert.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, Suspense } from 'vue';

// The form is useUpsertForm (a stand-in seeded the way the real one is: from the stored row, else
// the prefill); what the dialog adds is checked: the currency is a select with a country default.
const api = vi.hoisted(() => ({
   row: null as unknown,
   values: null as unknown
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/customerFilter', () => ({
   useCustomerFilter: () => ({ customerId: null })
}));
vi.mock('@/api/useLookup', async () => {
   const { ref } = await import('vue');
   return { useLookup: () => ({ data: ref(undefined) }) };
});
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));
vi.mock('@/api/customer', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/customer')>()),
      usePlatformOptions: () => ({ data: ref([{ id: 'amazon', countries: ['DE', 'PL'] }]) })
   };
});
vi.mock('@/composables/useUpsertForm', async () => {
   const { ref, toValue } = await import('vue');
   return {
      useUpsertForm: (options: {
         prefill: () => object;
         toFormValues: (row: unknown) => object;
      }) => {
         api.values = ref(options.toFormValues(api.row ?? toValue(options.prefill)));
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

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});

const mountCell = async (props: object, row: Partial<MarketCellRow> | null = null) => {
   api.row = row;
   const wrapper = mount(
      defineComponent({ render: () => h(Suspense, null, { default: () => h(CellUpsert, props) }) }),
      {
         global: {
            plugins: [
               i18NPlugin,
               PrimeVue,
               [abilitiesPlugin, ability, { useGlobalProperties: true }],
               [VueQueryPlugin, { queryClient: new QueryClient() }]
            ],
            directives: { focustrap: {}, tooltip: {} },
            stubs: {
               FormBox: Slot,
               FormField: Slot,
               ProductSelect: true,
               ProjectSelect: true,
               CellAmazonDrawer: true,
               StatusActions: true
            }
         }
      }
   );
   await flushPromises();
   return wrapper;
};
const currencySelect = (wrapper: Awaited<ReturnType<typeof mountCell>>) =>
   wrapper.findAllComponents(Select).find((select) => select.props('options')?.includes('USD'))!;

const saved = {
   id: 'c1',
   country: 'DE',
   currency: 'USD',
   status: 'preparing',
   product: null,
   platform: null
} as unknown as MarketCellRow;
const formValues = () => (api.values as { value: Record<string, unknown> }).value;

describe('market cell currency', () => {
   beforeAll(() => {
      i18n.setLocaleMessage('en', en);
      ability.update([{ action: 'manage', subject: 'all' }]);
   });

   it('prefills EUR on a new DE cell, whose dialog names only the identity', async () => {
      await mountCell({ country: 'DE' });
      expect(formValues().currency).toBe('EUR');
   });

   it('is a select on a saved cell, keeping the stored currency', async () => {
      const wrapper = await mountCell({ id: 'c1' }, saved);
      expect(currencySelect(wrapper).props('modelValue')).toBe('USD');
      expect(wrapper.find('input[name="currency"]').exists()).toBe(false);
   });

   it('follows a new cell country until the user chose a currency', async () => {
      await mountCell({ country: 'DE' });
      formValues().country = 'PL';
      await flushPromises();
      expect(formValues().currency).toBe('PLN');

      formValues().currency = 'USD';
      formValues().country = 'DE';
      await flushPromises();
      expect(formValues().currency).toBe('USD');
   });
});
