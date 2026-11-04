import '../setup/mockMain';
import { AVATAR_MAX_BYTES } from '@/api/account/avatar';
import { localeDateString } from '@/lib/dayjs';
import en from '@/plugins/i18n/locales/en/index.json';
import AccountPage from '@/views/pages/account/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';

const api = vi.hoisted(() => ({
   push: vi.fn(),
   errorHandler: vi.fn(),
   toast: vi.fn(),
   uploadAvatar: vi.fn(),
   removeAvatar: vi.fn()
}));

const auth = reactive({ user: null as Record<string, unknown> | null });

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/appErrorHandler', () => ({ appErrorHandler: api.errorHandler }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('@/api/account/avatar', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/account/avatar')>()),
   uploadAvatar: api.uploadAvatar,
   removeAvatar: api.removeAvatar
}));
vi.mock('@/router/menu', async () => {
   const { computed } = await import('vue');
   return {
      useMenuSection: () =>
         computed(() => ({
            items: [
               { key: 'account-profile', name: 'account-profile', label: 'Profile' },
               { key: 'account-security', name: 'account-security', label: 'Security' }
            ]
         }))
   };
});
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({
      name: 'account-security',
      matched: [{ name: 'account' }, { name: 'account-security' }]
   }),
   useRouter: () => ({ push: api.push })
}));

const AvatarPlaceholder = defineComponent({
   props: ['src', 'placeholder'],
   setup: (props) => () => h('img', { 'data-avatar': props.src ?? '', alt: props.placeholder })
});

const bucketUrl = `${import.meta.env.VITE_SUPABASE_PROJECT_URL}/storage/v1/object/public/avatar/u1/avatar.png?v=1`;

const user = (overrides: Record<string, unknown> = {}) => ({
   id: 'u1',
   email: 'ada@x.test',
   email_confirmed_at: '2026-01-02T00:00:00Z',
   created_at: '2026-01-01T00:00:00Z',
   user_metadata: { display_name: 'Ada Lovelace' },
   ...overrides
});

const mountPage = async () => {
   const wrapper = mount(AccountPage, {
      global: {
         plugins: [i18NPlugin, PrimeVue],
         stubs: { AvatarPlaceholder, CustomRouteView: true }
      }
   });
   await flushPromises();
   return wrapper;
};

const select = async (wrapper: Awaited<ReturnType<typeof mountPage>>, file: File) => {
   const input = wrapper.get('input[type="file"]');
   Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
   await input.trigger('change');
   await flushPromises();
};

describe('My account page', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      // The tab list sets its ink bar on a timer; run it while the page is still there.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      auth.user = user();
      api.uploadAvatar.mockResolvedValue('https://x.test/u1/avatar.png?v=1');
      api.removeAvatar.mockResolvedValue(undefined);
   });
   afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
   });

   it('marks the section of the current route as the active tab', async () => {
      const wrapper = await mountPage();
      const tabs = wrapper.findAll('[role="tab"]');

      expect(tabs.map((tab) => tab.text())).toEqual(['Profile', 'Security']);
      expect(tabs[1]!.attributes('data-p-active')).toBe('true');
      expect(tabs[0]!.attributes('data-p-active')).toBe('false');
   });

   it('opens a section from its tab', async () => {
      const wrapper = await mountPage();
      await wrapper.findAll('[role="tab"]')[0]!.trigger('click');
      expect(api.push).toHaveBeenCalledWith({ name: 'account-profile' });
   });

   // The route stays on Security in these, as it does when a guard refuses the navigation.
   const activeTabs = async (wrapper: Awaited<ReturnType<typeof mountPage>>) => {
      await flushPromises();
      return wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('data-p-active'));
   };

   it('keeps the open section selected when the navigation is refused', async () => {
      api.push.mockResolvedValueOnce({ type: 4, from: {}, to: {} });
      const wrapper = await mountPage();

      await wrapper.findAll('[role="tab"]')[0]!.trigger('click');

      expect(await activeTabs(wrapper)).toEqual(['false', 'true']);
   });

   it('keeps the open section selected when the navigation fails, reporting the error', async () => {
      const error = new Error('guard failed');
      api.push.mockRejectedValueOnce(error);
      const wrapper = await mountPage();

      await wrapper.findAll('[role="tab"]')[0]!.trigger('click');

      expect(await activeTabs(wrapper)).toEqual(['false', 'true']);
      expect(api.errorHandler).toHaveBeenCalledWith(error);
   });

   it('shows the name, the email and whether the email is verified', async () => {
      const wrapper = await mountPage();
      expect(wrapper.text()).toContain('Ada Lovelace');
      expect(wrapper.text()).toContain('ada@x.test');
      expect(wrapper.text()).toContain(i18n.t('account.header.email_verified'));
      const date = localeDateString({ value: '2026-01-01T00:00:00Z', validate: false });
      expect(wrapper.text()).toContain(i18n.t('account.header.member_since', { date }));

      auth.user = user({ email_confirmed_at: null });
      await flushPromises();
      expect(wrapper.text()).toContain(i18n.t('account.header.email_not_verified'));
   });

   it('uploads a chosen photo for the signed-in user', async () => {
      const wrapper = await mountPage();
      const file = new File(['png'], 'me.png', { type: 'image/png' });

      await select(wrapper, file);

      expect(api.uploadAvatar).toHaveBeenCalledWith(file, 'u1');
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ summary: i18n.t('toast.updated') })
      );
   });

   it('reports a failed upload to the error handler, without the success toast', async () => {
      const error = new Error('Failed to fetch');
      api.uploadAvatar.mockRejectedValueOnce(error);
      const wrapper = await mountPage();

      await select(wrapper, new File(['png'], 'me.png', { type: 'image/png' }));

      expect(api.errorHandler).toHaveBeenCalledWith(error);
      expect(api.toast).not.toHaveBeenCalledWith(
         expect.objectContaining({ summary: i18n.t('toast.updated') })
      );
   });

   it('explains a photo that is too large instead of uploading it', async () => {
      const wrapper = await mountPage();
      const file = new File(['png'], 'big.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: AVATAR_MAX_BYTES + 1 });

      await select(wrapper, file);

      expect(api.uploadAvatar).not.toHaveBeenCalled();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ detail: i18n.t('errors.avatar_size') })
      );
   });

   it('offers to remove the photo only when there is one', async () => {
      const remove = () => wrapper.find('[data-avatar-remove]');
      let wrapper = await mountPage();
      expect(remove().exists()).toBe(false);

      auth.user = user({ user_metadata: { display_name: 'Ada Lovelace', avatar_url: bucketUrl } });
      wrapper = await mountPage();
      expect(wrapper.get('[data-avatar]').attributes('data-avatar')).toBe(bucketUrl);
      await remove().trigger('click');
      await flushPromises();

      expect(api.removeAvatar).toHaveBeenCalledWith('u1');
   });

   it('does not load a photo URL outside the avatar bucket, but offers to remove it', async () => {
      auth.user = user({
         user_metadata: { display_name: 'Ada Lovelace', avatar_url: 'https://x.test/a.png' }
      });
      const wrapper = await mountPage();

      expect(wrapper.get('[data-avatar]').attributes('data-avatar')).toBe('');
      expect(wrapper.find('[data-avatar-remove]').exists()).toBe(true);
   });
});
