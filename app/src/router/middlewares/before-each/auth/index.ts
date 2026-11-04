import { ability } from '@plugins/casl';
import { AuthSessionMissingError, CustomAuthError } from '@supabase/supabase-js';
import { useToast } from 'primevue';
import type { NavigationGuardWithThis } from 'vue-router';

export const authBeforeEach: NavigationGuardWithThis<undefined> = async (to) => {
   // Invite and recovery links sign the user in through tokens in the URL hash.
   const params = new URLSearchParams(window.location.hash?.substring(1));
   const access_token = params.get('access_token');
   const refresh_token = params.get('refresh_token');

   if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;

      // Guards run in the app's injection context (vue-router >= 4.2), so the toast works here.
      useToast().add({
         life: 0,
         closable: true,
         severity: ToastSeverity.INFO,
         summary: i18n.t('auth.welcome.title'),
         detail: i18n.t('auth.please_dont_forget_to_update_your_password')
      });

      window.history.replaceState({}, document.title, to.path);

      return { name: 'account-security' };
   }

   const authStore = useAuthStore();
   await authStore.initialized;
   // Signing in loads the permissions in the background; a navigation right after waits for them.
   await authStore.accessReady();

   const { meta } = to;

   // A protected page without a session goes to the login page (router.onError, 401).
   if (meta.requiresAuth && !authStore.isSignedIn) {
      throw Object.assign(new AuthSessionMissingError(), { status: 401 });
   }

   if (to.matched.some((record) => record.meta.superAdmin) && !authStore.isSuperAdmin) {
      throw new CustomAuthError(
         i18n.t('errors.insufficient_permission'),
         i18n.t('errors.AuthInvalidCredentialsError'),
         403,
         undefined
      );
   }

   // A page of a module outside the company's plan shows what it would take instead.
   const lockedModule = to.matched
      .flatMap((record) => record.meta.requiredPermissions ?? [])
      .map(({ subject }) => authStore.lockedModule(subject))
      .find(Boolean);
   if (lockedModule) return { name: 'module-locked', params: { module: lockedModule } };

   if (
      meta.requiredPermissions?.some(({ action, subject }) => ability.cannot(action, subject)) ||
      (meta.anyPermission &&
         !meta.anyPermission.some(({ action, subject }) => ability.can(action, subject)))
   ) {
      throw new CustomAuthError(
         i18n.t('errors.insufficient_permission'),
         i18n.t('errors.AuthInvalidCredentialsError'),
         403,
         undefined
      );
   }
};
