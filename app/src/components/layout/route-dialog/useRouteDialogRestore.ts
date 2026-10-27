import { useAuthStore } from '@/store/auth';
import { ability } from '@plugins/casl';
import { until } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { dialogsToRestore, forgetDialog, markReopening } from './session';

/**
 * Reopens the route dialogs of the tab's session (see session.ts) once the user is signed in: after
 * a reload, after signing in again when the session had expired, and when a tenant whose dialogs
 * were closed by switching away is chosen again. Call once from App.vue.
 */
export function useRouteDialogRestore() {
   const authStore = useAuthStore();
   const { isSignedIn, currentTenant } = storeToRefs(authStore);
   const router = useRouter();

   let restoring = false;
   // A tenant switch during a restore restores once more, for the tenant chosen last.
   let again = false;

   watch(
      [isSignedIn, () => currentTenant.value?.id],
      async ([signedIn]) => {
         if (!signedIn) return;
         if (restoring) {
            again = true;
            return;
         }
         restoring = true;
         try {
            do {
               again = false;
               await authStore.initialized;
               await router.isReady();
               // Signing in from the login page: useAuthUi first leaves it; a dialog navigation now
               // would cancel that and leave the user on the login page.
               await until(
                  () => !router.currentRoute.value.name?.toString().startsWith('auth-')
               ).toBe(true, { timeout: 5000 });

               const userId = authStore.user?.id;
               if (!userId) return;

               // In opening order, so they stack as they did; those already on screen (e.g. opened by
               // the page's own URL) are left as they are.
               for (const dialog of dialogsToRestore(userId, currentTenant.value?.id ?? null)) {
                  const target = router.resolve(dialog.path);
                  const allowed = (target.meta.requiredPermissions ?? []).every(
                     ({ action, subject }) => ability.can(action, subject)
                  );

                  // Gone or no longer allowed: dropped quietly instead of showing an error page.
                  if (!target.matched.length || !allowed) {
                     forgetDialog(dialog.id);
                     continue;
                  }

                  markReopening(dialog);
                  // The dialog guard opens it and keeps the current page.
                  await router.push(dialog.path);
               }
            } while (again);
         } finally {
            restoring = false;
         }
      },
      { immediate: true }
   );
}
