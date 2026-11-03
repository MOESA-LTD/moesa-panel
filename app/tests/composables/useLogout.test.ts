import { useLogout } from '@/composables/useLogout';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n from '@plugins/i18n';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Options = {
   accept: () => Promise<void>;
   reject: () => void;
   onHide: () => void;
   header: string;
   message: string;
};

const require = vi.fn();
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require }) }));

const logout = vi.fn();
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ logout }) }));

const options = () => require.mock.calls.at(-1)![0] as Options;

describe('useLogout', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      require.mockReset();
      logout.mockReset().mockResolvedValue({ error: null });
   });

   it('signs out and resolves true when accepted', async () => {
      const pending = useLogout().confirmLogout();
      expect(options()).toMatchObject({
         message: i18n.t('auth.confirm.logout.question'),
         header: i18n.t('auth.confirm.logout.header')
      });

      void options().accept();
      await expect(pending).resolves.toBe(true);
      expect(logout).toHaveBeenCalledOnce();
   });

   it('resolves false without signing out when rejected', async () => {
      const pending = useLogout().confirmLogout();
      options().reject();
      await expect(pending).resolves.toBe(false);
      expect(logout).not.toHaveBeenCalled();
   });

   it('resolves false when the dialog is hidden', async () => {
      const pending = useLogout().confirmLogout();
      options().onHide();
      await expect(pending).resolves.toBe(false);
   });

   it('rejects with the sign-out error', async () => {
      const error = new Error('x');
      logout.mockResolvedValue({ error });
      const pending = useLogout().confirmLogout();
      void options().accept();
      await expect(pending).rejects.toBe(error);
   });
});
