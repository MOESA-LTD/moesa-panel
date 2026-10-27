import { forTenant } from '@/api/formTenant';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { email, optional, phone, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Role = Pick<Tables['role']['Row'], 'id' | 'display_name' | 'tenant_id'>;
export type UserWithRoles = Tables['user']['Row'] & {
   role: Role[];
   /** The current tenant's ownership row, if the user owns it. */
   tenant_owner?: { tenant_id: string }[];
} & UserAccess;

/**
 * How a listed user may use the tenants read (computed fields, see 012_init_branches.sql): the
 * tenants among or above them they own, and the tenant they are managed in (`managed_in`, read as
 * tenant_id so a row is handled like any row of a tenant). An owner who belongs to none of the
 * tenants read uses them through a tenant above and is managed there (tenant_id null).
 */
export type UserAccess = { owned_via?: string[]; tenant_id?: string | null };

/** The computed fields to select with a user. */
export const USER_ACCESS = 'owned_via, tenant_id:managed_in';

/** Whether the user is listed only as the owner of a tenant above (not managed in this one). */
export const isOwnerAbove = (user: UserAccess) => user.tenant_id === null;

/** Requests about a member go to the tenant they are managed in (else the active one). */
const tenantHeaders = (tenantId?: string | null) =>
   tenantId ? { 'x-tenant-id': tenantId, 'x-tenant-ids': tenantId } : undefined;

/** Attributes the `user` edge function accepts; see supabase/functions/user. */
export type UserAttributes = {
   email: string;
   phone?: string | null;
   password?: string | null;
   user_metadata: { display_name: string };
};

export type UserInput = {
   id?: string;
   attributes: UserAttributes;
   roleIds?: string[];
   /** The tenant the member is managed in; a new member is invited to the active one. */
   tenantId?: string | null;
};

export const userRepository = {
   /** Read in `tenantId` alone if given (a membership of a branch), so it is managed there. */
   async get(id: string, signal: AbortSignal, tenantId?: string | null) {
      const { data } = await forTenant(
         supabase
            .from('user')
            // tenant_owner: RLS keeps the current tenant's row, so it says whether they own it.
            .select(`*, role(*), tenant_owner(tenant_id), ${USER_ACCESS}`)
            .eq('id', id)
            .abortSignal(signal),
         tenantId
      )
         .maybeSingle()
         .throwOnError();
      return data as UserWithRoles | null;
   },

   /** Updates a member, or invites a new one to the current tenant. */
   async save({ id, attributes, roleIds, tenantId }: UserInput) {
      const { data, error } = await supabase.functions.invoke<{ user: { id: string } }>(
         id ? `user/${id}` : 'user',
         { method: id ? 'PUT' : 'POST', body: attributes, headers: tenantHeaders(tenantId) }
      );
      if (error) throw error;

      const userId = id ?? data!.user.id;

      // Only the roles of that tenant are replaced (see set_user_roles): with several tenants
      // read, the others' roles would be visible to it, and removed.
      if (roleIds) {
         await forTenant(
            supabase.rpc('set_user_roles', { user_id: userId, role_ids: roleIds }),
            tenantId
         ).throwOnError();
      }

      return userRepository.get(userId, new AbortController().signal, tenantId);
   }
};

export function useUser(
   id: MaybeRefOrGetter<string | null | undefined>,
   tenant?: MaybeRefOrGetter<string | null | undefined>
) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() => [
         ...queryKeys.detail(tenantKey.value, 'user', toValue(id)),
         toValue(tenant) ?? null
      ]),
      queryFn: ({ signal }) => userRepository.get(toValue(id)!, signal, toValue(tenant)),
      enabled: computed(() => !!toValue(id))
   });
}

export function useSaveUser() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: userRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['user', 'user_role'])
   });
}

/** Removes a member from the tenant they are managed in (the account itself is kept). */
export function useRemoveUser() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ id, tenantId }: { id: string; tenantId?: string | null }) => {
         const { error } = await supabase.functions.invoke(`user/${id}`, {
            method: 'DELETE',
            headers: tenantHeaders(tenantId)
         });
         if (error) throw error;
      },
      onSuccess: () => invalidateTables(queryClient, ['user', 'tenant_user', 'user_role'])
   });
}

export const userSchema = z.object({
   id: z.string().optional(),
   email: email(),
   phone: optional(phone()),
   // Only sent when a new password is typed.
   password: optional(z.string().min(6)),
   user_metadata: z.looseObject({ display_name: requiredText() }),
   role: z.array(z.looseObject({ id: z.string() })),
   tenant_id: z.string().nullish()
});

export type UserFormValues = z.input<typeof userSchema>;

export const toUserFormValues = (user?: Partial<UserWithRoles> | null): UserFormValues => ({
   id: user?.id ?? undefined,
   email: user?.email ?? '',
   phone: user?.phone ?? '',
   password: '',
   user_metadata: { display_name: '', ...((user?.user_metadata as object) ?? {}) },
   role: user?.role ?? [],
   tenant_id: user?.tenant_id
});

export const toUserPayload = ({
   id,
   email,
   phone,
   password,
   user_metadata,
   role,
   tenant_id
}: z.output<typeof userSchema>): UserInput => ({
   id,
   tenantId: tenant_id,
   attributes: {
      email,
      phone,
      password,
      user_metadata: { display_name: user_metadata.display_name }
   },
   // Roles are assigned to existing members only (the role picker is shown after inviting).
   roleIds: id ? role.map(({ id: roleId }) => roleId) : undefined
});
