import {
   computed,
   inject,
   provide,
   toValue,
   type InjectionKey,
   type MaybeRefOrGetter,
   type Ref
} from 'vue';

const FORM_TENANT: InjectionKey<Ref<string | null>> = Symbol('form-tenant');

/**
 * The tenant of the row a form edits (the active tenant for a new row). The lookups inside the
 * form read that tenant only, so a row is never linked to rows of another of the branches shown.
 */
export function provideFormTenant(tenantId: MaybeRefOrGetter<string | null | undefined>) {
   provide(
      FORM_TENANT,
      computed(() => toValue(tenantId) ?? null)
   );
}

/** The tenant of the enclosing form, if any. */
export const useFormTenant = () => inject(FORM_TENANT, null);

type HeaderBuilder<Q> = { setHeader(name: string, value: string): Q };

/** Makes a request read and write `tenantId` alone instead of the branches shown. */
export const forTenant = <Q extends HeaderBuilder<Q>>(
   query: Q,
   tenantId: string | null | undefined
) =>
   tenantId ? query.setHeader('x-tenant-id', tenantId).setHeader('x-tenant-ids', tenantId) : query;
