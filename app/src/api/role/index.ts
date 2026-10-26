import { syncJunction } from '@/api/junction';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import { requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Permission = Pick<Tables['permission']['Row'], 'id' | 'kind' | 'group_name'>;
export type RoleWithPermissions = Tables['role']['Row'] & { permission: Permission[] };

export type RoleInput = {
   role: Pick<Tables['role']['Insert'], 'id' | 'display_name'>;
   permissionIds: string[];
};

export const roleRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('role')
         .select('*, permission(id, kind, group_name)')
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as RoleWithPermissions | null;
   },

   async save({ role, permissionIds }: RoleInput) {
      const { data } = await supabase
         .from('role')
         .upsert(role as Tables['role']['Insert'])
         .select('id')
         .single()
         .throwOnError();

      await syncJunction({
         table: 'role_permission',
         ownerColumn: 'role_id',
         ownerId: data.id,
         itemColumn: 'permission_id',
         itemIds: permissionIds
      });

      return roleRepository.get(data.id, new AbortController().signal);
   }
};

export function useRole(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantId();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'role', toValue(id))),
      queryFn: ({ signal }) => roleRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

export function useSaveRole() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: roleRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['role', 'role_permission'])
   });
}

export const roleSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   permission: z.array(z.looseObject({ id: z.string() })).min(1)
});

export type RoleFormValues = z.input<typeof roleSchema>;

export const toRoleFormValues = (role?: Partial<RoleWithPermissions> | null): RoleFormValues => ({
   id: role?.id ?? undefined,
   display_name: role?.display_name ?? '',
   permission: role?.permission ?? []
});

export const toRolePayload = ({ permission, ...role }: z.output<typeof roleSchema>): RoleInput => ({
   role: role as RoleInput['role'],
   permissionIds: permission.map(({ id }) => id)
});
