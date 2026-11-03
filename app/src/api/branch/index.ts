import type { Tenant } from '@/api/access';
import { forTenant } from '@/api/formTenant';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { email, optional, phone, requiredText, website } from '@/lib/form/fields';
import i18n from '@plugins/i18n';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

/** The profile columns a branch's own users may change (see the tenant grants in 012). */
const PROFILE_COLUMNS = [
   'display_name',
   'email',
   'phone',
   'website',
   'legal_name',
   'tax_office',
   'tax_number',
   'country',
   'city',
   'district',
   'address'
] as const;

type ProfileColumn = (typeof PROFILE_COLUMNS)[number];

export type Branch = Pick<
   Tables['tenant']['Row'],
   'id' | 'parent_id' | 'logo_path' | 'created_at' | ProfileColumn
>;

/** A new branch names the branch it opens under; an existing one is changed in place. */
export type BranchInput = Pick<Branch, ProfileColumn> & {
   id?: string | null;
   parent_id?: string | null;
};

const SELECT =
   'id, parent_id, logo_path, created_at, display_name, email, phone, website, legal_name, tax_office, tax_number, country, city, district, address';

const LOGO_BUCKET = 'tenant-logo';

/** The logo's public URL, or null without one. */
export const logoUrl = (path: string | null | undefined) =>
   path ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl : null;

/** The image types and size the logo bucket takes (see 014_init_storage.sql). */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 1024 * 1024;

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

   /**
    * Puts `file` in the branch's folder and makes it the logo; the previous file is removed once
    * the branch points at the new one. A new name each time, so cached copies of the old one are
    * not shown.
    */
   async setLogo({ id, file, previous }: { id: string; file: File; previous?: string | null }) {
      const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${id}/logo-${Date.now()}.${extension}`;
      const { error } = await supabase.storage
         .from(LOGO_BUCKET)
         .upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (error) throw error;

      try {
         await forTenant(supabase.from('tenant').update({ logo_path: path }).eq('id', id), id)
            .select('id')
            .single()
            .throwOnError();
      } catch (cause) {
         await supabase.storage.from(LOGO_BUCKET).remove([path]);
         throw cause;
      }
      if (previous) await supabase.storage.from(LOGO_BUCKET).remove([previous]);
   },

   /** Removes the branch's logo. */
   async removeLogo({ id, previous }: { id: string; previous?: string | null }) {
      await forTenant(supabase.from('tenant').update({ logo_path: null }).eq('id', id), id)
         .select('id')
         .single()
         .throwOnError();
      if (previous) await supabase.storage.from(LOGO_BUCKET).remove([previous]);
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
export const useSetBranchLogo = () => useBranchMutation(branchRepository.setLogo);
export const useRemoveBranchLogo = () => useBranchMutation(branchRepository.removeLogo);

/** Optional free text of at most `max` characters. */
const text = (max: number) =>
   optional(
      z
         .string()
         .trim()
         .max(max, { error: () => i18n.t('form.too_long', { max }) })
   );

export const branchSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   email: optional(email()),
   phone: optional(phone()),
   website: optional(website()),
   legal_name: text(255),
   tax_office: text(100),
   tax_number: optional(
      z
         .string()
         .trim()
         .regex(/^[A-Za-z0-9 -]{1,32}$/, { error: () => i18n.t('errors.invalid_tax_number') })
   ),
   country: text(100),
   city: text(100),
   district: text(100),
   address: text(500)
});

export type BranchFormValues = z.input<typeof branchSchema>;

export const toBranchFormValues = (branch?: Partial<Branch> | null): BranchFormValues => ({
   id: branch?.id ?? undefined,
   display_name: branch?.display_name ?? '',
   ...(Object.fromEntries(
      PROFILE_COLUMNS.filter((column) => column !== 'display_name').map((column) => [
         column,
         branch?.[column] ?? ''
      ])
   ) as Omit<BranchFormValues, 'id' | 'display_name'>)
});

/** Every profile column, empty ones as null. */
export const toBranchPayload = ({ id, ...branch }: z.output<typeof branchSchema>): BranchInput =>
   ({
      ...(id ? { id } : {}),
      ...Object.fromEntries(PROFILE_COLUMNS.map((column) => [column, branch[column] ?? null]))
   }) as BranchInput;

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
