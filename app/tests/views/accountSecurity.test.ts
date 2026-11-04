import en from '@/plugins/i18n/locales/en/index.json';
import Security from '@/views/pages/account/sections/Security.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import type { ConfirmationOptions } from 'primevue/confirmationoptions';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   toast: vi.fn(),
   confirm: vi.fn(),
   updatePassword: vi.fn(),
   signOutOtherSessions: vi.fn(),
   logout: vi.fn(),
   errorHandler: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/appErrorHandler', () => ({ appErrorHandler: api.errorHandler }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ logout: api.logout }) }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: api.confirm }) }));
vi.mock('@/api/account', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/account')>()),
   updatePassword: api.updatePassword,
   signOutOtherSessions: api.signOutOtherSessions
}));

const mountSecurity = async () => {
   const wrapper = mount(Security, {
      global: {
         plugins: [i18NPlugin, PrimeVue],
         directives: { focustrap: {}, tooltip: {} }
      }
   });
   await flushPromises();
   return wrapper;
};

const signOutOthers = async () => {
   const wrapper = await mountSecurity();
   await wrapper.get('[data-sign-out-others]').trigger('click');
   return api.confirm.mock.calls[0]![0] as ConfirmationOptions;
};

describe('account Security section', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => api.signOutOtherSessions.mockResolvedValue(undefined));

   it('refuses passwords that do not match', async () => {
      const wrapper = await mountSecurity();
      const [password, confirmation] = wrapper.findAll('input');
      await password!.setValue('Secret123!');
      await confirmation!.setValue('Secret124!');

      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.text()).toContain(i18n.t('form.passwords_do_not_match'));
      expect(api.updatePassword).not.toHaveBeenCalled();
   });

   it('signs the other devices out once confirmed, keeping this session', async () => {
      const options = await signOutOthers();
      expect(options).toMatchObject({
         header: i18n.t('account.security.confirm_sign_out_others.header'),
         message: i18n.t('account.security.confirm_sign_out_others.question')
      });

      await options.accept!();
      await flushPromises();

      expect(api.signOutOtherSessions).toHaveBeenCalledOnce();
      expect(api.logout).not.toHaveBeenCalled();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ summary: i18n.t('account.security.signed_out_others') })
      );
   });

   it('reports a failed sign-out to the error handler, without the success toast', async () => {
      const error = new Error('Failed to fetch');
      api.signOutOtherSessions.mockRejectedValueOnce(error);
      const options = await signOutOthers();

      await options.accept!();
      await flushPromises();

      expect(api.errorHandler).toHaveBeenCalledWith(error);
      expect(api.toast).not.toHaveBeenCalled();
      expect(api.logout).not.toHaveBeenCalled();
   });

   it('does nothing when the confirmation is declined', async () => {
      const options = await signOutOthers();

      options.reject!();
      await flushPromises();

      expect(api.signOutOtherSessions).not.toHaveBeenCalled();
      expect(api.logout).not.toHaveBeenCalled();
      expect(api.toast).not.toHaveBeenCalled();
   });
});
