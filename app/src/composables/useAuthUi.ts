import { useAuthStore } from '@/store/auth';
import i18n from '@plugins/i18n';
import { ToastSeverity } from '@primevue/core/api';
import { storeToRefs } from 'pinia';
import { useToast } from 'primevue/usetoast';
import { watch } from 'vue';
import {
   useRoute,
   useRouter,
   type RouteLocationRaw,
   type RouteRecordNameGeneric
} from 'vue-router';

const isAuthRoute = (name: RouteRecordNameGeneric | null | undefined) =>
   !!name?.toString().startsWith('auth-');

/**
 * Reacts to signing in and out: greets the user and moves between auth pages and the app.
 * Call once from App.vue (it needs the component context for the toast and router).
 */
export function useAuthUi() {
   const authStore = useAuthStore();
   const { isSignedIn } = storeToRefs(authStore);
   const toast = useToast();
   const router = useRouter();
   const route = useRoute();

   // Restoring a stored session on page load is not a sign-in and gets no greeting.
   let restored = false;
   authStore.initialized.then(() => (restored = true));

   watch(isSignedIn, async (signedIn, wasSignedIn) => {
      const greet = restored;
      await authStore.initialized;
      await router.isReady();

      if (signedIn && !wasSignedIn) {
         if (greet) {
            toast.add({
               life: 3000,
               severity: ToastSeverity.SUCCESS,
               summary: i18n.t('auth.toast.welcome')
            });
         }

         // Back to where the user was sent to the login page from, unless that was an auth page too.
         if (isAuthRoute(route.name)) {
            const back = router.options.history.state.back as RouteLocationRaw | null;
            await router.replace(back && !isAuthRoute(router.resolve(back).name) ? back : '/');
         }
         return;
      }

      if (!signedIn && wasSignedIn) {
         toast.add({
            life: 3000,
            severity: ToastSeverity.INFO,
            summary: i18n.t('auth.toast.goodby')
         });

         if (route.meta?.requiresAuth) await router.push({ name: 'auth-login' });
      }
   });
}
