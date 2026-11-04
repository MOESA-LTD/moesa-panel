import '../setup/mockMain';
import en from '@/plugins/i18n/locales/en/index.json';
import Profile from '@/views/pages/account/sections/Profile.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ toast: vi.fn(), updateProfile: vi.fn(), guard: vi.fn() }));

const auth = {
   user: { id: 'u1', email: 'ada@x.test', phone: '', user_metadata: { display_name: 'Ada' } }
};

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: api.guard }));
vi.mock('@/api/account', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/account')>()),
   updateProfile: api.updateProfile
}));

const mountProfile = async () => {
   const wrapper = mount(Profile, {
      global: {
         plugins: [i18NPlugin, PrimeVue],
         directives: { focustrap: {}, tooltip: {} },
         stubs: { PhoneInput: true }
      }
   });
   await flushPromises();
   return wrapper;
};

// The text inputs in order: name, then email (the phone input is stubbed).
const input = (wrapper: Awaited<ReturnType<typeof mountProfile>>, field: 'name' | 'email') =>
   wrapper.findAll('input')[field === 'name' ? 0 : 1]!;

const submit = async (wrapper: Awaited<ReturnType<typeof mountProfile>>) => {
   await wrapper.get('form').trigger('submit');
   await flushPromises();
};

describe('account Profile section', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      api.updateProfile.mockImplementation(async ({ display_name }) => ({
         ...auth.user,
         user_metadata: { display_name }
      }));
   });

   it('says how an email change is confirmed and guards unsaved changes', async () => {
      const wrapper = await mountProfile();
      expect(wrapper.text()).toContain(i18n.t('account.profile.email_change_hint'));
      expect(api.guard).toHaveBeenCalledOnce();
   });

   it('saves the profile and says it was updated', async () => {
      const wrapper = await mountProfile();
      await input(wrapper, 'name').setValue('Ada L');

      await submit(wrapper);

      expect(api.updateProfile).toHaveBeenCalledOnce();
      expect(api.updateProfile).toHaveBeenCalledWith(
         expect.objectContaining({ display_name: 'Ada L', email: 'ada@x.test' })
      );
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ summary: i18n.t('toast.updated') })
      );
   });

   it('tells the user to confirm a new email at the new address', async () => {
      const wrapper = await mountProfile();
      await input(wrapper, 'email').setValue('new@x.test');

      await submit(wrapper);

      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({
            summary: i18n.t('account.profile.email_change_sent', { email: 'new@x.test' })
         })
      );
      expect(api.toast).not.toHaveBeenCalledWith(
         expect.objectContaining({ summary: i18n.t('toast.updated') })
      );
   });
});
