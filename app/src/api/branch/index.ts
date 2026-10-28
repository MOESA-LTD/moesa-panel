import type { Tenant } from '@/api/access';
import { forTenant } from '@/api/formTenant';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { email, optional, phone, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

export type Branch = Pick<
   Tables['tenant']['Row'],
   'id' | 'display_name' | 'email' | 'phone' | 'parent_id'
>;

/** A new branch names the branch it opens under; an existing one is changed in place. */
export type BranchInput = Pick<Branch, 'display_name' | 'email' | 'phone'> & {
   id?: string | null;
   parent_id?: string | null;
};

const SELECT = 'id, display_name, email, phone, parent_id';

export const branchRepository = {
   // Read and written as the branch itself, so its own permissions apply (not the active one's).
   async get(id: string, signal: AbortSignal) {
      const { data } = await forTenant(
         supabase.from('tenant').select(SELECT).eq('id', id).abortSignal(signal),
         id
      )
         .maybeSingle()
         .throwOnError();
      return data as Branch | null;
   },

   /** Opens a branch under `parent_id` (owners of it only, see create_branch) or changes one. */
   async save({ id, parent_id, ...branch }: BranchInput) {
      if (id) {
         const { data } = await forTenant(supabase.from('tenant').update(branch).eq('id', id), id)
            .select(SELECT)
            .single()
            .throwOnError();
         return data as Branch;
      }

      const { data } = await supabase
         .rpc('create_branch', { parent_id: parent_id!, branch })
         .throwOnError();
      return data as Branch;
   },

   /** Removes a branch without branches of its own, with everything in it (see delete_branch). */
   async remove(id: string) {
      await supabase.rpc('delete_branch', { branch_id: id }).throwOnError();
   }
};

export function useBranch(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantKey.value, 'tenant', toValue(id))),
      queryFn: ({ signal }) => branchRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

// The branch tree, names and ownership come from the user's access; it is reloaded after a change
// (the broadcast does the same for the user's other tabs and for the other owners).
const useBranchMutation = <T, R>(mutationFn: (input: T) => Promise<R>) => {
   const queryClient = useQueryClient();
   const authStore = useAuthStore();

   return useMutation({
      mutationFn,
      onSuccess: async () => {
         await Promise.all([invalidateTables(queryClient, ['tenant']), authStore.refreshAccess()]);
      }
   });
};

export const useSaveBranch = () => useBranchMutation(branchRepository.save);

export const useDeleteBranch = () => useBranchMutation(branchRepository.remove);

export const branchSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   email: optional(email()),
   phone: optional(phone())
});

export type BranchFormValues = z.input<typeof branchSchema>;

export const toBranchFormValues = (branch?: Partial<Branch> | null): BranchFormValues => ({
   id: branch?.id ?? undefined,
   display_name: branch?.display_name ?? '',
   email: branch?.email ?? '',
   phone: branch?.phone ?? ''
});

export const toBranchPayload = ({
   email,
   phone,
   ...branch
}: z.output<typeof branchSchema>): BranchInput => ({
   ...branch,
   email: email ?? null,
   phone: phone ?? null
});

export type BranchNode = {
   key: string;
   data: Tenant & {
      /** Branches may be opened under it: the user owns it. */
      canAddBranch: boolean;
      /** It may be removed: it has no branches and the user owns the branch above it. */
      canDelete: boolean;
   };
   children: BranchNode[];
};

const byName = (a: Tenant, b: Tenant) => a.display_name.localeCompare(b.display_name);

/**
 * The user's tenants as a tree. A tenant whose parent the user cannot use is a root for them, and
 * a root is never removed here (only branches are, by the owners above them).
 */
/** The company (top-level tenant) a tenant belongs to, as far as the user's tenants show it. */
export function companyOf(tenants: readonly Tenant[], id: string): string {
   const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
   let current = byId.get(id);
   while (current?.parent_id && byId.has(current.parent_id)) current = byId.get(current.parent_id);
   return current?.id ?? id;
}

export function toBranchTree(tenants: readonly Tenant[]): BranchNode[] {
   const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
   const childrenOf = new Map<string | null, Tenant[]>();
   for (const tenant of tenants) {
      const parent = tenant.parent_id && byId.has(tenant.parent_id) ? tenant.parent_id : null;
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), tenant]);
   }

   const toNode = (tenant: Tenant): BranchNode => {
      const children = [...(childrenOf.get(tenant.id) ?? [])].sort(byName).map(toNode);
      const parent = tenant.parent_id ? byId.get(tenant.parent_id) : undefined;
      return {
         key: tenant.id,
         data: {
            ...tenant,
            canAddBranch: !!tenant.owned,
            canDelete: !!parent?.owned && children.length === 0
         },
         children
      };
   };

   return [...(childrenOf.get(null) ?? [])].sort(byName).map(toNode);
}
