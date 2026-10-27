// app/src/store/auth/index.ts

import { fetchAccess, type Access, type Tenant } from '@/api/access';
import { clearDialogs } from '@/components/layout/route-dialog/session';
import { clearDrafts } from '@/lib/form/drafts';
import { supabase } from '@/lib/supabase';
import { ability, toAbilityRules } from '@plugins/casl';
import { queryKeys } from '@/api/queryKeys';
import { clearQueryCache, queryClient } from '@plugins/tanstack-query';
import type {
   RealtimeChannel,
   Session,
   SignInWithPasswordCredentials
} from '@supabase/supabase-js';
import { useEventListener } from '@vueuse/core';
import { jwtDecode } from 'jwt-decode';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';

export type { Tenant };

/** Claims added to the access token by private.custom_access_token_hook. */
export type JwtPayload = {
   user_metadata?: { current_tenant_id?: string } & Record<string, unknown>;
};

/** The first label of the host (tenant.example.com), unless the host is an IP address. */
const SUBDOMAIN = /^(?:https?:\/\/)?(?<tenant>(?!\d+\.\d+\.\d+\.\d+)[a-zA-Z0-9-]+)\./;

/**
 * Session and access state. The session identifies the user; their tenants and permissions come
 * from the database (my_access), which RLS also enforces, and are reloaded whenever they may have
 * changed. UI reactions (toasts, redirects) live in useAuthUi.
 */
export const useAuthStore = defineStore('auth', () => {
   const session = shallowRef<Session | null>(null);

   const user = computed(() => session.value?.user ?? null);
   const isSignedIn = computed(() => !!user.value);

   const jwt = computed(() =>
      session.value?.access_token ? jwtDecode<JwtPayload>(session.value.access_token) : null
   );

   // Access

   const access = shallowRef<Access | null>(null);

   /** The tenant picked in this tab; until then the user's saved one (current_tenant_id). */
   const preferredTenantId = ref<string | null>(null);

   const branches = computed(() => access.value?.tenants ?? []);

   const subdomainTenant = SUBDOMAIN.exec(window.location.href)?.groups?.tenant ?? null;

   /** The tenant the permissions belong to, which every request names (x-tenant-id). */
   const currentTenant = computed<Tenant | null>(
      () => branches.value.find(({ id }) => id === access.value?.tenant_id) ?? null
   );

   watch(
      () => access.value?.permissions,
      (permissions) => ability.update(toAbilityRules(permissions)),
      { immediate: true }
   );

   // The newest load wins; an older one finishing later is dropped.
   let latestLoad = 0;
   let loading: Promise<void> = Promise.resolve();

   async function loadAccess() {
      const load = ++latestLoad;
      if (!session.value) {
         access.value = null;
         return;
      }

      const requested =
         preferredTenantId.value ?? jwt.value?.user_metadata?.current_tenant_id ?? null;
      const result = await fetchAccess(requested);
      if (load !== latestLoad) return;

      // A tenant's own subdomain opens that tenant.
      const fromSubdomain = result?.tenants.find(
         ({ display_name }) => display_name === subdomainTenant
      );
      if (fromSubdomain && !preferredTenantId.value && fromSubdomain.id !== result?.tenant_id) {
         preferredTenantId.value = fromSubdomain.id;
         return loadAccess();
      }

      access.value = result;
   }

   /** Reloads the user's tenants and permissions; resolves when they are in place. */
   function refreshAccess() {
      loading = loadAccess();
      return loading;
   }

   /** Resolves once the access of the current session is loaded (or failed to load). */
   const accessReady = () => loading.catch(() => {});

   // Changes to roles, permissions or memberships are broadcast to the users they affect
   // (private.notify_access_changed); other tabs, devices and admins' edits show up right away.
   let accessChannel: RealtimeChannel | null = null;
   let accessUserId: string | null = null;
   async function listenForAccessChanges(userId: string | null) {
      // Once per user: removing a channel is async and, with no channel left, closes the socket,
      // which would take a channel subscribed meanwhile down with it.
      if (userId === accessUserId) return;
      accessUserId = userId;

      const previous = accessChannel;
      accessChannel = null;
      if (previous) await supabase.removeChannel(previous);
      if (!userId || userId !== accessUserId) return;

      // A private channel is joined with the user's token, which Realtime may not have yet.
      await supabase.realtime.setAuth(session.value?.access_token ?? null);
      if (userId !== accessUserId) return;

      accessChannel = supabase
         .channel(`access:${userId}`, { config: { private: true } })
         .on('broadcast', { event: 'access_changed' }, () => refreshAccess().catch(() => {}))
         .subscribe();
   }

   // Coming back to the tab picks up changes made while the broadcast could not arrive.
   useEventListener(window, 'focus', () => {
      if (isSignedIn.value) refreshAccess().catch(() => {});
   });

   async function changeCurrentTenant(tenant: Tenant) {
      const previousId = currentTenant.value?.id ?? null;
      if (!tenant || tenant.id === previousId) return;

      preferredTenantId.value = tenant.id;
      await refreshAccess();

      // Remembered for the next sign-in, on any device.
      const { error } = await supabase.auth.updateUser({ data: { current_tenant_id: tenant.id } });
      if (error) throw error;

      // Queries are keyed by tenant, so the open pages already fetch the new tenant's rows.
      // Clearing the whole cache here would abort those fetches; drop only the previous tenant.
      queryClient.removeQueries({ queryKey: queryKeys.tenant(previousId) });
   }

   let resolveInitialized: () => void;
   /** Resolves once the stored session (if any) and its access have been restored. */
   const initialized = new Promise<void>((resolve) => (resolveInitialized = resolve));

   supabase.auth.onAuthStateChange((event, newSession) => {
      // Without a session nothing cached may survive: the next user could be someone else.
      if (!newSession) clearQueryCache();

      const userChanged = newSession?.user.id !== session.value?.user.id;
      session.value = newSession;

      if (userChanged || event === 'INITIAL_SESSION') {
         preferredTenantId.value = null;
         // Pending right away, so a navigation right after signing in waits for the permissions;
         // the call itself is deferred, as Supabase calls inside this callback can deadlock.
         loading = new Promise<void>((resolve, reject) =>
            setTimeout(() => {
               void listenForAccessChanges(newSession?.user.id ?? null);
               loadAccess().then(resolve, reject);
            })
         );
         loading.catch((error) => console.error('Could not load the access:', error));
         if (event === 'INITIAL_SESSION') void accessReady().then(resolveInitialized);
      }
   });

   async function loginWithPassword(credentials: SignInWithPasswordCredentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      return data;
   }

   async function logout() {
      const result = await supabase.auth.signOut();
      // Signing out on purpose leaves nothing of the user's work in the tab. Cleared after the
      // sign-out: with no user, no pending draft can be written back. (A session that merely
      // expires keeps drafts and dialogs, so signing in again picks up where the user was.)
      clearDrafts();
      clearDialogs();
      return result;
   }

   return {
      session,
      user,
      jwt,
      isSignedIn,
      branches,
      currentTenant,
      changeCurrentTenant,
      refreshAccess,
      accessReady,
      ability,
      loginWithPassword,
      logout,
      initialized
   };
});
