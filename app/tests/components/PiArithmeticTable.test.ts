import '../setup/mockMain';
import { piDifferences } from '@/api/purchaseOrder/figures';
import PiArithmeticTable from '@/components/service-components/pi-arithmetic/PiArithmeticTable.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it } from 'vitest';

const terms = { deposit_rate: 30, pi_extra_amount: 0, pi_discount_amount: 0 };
const agreed = {
   pi_subtotal: 2000,
   pi_total: 2000,
   pi_deposit_amount: 600,
   pi_balance_amount: 1400,
   pi_extra_amount: 0,
   pi_discount_amount: 0
};

const mountTable = (rows: ReturnType<typeof piDifferences>['rows']) =>
   mount(PiArithmeticTable, {
      props: { rows, currency: 'USD' },
      global: { plugins: [i18NPlugin, PrimeVue] }
   });

beforeAll(() => i18n.setLocaleMessage('en', en));

describe('PiArithmeticTable', () => {
   it('marks the one S09 line whose PI total differs (2000 against 2500)', () => {
      const { rows } = piDifferences(
         [{ quantity: 1000, unit_price: 2, pi_line_total: 2500, label: 'THO-MOP' }],
         terms,
         agreed
      );
      const wrapper = mountTable(rows);

      const marked = wrapper.findAll('[data-test="pi-diff"]');
      expect(marked).toHaveLength(1);
      expect(marked[0]!.classes()).toContain('text-red-500');
      expect(marked[0]!.text()).toContain('THO-MOP');
      expect(marked[0]!.text()).toContain('500');
      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.pi.mismatch'));
      expect(wrapper.text()).not.toContain(i18n.t('ops.purchase_order.pi.matches'));
   });

   it('marks nothing and says the PI matches when every figure agrees', () => {
      const { rows } = piDifferences(
         [{ quantity: 1000, unit_price: 2, pi_line_total: 2000, label: 'THO-MOP' }],
         terms,
         agreed
      );
      const wrapper = mountTable(rows);

      expect(wrapper.find('[data-test="pi-diff"]').exists()).toBe(false);
      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.pi.matches'));
   });

   it('does not match while a PI total is missing, though nothing differs', () => {
      const { rows } = piDifferences([{ quantity: 1000, unit_price: 2 }], terms, {
         ...agreed,
         pi_total: null
      });
      const wrapper = mountTable(rows);

      expect(wrapper.find('[data-test="pi-diff"]').exists()).toBe(false);
      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.pi.mismatch'));
   });
});
