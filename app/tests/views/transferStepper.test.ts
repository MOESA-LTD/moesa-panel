import '../setup/mockMain';
import en from '@/plugins/i18n/locales/en/index.json';
import Transfer from '@/views/pages/ops/transfer/Transfer.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

// The dialog's frame alone: the customer and the transfer API are stand-ins.
vi.mock('@/api/customer', async (importOriginal) => {
   const original = await importOriginal<typeof import('@/api/customer')>();
   return {
      ...original,
      customerResource: {
         ...original.customerResource,
         useOne: () => ({ data: ref({ id: 'c1', code: 'ACM', tenant_id: 'source' }) })
      }
   };
});
vi.mock('@/api/transfer', async (importOriginal) => {
   const original = await importOriginal<typeof import('@/api/transfer')>();
   return {
      ...original,
      useTransferOptions: () => ({
         data: ref({ source_writable: true, targets: [] }),
         isLoading: ref(false)
      }),
      useRehearseTransfer: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
      useRunTransfer: () => ({ mutateAsync: vi.fn(), isPending: ref(false) })
   };
});

beforeAll(() => i18n.setLocaleMessage('en', en));

describe('transfer dialog', () => {
   it('numbers its steps 1, 2, 3 and titles them', async () => {
      const wrapper = mount(Transfer, {
         props: { customerId: 'c1', productIds: null },
         global: {
            plugins: [i18NPlugin, PrimeVue, [VueQueryPlugin, { queryClient: new QueryClient() }]],
            directives: { tooltip: {} }
         }
      });
      await flushPromises();

      expect(wrapper.findAll('[data-pc-section="number"]').map((n) => n.text())).toEqual([
         '1',
         '2',
         '3'
      ]);
      expect(wrapper.findAll('[data-pc-section="title"]').map((n) => n.text())).toEqual([
         en.ops.transfer.steps.target,
         en.ops.transfer.steps.report,
         en.ops.transfer.steps.result
      ]);
   });
});
