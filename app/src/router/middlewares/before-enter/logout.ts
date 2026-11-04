import { useLogout } from '@/composables/useLogout';
import { useAuthStore } from '@/store/auth';
import type { NavigationGuardWithThis } from 'vue-router';

/**
 * For the sign-in pages: a signed-in user is asked to sign out first. Confirming ends on the
 * login page; declining stays where the user was (or opens the profile on a first load).
 */
export const logoutBeforeEnter: NavigationGuardWithThis<undefined> = async (to, from) => {
   // Injected before the first await: guards only have the app's injection context until then.
   const { confirmLogout } = useLogout();
   const authStore = useAuthStore();

   await authStore.initialized;
   if (!authStore.isSignedIn) return true;

   if (await confirmLogout()) return to.name === 'auth-login' ? true : { name: 'auth-login' };
   return from.matched.length > 0 ? false : { name: 'account-profile' };
};
