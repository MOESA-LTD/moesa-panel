import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
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
};

/** Attributes the `user` edge function accepts; see supabase/functions/user. */
export type UserAttributes = {
   email: string;
   phone?: string | null;
   password?: string | null;
   user_metadata: { display_name: string };
};

export type UserInput = { id?: string; attributes: UserAttributes; roleIds?: string[] };

export const userRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('user')
         // tenant_owner: RLS keeps the current tenant's row, so it says whether they own it.
         .select('*, role(*), tenant_owner(tenant_id)')
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as UserWithRoles | null;
   },

   /** Updates a member, or invites a new one to the current tenant. */
   async save({ id, attributes, roleIds }: UserInput) {
      const { data, error } = await supabase.functions.invoke<{ user: { id: string } }>(
         id ? `user/${id}` : 'user',
         { method: id ? 'PUT' : 'POST', body: attributes }
      );
      if (error) throw error;

      const userId = id ?? data!.user.id;

      // Only the roles of the current tenant are replaced (see set_user_roles).
      if (roleIds) {
         await supabase
            .rpc('set_user_roles', { user_id: userId, role_ids: roleIds })
            .throwOnError();
      }

      return userRepository.get(userId, new AbortController().signal);
   }
};

export function useUser(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantId();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'user', toValue(id))),
      queryFn: ({ signal }) => userRepository.get(toValue(id)!, signal),
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

/** Removes a member from the current tenant (the account itself is kept). */
export function useRemoveUser() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (id: string) => {
         const { error } = await supabase.functions.invoke(`user/${id}`, { method: 'DELETE' });
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
   role: z.array(z.looseObject({ id: z.string() }))
});

export type UserFormValues = z.input<typeof userSchema>;

export const toUserFormValues = (user?: Partial<UserWithRoles> | null): UserFormValues => ({
   id: user?.id ?? undefined,
   email: user?.email ?? '',
   phone: user?.phone ?? '',
   password: '',
   user_metadata: { display_name: '', ...((user?.user_metadata as object) ?? {}) },
   role: user?.role ?? []
});

export const toUserPayload = ({
   id,
   email,
   phone,
   password,
   user_metadata,
   role
}: z.output<typeof userSchema>): UserInput => ({
   id,
   attributes: {
      email,
      phone,
      password,
      user_metadata: { display_name: user_metadata.display_name }
   },
   // Roles are assigned to existing members only (the role picker is shown after inviting).
   roleIds: id ? role.map(({ id: roleId }) => roleId) : undefined
});
