import '../setup/mockMain';
import type { GlossaryEnum } from '@/api/glossary';
import StatusActions from '@/components/service-components/status-actions/StatusActions.vue';
import { stripTerms } from '@/constants/terms';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const handler = vi.hoisted(() => ({ appErrorHandler: vi.fn() }));
vi.mock('@/lib/appErrorHandler', () => handler);

const PREFIX = 'ops.purchase_order.status';

const mountActions = (props: {
   next: readonly string[];
   glossary?: GlossaryEnum;
   warnings?: Partial<Record<string, string>>;
   disabled?: boolean;
   onChange?: (status: string) => Promise<unknown>;
}) =>
   mount(StatusActions, {
      props: {
         current: 'ready',
         i18nPrefix: PREFIX,
         onChange: vi.fn(() => Promise.resolve()),
         ...props
      },
      global: {
         plugins: [i18NPlugin, PrimeVue, ConfirmationService, ToastService],
         stubs: { teleport: true }
      }
   });

const button = (wrapper: ReturnType<typeof mountActions>, status: string) =>
   wrapper.get(`[data-status="${status}"]`);

const confirmButton = (wrapper: ReturnType<typeof mountActions>) =>
   wrapper.get('.p-confirmdialog-accept-button');

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => handler.appErrorHandler.mockReset());

describe('StatusActions', () => {
   it('offers one button per next status, cancelling last as a danger text button', () => {
      const wrapper = mountActions({ next: ['cancelled', 'sent'] });

      const buttons = wrapper.findAll('[data-status]');
      expect(buttons.map((b) => b.attributes('data-status'))).toEqual(['sent', 'cancelled']);
      expect(buttons[0]!.text()).toBe(i18n.t(`${PREFIX}.sent`));
      expect(buttons[1]!.classes()).toEqual(
         expect.arrayContaining(['p-button-danger', 'p-button-text'])
      );
      expect(buttons[0]!.classes()).not.toContain('p-button-danger');
   });

   it('shows the glossary line of each status as the button tooltip', () => {
      const wrapper = mountActions({ next: ['accepted'], glossary: 'shipment_status' });

      // PrimeVue's tooltip directive keeps its text on the element.
      const element = button(wrapper, 'accepted').element as HTMLElement & {
         $_ptooltipValue?: string;
      };
      expect(element.$_ptooltipValue).toBe(stripTerms(i18n.t('glossary.shipment_status.accepted')));
      expect(element.$_ptooltipValue).not.toContain('[[');
   });

   it('asks to confirm the target status, then changes it once', async () => {
      const onChange = vi.fn(() => Promise.resolve());
      const wrapper = mountActions({ next: ['sent', 'cancelled'], onChange });

      await button(wrapper, 'sent').trigger('click');
      expect(wrapper.text()).toContain(
         i18n.t('status_actions.confirm', { status: i18n.t(`${PREFIX}.sent`) })
      );
      expect(onChange).not.toHaveBeenCalled();

      await confirmButton(wrapper).trigger('click');
      await flushPromises();
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith('sent');
      expect(handler.appErrorHandler).not.toHaveBeenCalled();
   });

   it("hands the database's refusal to the error handler", async () => {
      const refusal = { code: '23514', message: 'po_lines_required' };
      const wrapper = mountActions({
         next: ['sent', 'cancelled'],
         onChange: () => Promise.reject(refusal)
      });

      await button(wrapper, 'sent').trigger('click');
      await confirmButton(wrapper).trigger('click');
      await flushPromises();
      expect(handler.appErrorHandler).toHaveBeenCalledOnce();
      expect(handler.appErrorHandler).toHaveBeenCalledWith(refusal);
   });

   it("shows a status's warning in its own dialog only", async () => {
      const wrapper = mountActions({
         next: ['balance_paid', 'cancelled'],
         warnings: { balance_paid: 'X-WARNING' }
      });

      await button(wrapper, 'cancelled').trigger('click');
      expect(wrapper.find('[data-test="status-warning"]').exists()).toBe(false);
      await wrapper.get('.p-confirmdialog-reject-button').trigger('click');
      await flushPromises();

      await button(wrapper, 'balance_paid').trigger('click');
      expect(wrapper.get('[data-test="status-warning"]').text()).toBe('X-WARNING');
   });

   it('offers no move while disabled (e.g. unsaved edits on the card)', async () => {
      const onChange = vi.fn(() => Promise.resolve());
      const wrapper = mountActions({ next: ['sent', 'cancelled'], disabled: true, onChange });

      for (const status of ['sent', 'cancelled'])
         expect(button(wrapper, status).attributes('disabled')).toBeDefined();
      await button(wrapper, 'sent').trigger('click');
      expect(wrapper.find('.p-confirmdialog-accept-button').exists()).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
   });
});
