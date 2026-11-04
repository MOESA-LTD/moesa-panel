import { useConfirmAction } from '@/composables/useConfirmAction';
import { useAuthStore } from '@/store/auth';
import i18n from '@plugins/i18n';

/**
 * Signing out after a confirmation. It does not navigate: `useAuthUi` moves a signed-out user
 * off a protected page. Call it during setup (or before a guard's first `await`).
 */
export function useLogout() {
   const confirm = useConfirmAction();
   const authStore = useAuthStore();

   /** Resolves whether the user signed out; rejects with the sign-out error. */
   const confirmLogout = () =>
      confirm({
         header: i18n.t('auth.confirm.logout.header'),
         message: i18n.t('auth.confirm.logout.question'),
         accept: async () => {
            const { error } = await authStore.logout();
            if (error) throw error;
         }
      });

   return { confirmLogout };
}
