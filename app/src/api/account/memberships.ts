import type { Tenant } from '@/api/access';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import i18n from '@plugins/i18n';
import { useQuery } from '@tanstack/vue-query';
import { computed, type ComputedRef, type Ref } from 'vue';

/** The roles the user holds in a tenant (public.my_memberships). */
export type TenantRoles = { tenant_id: string; roles: string[] };

/** A tenant the user may use, as the account page lists it. */
export type Membership = {
   id: string;
   display_name: string;
   /** How far below its root (in the user's tenants) it sits. */
   depth: number;
   /** Whether the user owns it (directly or through a tenant above). */
   owned: boolean;
   /** The roles the user holds in it; none for one reached only through ownership. */
   roles: string[];
};

/** The user's roles per tenant; a tenant reached only through ownership has no row. */
export async function fetchMyRoles(): Promise<TenantRoles[]> {
   const { data } = await supabase.rpc('my_memberships').throwOnError();
   return data ?? [];
}

/**
 * The user's tenants (my_access, which includes the owned ones) in tree order with their roles:
 * each parent before its branches, siblings by name. A tenant whose parent the user cannot use is
 * a root; roles of a tenant not among `tenants` are left out.
 */
export function toMemberships(tenants: Tenant[], roles: TenantRoles[]): Membership[] {
   const rolesOf = new Map(roles.map((row) => [row.tenant_id, row.roles]));
   const ids = new Set(tenants.map(({ id }) => id));
   const children = new Map<string | null, Tenant[]>();
   for (const tenant of tenants) {
      const parent = tenant.parent_id && ids.has(tenant.parent_id) ? tenant.parent_id : null;
      children.set(parent, [...(children.get(parent) ?? []), tenant]);
   }

   const locale = i18n.locale.value;
   const result: Membership[] = [];
   const visit = (parent: string | null, depth: number) => {
      const siblings = [...(children.get(parent) ?? [])].sort((a, b) =>
         a.display_name.localeCompare(b.display_name, locale)
      );
      for (const tenant of siblings) {
         result.push({
            id: tenant.id,
            display_name: tenant.display_name,
            depth,
            owned: !!tenant.owned,
            roles: rolesOf.get(tenant.id) ?? []
         });
         visit(tenant.id, depth + 1);
      }
   };
   visit(null, 0);
   return result;
}

/**
 * The signed-in user's tenants with their roles, refetched whenever the page opens; nothing is
 * asked while no one is signed in. `isError` is set when the roles could not be loaded.
 */
export function useMyMemberships(): {
   memberships: ComputedRef<Membership[]>;
   isPending: Ref<boolean>;
   isError: Ref<boolean>;
} {
   const authStore = useAuthStore();
   const { data, isPending, isError } = useQuery({
      queryKey: computed(() => ['my_memberships', authStore.user?.id]),
      queryFn: fetchMyRoles,
      enabled: computed(() => !!authStore.user),
      staleTime: 0
   });

   return {
      memberships: computed(() => toMemberships(authStore.branches, data.value ?? [])),
      isPending,
      isError
   };
}
