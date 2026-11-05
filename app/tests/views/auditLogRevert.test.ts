import '../setup/mockMain';
import ActionButtons from '@/components/ui/custom-table/ActionButtons.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import { revertDisabledReason } from '@/views/pages/branch/audit_log/revertReason';
import i18n from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => i18n.setLocaleMessage('en', en));

const row = (table_name: string, reverted = false) => ({ tenant_id: 't', table_name, reverted });

describe('audit log revert', () => {
   it('says why a transfer entry cannot be reverted, and why a forbidden one is disabled', () => {
      const allowed = () => true;
      const forbidden = () => false;

      expect(revertDisabledReason(row('transfer'), allowed)).toBe(
         en.audit_log.revert_transfer_locked
      );
      expect(revertDisabledReason(row('transfer'), forbidden)).toBe(
         en.audit_log.revert_transfer_locked
      );
      expect(revertDisabledReason(row('product'), forbidden)).toBe(
         en.errors.insufficient_permission
      );
      expect(revertDisabledReason(row('product'), allowed)).toBeNull();
      // An entry reverted already says so in its label.
      expect(revertDisabledReason(row('transfer', true), allowed)).toBeNull();
   });

   it('shows a row action tooltip over the button even while it is disabled', () => {
      const wrapper = mount(ActionButtons, {
         props: {
            body: { data: { tenant_id: 't' } },
            items: [
               {
                  label: 'Attempt to revert',
                  disabled: true,
                  tooltip: () => 'Transfer entries cannot be reverted.',
                  icon: 'pi pi-refresh'
               },
               { label: 'Edit', icon: 'pi pi-pencil' }
            ] as never
         },
         global: {
            plugins: [createPinia(), PrimeVue],
            stubs: {
               Button: { props: ['disabled', 'icon'], template: '<button :disabled="disabled" />' }
            }
         }
      });

      const wrapped = wrapper.find('[data-row-action-tooltip]');
      expect(wrapped.find('button').attributes('disabled')).toBeDefined();
      // PrimeVue's tooltip keeps its value on the element it is bound to: the wrapper.
      expect((wrapped.element as HTMLElement & { $_ptooltipValue?: string }).$_ptooltipValue).toBe(
         'Transfer entries cannot be reverted.'
      );
      expect(wrapper.findAll('button')).toHaveLength(2);
   });
});
