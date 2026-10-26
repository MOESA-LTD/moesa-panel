import { ability } from '@plugins/casl';
import { CustomAuthError } from '@supabase/supabase-js';
import { useToast } from 'primevue';
import type { NavigationGuardWithThis } from 'vue-router';

export const authBeforeEach: NavigationGuardWithThis<undefined> = async (to, from) => {
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

      return { name: 'update-password' };
   }

   await useAuthStore().initialized;

   const { meta } = to;

   // Entering a protected route checks that the session is still valid on the server.
   if (
      meta.requiresAuth &&
      (from.name !== to.name || (to.redirectedFrom?.name && to.redirectedFrom.name !== to.name))
   ) {
      const { error } = await supabase.auth.refreshSession();
      if (error) throw Object.assign(error, { status: 401 });
   }

   if (meta.requiredPermissions?.some(({ action, subject }) => ability.cannot(action, subject))) {
      throw new CustomAuthError(
         i18n.t('errors.insufficient_permission'),
         i18n.t('errors.AuthInvalidCredentialsError'),
         403,
         undefined
      );
   }
};
