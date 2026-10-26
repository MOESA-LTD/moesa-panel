// app/src/store/auth/index.ts

import { supabase } from '@/lib/supabase';
import { ability, toAbilityRules, type PermissionClaim } from '@plugins/casl';
import { queryKeys } from '@/api/queryKeys';
import { clearQueryCache, queryClient } from '@plugins/tanstack-query';
import type { Session, SignInWithPasswordCredentials } from '@supabase/supabase-js';
import { jwtDecode } from 'jwt-decode';
import { defineStore } from 'pinia';
import { computed, shallowRef, watch } from 'vue';

export type Tenant = { id: string; display_name: string };

/** Claims added to the access token by private.custom_access_token_hook. */
export type JwtPayload = {
   app_metadata?: {
      allowed_tenant?: Tenant[];
      permission?: PermissionClaim[];
   };
   user_metadata?: { current_tenant_id?: string } & Record<string, unknown>;
};

/** The first label of the host (tenant.example.com), unless the host is an IP address. */
const SUBDOMAIN = /^(?:https?:\/\/)?(?<tenant>(?!\d+\.\d+\.\d+\.\d+)[a-zA-Z0-9-]+)\./;

/**
 * Session state only. Everything else (user, tenant, permissions) is derived from the session, so
 * it updates with every token refresh. UI reactions (toasts, redirects) live in useAuthUi.
 */
export const useAuthStore = defineStore('auth', () => {
   const session = shallowRef<Session | null>(null);

   const user = computed(() => session.value?.user ?? null);
   const isSignedIn = computed(() => !!user.value);

   const jwt = computed(() =>
      session.value?.access_token ? jwtDecode<JwtPayload>(session.value.access_token) : null
   );

   const branches = computed(() => jwt.value?.app_metadata?.allowed_tenant ?? []);

   const subdomainTenant = SUBDOMAIN.exec(window.location.href)?.groups?.tenant ?? null;

   /** The tenant chosen in the token, the one named by the subdomain, or the first allowed one. */
   const currentTenant = computed<Tenant | null>(() => {
      const currentId = jwt.value?.user_metadata?.current_tenant_id;
      return (
         branches.value.find(
            ({ id, display_name }) => id === currentId || display_name === subdomainTenant
         ) ??
         branches.value[0] ??
         null
      );
   });

   // Permissions are part of the token, so a refresh (e.g. after a role change) updates them.
   watch(
      () => jwt.value?.app_metadata?.permission,
      (permissions) => ability.update(toAbilityRules(permissions)),
      { immediate: true }
   );

   async function changeCurrentTenant(tenant: Tenant) {
      const previousId = currentTenant.value?.id ?? null;
      if (!tenant || tenant.id === previousId) return;

      const { error } = await supabase.auth.updateUser({ data: { current_tenant_id: tenant.id } });
      if (error) throw error;

      // The new token carries the tenant and its permissions.
      await supabase.auth.refreshSession();

      // Queries are keyed by tenant, so the open pages already fetch the new tenant's rows.
      // Clearing the whole cache here would abort those fetches; drop only the previous tenant.
      queryClient.removeQueries({ queryKey: queryKeys.tenant(previousId) });
   }

   let resolveInitialized: () => void;
   /** Resolves once the stored session (if any) has been restored. */
   const initialized = new Promise<void>((resolve) => (resolveInitialized = resolve));

   supabase.auth.onAuthStateChange((event, newSession) => {
      // Without a session nothing cached may survive: the next user could be someone else.
      if (!newSession) clearQueryCache();

      session.value = newSession;

      if (event === 'INITIAL_SESSION') resolveInitialized();
   });

   async function loginWithPassword(credentials: SignInWithPasswordCredentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      return data;
   }

   async function logout() {
      return await supabase.auth.signOut();
   }

   return {
      session,
      user,
      jwt,
      isSignedIn,
      branches,
      currentTenant,
      changeCurrentTenant,
      ability,
      loginWithPassword,
      logout,
      initialized
   };
});
