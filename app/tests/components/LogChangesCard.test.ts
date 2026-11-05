import '../setup/mockMain';
import LogChangesCard from '@/components/service-components/audit-log/LogChangesCard.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it } from 'vitest';

const row = (overrides: Record<string, unknown>) =>
   ({
      id: 1,
      transaction_id: 't1',
      table_name: 'incident',
      record_id: '00000000-0000-4000-8000-000000000001',
      operation: 'INSERT',
      old_data: null,
      new_data: null,
      tenant_id: 'tenant',
      user_id: null,
      created_at: '2026-11-05T10:00:00Z',
      ...overrides
   }) as never;

const mountCard = (data: never) =>
   mount(LogChangesCard, {
      props: { data },
      global: {
         plugins: [i18NPlugin, PrimeVue],
         stubs: { CustomLink: { template: '<a><slot :navigate="() => {}" /></a>' } }
      }
   });

describe('LogChangesCard', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('renders an inserted row whose columns hold arrays', () => {
      const wrapper = mountCard(
         row({
            new_data: {
               title: 'Two pallets short',
               affected_parties: ['customer', 'forwarder'],
               tags: []
            }
         })
      );

      expect(wrapper.text()).toContain('Two pallets short');
      expect(wrapper.text()).toContain('customer');
      expect(wrapper.text()).toContain('forwarder');
   });

   it('renders nested arrays inside objects', () => {
      const wrapper = mountCard(
         row({
            operation: 'UPDATE',
            old_data: { packages: ['A'] },
            new_data: { packages: ['A', 'B'], meta: { codes: ['x', 'y'] } }
         })
      );

      expect(wrapper.text()).toContain('B');
      expect(wrapper.text()).toContain('y');
   });
});
