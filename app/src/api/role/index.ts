import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { requiredText } from '@/lib/form/fields';
import { publicSchema, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Permission = Pick<Tables['permission']['Row'], 'id' | 'kind' | 'group_name'>;
export type FieldRightInput = {
   resource_name: string;
   field: string;
   can_read: boolean;
   can_write: boolean;
};
export type RoleWithPermissions = Tables['role']['Row'] & {
   permission: Permission[];
   role_field_permission: FieldRightInput[];
};

export type RoleInput = {
   role: Pick<Tables['role']['Insert'], 'id' | 'display_name'>;
   permissionIds: string[];
   fieldRights: FieldRightInput[];
};

export const roleRepository = {
   async get(id: string, signal: AbortSignal) {
      // Through the link table: across the `api` views the many-to-many embed is ambiguous.
      const { data } = await supabase
         .from('role')
         .select(
            '*, role_permission(permission(id, kind, group_name)), role_field_permission(resource_name, field, can_read, can_write)'
         )
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      if (!data) return null;
      const { role_permission, role_field_permission, ...role } =
         data as unknown as Tables['role']['Row'] & {
            role_permission: { permission: Permission }[];
            role_field_permission: FieldRightInput[];
         };
      return {
         ...role,
         permission: role_permission.map(({ permission }) => permission),
         role_field_permission: role_field_permission ?? []
      };
   },

   /** Saves the role and its permissions in one transaction (see save_role). */
   async save({ role, permissionIds, fieldRights }: RoleInput) {
      const { data: id } = await publicSchema
         .rpc('save_role', {
            // A new role belongs to the current tenant; the tenant policies check it.
            role_data: { ...role, tenant_id: useAuthStore().currentTenant?.id },
            permission_ids: permissionIds,
            field_rights: fieldRights
         })
         .throwOnError();

      return roleRepository.get(id, new AbortController().signal);
   }
};

export function useRole(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantKey();

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
      onSuccess: () => {
         invalidateTables(queryClient, ['role', 'role_permission']);
         // The user may hold the role: their permissions and field rights may have changed, and
         // a change of field rights alone is not broadcast (see private.notify_access_changed).
         useAuthStore()
            .refreshAccess()
            .catch(() => {});
      }
   });
}

export const roleSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   permission: z.array(z.looseObject({ id: z.string() })).min(1),
   field_rights: z.array(
      z.object({
         resource_name: z.string(),
         field: z.string(),
         can_read: z.boolean(),
         can_write: z.boolean()
      })
   )
});

export type RoleFormValues = z.input<typeof roleSchema>;

export const toRoleFormValues = (role?: Partial<RoleWithPermissions> | null): RoleFormValues => ({
   id: role?.id ?? undefined,
   display_name: role?.display_name ?? '',
   permission: role?.permission ?? [],
   field_rights: role?.role_field_permission ?? []
});

export const toRolePayload = ({
   permission,
   field_rights,
   ...role
}: z.output<typeof roleSchema>): RoleInput => ({
   role,
   permissionIds: permission.map(({ id }) => id),
   fieldRights: field_rights
});
