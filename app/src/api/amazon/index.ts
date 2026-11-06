import type { CustomerPlatformAccountRow } from '@/api/customer';
import type { MarketCellRow } from '@/api/marketMatrix';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { allValues } from '@/lib/enumValues';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import type { AmazonSchema } from '@edge-shared/listingCompleteness';
import i18n from '@plugins/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];

// --- enums and constants ---

export type ListingState = Enums['listing_state'];
export type ApiConnection = Enums['api_connection'];

export const LISTING_STATES = allValues<ListingState>()([
   'draft',
   'ready',
   'submitted',
   'live',
   'issues'
]);
export const API_CONNECTIONS = allValues<ApiConnection>()(['none', 'connected', 'revoked']);

export type ListingSeverity = 'secondary' | 'info' | 'warn' | 'success' | 'danger';

export const LISTING_STATE_SEVERITY: Record<ListingState, ListingSeverity> = {
   draft: 'secondary',
   ready: 'info',
   submitted: 'warn',
   live: 'success',
   issues: 'danger'
};

/** The tag of a state the app does not know (a newer database) or of a cell without a state. */
export const listingStateSeverity = (state: string | null | undefined): ListingSeverity =>
   LISTING_STATE_SEVERITY[state as ListingState] ?? 'secondary';

/** The states in which the listing may be sent to Amazon (again): checked complete, live, or with issues. */
export const PUBLISHABLE_STATES: readonly ListingState[] = ['ready', 'live', 'issues'];

/**
 * The state a cell is shown and treated in (ruling N2): draft while its customer's Amazon account
 * is not connected, whatever is stored (a transferred cell keeps the state of its source).
 */
export const shownListingState = (
   state: ListingState | string | null | undefined,
   connected: boolean
): ListingState | string | null => (connected ? (state ?? null) : 'draft');

/** The label of a listing state; a state the app does not know is named as such. */
export const listingStateLabel = (state: string | null | undefined): string =>
   LISTING_STATES.includes(state as ListingState)
      ? i18n.t(`ops.amazon.state.${state}`)
      : i18n.t('ops.amazon.cell.state_unknown');

/** The EU countries the Amazon API publishes to, with the default language tag of each (same order). */
export const AMAZON_COUNTRIES = ['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'SE', 'BE', 'GB'] as const;
export const AMAZON_LANGUAGE_TAGS = [
   'de_DE',
   'fr_FR',
   'it_IT',
   'es_ES',
   'nl_NL',
   'pl_PL',
   'sv_SE',
   'fr_BE',
   'en_GB'
] as const;

/** Amazon's marketplace id of each country (EU stores; sellingpartner docs "Marketplace IDs"). */
export const MARKETPLACE_IDS: Record<(typeof AMAZON_COUNTRIES)[number], string> = {
   DE: 'A1PA6795UKMFR9',
   FR: 'A13V1IB3VIYZZH',
   IT: 'APJ6JRA9NG5V4',
   ES: 'A1RKKUPIHCS9HS',
   NL: 'A1805IZSGTT6HS',
   PL: 'A1C3SOZRARQ6R3',
   SE: 'A2NODRKZP88ZB9',
   BE: 'AMEN7PMS3EDWL',
   GB: 'A1F83G8C2ARO7P'
};

/** The marketplace id of a country, or null for one Amazon is not published to. */
export const marketplaceIdFor = (country: string): string | null =>
   (MARKETPLACE_IDS as Record<string, string | undefined>)[country.toUpperCase()] ?? null;

// --- schemas ---

/** Reads an enum column; a value the app does not know yet becomes `fallback`. */
const tolerant = <const V extends readonly [string, ...string[]], F extends string>(
   values: V,
   fallback: F
) => z.enum([...values, fallback] as [V[number] | F, ...(V[number] | F)[]]).catch(fallback);

const listingStateSchema = tolerant(LISTING_STATES, 'unknown');

/**
 * An issue of Amazon. The message is Amazon's own text, kept verbatim (English); attributeNames
 * is what the form links to (empty for an issue without one, e.g. 18027). An unknown severity
 * reads as 'unknown'.
 */
export const amazonIssueSchema = z.object({
   code: z.string(),
   message: z.string(),
   severity: tolerant(['ERROR', 'WARNING', 'INFO'] as const, 'unknown'),
   attributeNames: z.array(z.string()).optional().default([]),
   categories: z.array(z.string()).optional()
});
export type AmazonIssue = z.infer<typeof amazonIssueSchema>;

/** A row of amazon_product_type_definition (the cache of Amazon's product type schemas). */
export const definitionSchema = z.object({
   marketplace_id: z.string(),
   product_type: z.string(),
   locale: z.string(),
   version: z.string(),
   display_name: z.string().nullable(),
   schema: z.looseObject({
      properties: z.record(z.string(), z.looseObject({})),
      required: z.array(z.string()).optional(),
      allOf: z.array(z.unknown()).optional()
   }),
   property_groups: z.record(
      z.string(),
      z.object({
         title: z.string(),
         description: z.string().optional(),
         propertyNames: z.array(z.string())
      })
   ),
   fetched_at: z.string()
});
export type Definition = z.infer<typeof definitionSchema>;

/** The definition's schema as the completeness module reads it. */
export const amazonSchemaOf = (definition: Pick<Definition, 'schema'>): AmazonSchema =>
   definition.schema as unknown as AmazonSchema;

/** A listing_submission row; issues are Amazon's, parsed. */
export const submissionSchema = z.object({
   id: z.string(),
   tenant_id: z.string(),
   cell_id: z.string(),
   kind: tolerant(['create', 'update', 'delete'] as const, 'unknown'),
   sku: z.string(),
   marketplace_id: z.string(),
   payload: z.unknown(),
   amazon_submission_id: z.string().nullable(),
   status: tolerant(['accepted', 'invalid', 'processing', 'done', 'failed'] as const, 'unknown'),
   issues: z.array(amazonIssueSchema),
   created_by: z.string().nullable(),
   created_at: z.string(),
   updated_at: z.string()
});
export type ListingSubmissionRow = z.infer<typeof submissionSchema>;

export const missingFieldSchema = z.object({
   attribute: z.string(),
   group: z.string().nullable(),
   reason: tolerant(['required', 'conditional'] as const, 'required')
});

export const checkResultSchema = z.object({
   missing: z.array(missingFieldSchema),
   match: z
      .object({
         asin: z.string().nullable(),
         restricted: z.boolean(),
         reasons: z.array(z.string())
      })
      .nullable(),
   state: listingStateSchema
});
export type CheckResult = z.infer<typeof checkResultSchema>;

const validateResultSchema = z.object({
   status: z.enum(['VALID', 'INVALID']),
   issues: z.array(amazonIssueSchema)
});
export type ValidateResult = z.infer<typeof validateResultSchema>;

// The cell is the database row; the fields the UI reads are parsed, the rest passes through.
const nullableString = z.string().nullable();
export const cellSchema = z.looseObject({
   id: z.string(),
   status: z.string(),
   listing_state: z.union([z.null(), listingStateSchema]),
   listing_match: z.record(z.string(), z.unknown()).nullable(),
   listing_checked_at: nullableString,
   listing_language: nullableString,
   fulfillment_channel: nullableString,
   platform_product_id: nullableString,
   platform_sku: nullableString,
   open_issue: nullableString,
   price: z.number().nullable(),
   currency: nullableString
});
export type PublishedCell = z.infer<typeof cellSchema>;

const cellAndSubmissionSchema = z.object({ cell: cellSchema, submission: submissionSchema });
export type CellPublication = { cell: PublishedCell; submission: ListingSubmissionRow };

/** The outcome of one product of a bulk publish; an unknown result reads as 'error'. */
export const bulkResultSchema = z.object({
   product_id: z.string(),
   cell_id: z.string().nullable(),
   result: tolerant(
      ['submitted', 'skipped_no_cell', 'skipped_incomplete', 'invalid'] as const,
      'error'
   ),
   code: z.string().optional()
});
export type BulkResult = z.infer<typeof bulkResultSchema>;

const productTypesSchema = z.object({
   productTypes: z.array(z.object({ name: z.string(), displayName: z.string() }))
});

const connectResultSchema = z.union([
   z.object({ redirect: z.string() }),
   z.object({
      account: z.custom<CustomerPlatformAccountRow>((v) => typeof v === 'object' && v !== null)
   })
]);
export type ConnectResult = z.infer<typeof connectResultSchema>;

// --- errors ---

/**
 * A refusal of an Amazon function. `code` (also the message) is the function's own message, which
 * has an `errors.<code>` text; `details` holds what it sent along (e.g. the missing fields of
 * listing_incomplete).
 */
export class AmazonApiError extends Error {
   constructor(
      readonly code: string,
      readonly details?: unknown
   ) {
      super(code);
      this.name = 'AmazonApiError';
   }
}

/** The text of a failed Amazon call: the error's `errors.<code>` message, else its own text. */
export const amazonErrorText = (error: unknown): string => {
   const { message } = (error ?? {}) as { message?: string };
   if (message && i18n.te(`errors.${message}`)) return i18n.t(`errors.${message}`);
   return message || i18n.t('errors.unknown');
};

/** A non-2xx answer carries the function's `{message, details}` in its Response; others pass. */
async function toError(error: unknown): Promise<unknown> {
   const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
   if (typeof context?.json !== 'function') return error;
   try {
      const body = (await context.json()) as { message?: unknown; details?: unknown } | null;
      return typeof body?.message === 'string'
         ? new AmazonApiError(body.message, body.details)
         : error;
   } catch {
      return error;
   }
}

// --- requests ---

/** The active tenant's header: the functions authorize the session in that tenant. */
const tenantHeaders = () => {
   const tenantId = useAuthStore().currentTenant?.id;
   if (!tenantId) throw new AmazonApiError('tenant_not_allowed');
   return { 'x-tenant-id': tenantId };
};

async function call<T>(
   name: string,
   init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
   schema: z.ZodType<T>
): Promise<T> {
   const { data, error } = await supabase.functions.invoke(name, {
      ...init,
      headers: tenantHeaders()
   });
   if (error) throw await toError(error);
   return schema.parse(data);
}

const listing = <T>(body: Record<string, unknown>, schema: z.ZodType<T>) =>
   call('amazon-listing', { method: 'POST', body }, schema);

// functions-js appends the function name to the functions URL unchanged, so the query string
// travels with it; the schema function reads its action and parameters from there.
const schemaFunction = <T>(params: Record<string, string>, schemaOut: z.ZodType<T>) =>
   call(`amazon-schema?${new URLSearchParams(params)}`, { method: 'GET' }, schemaOut);

/** The product types Amazon offers for the keywords in the country (the customer's account asks). */
export async function searchProductTypes(args: {
   keywords: string;
   country: string;
   customerId: string;
}): Promise<{ name: string; displayName: string }[]> {
   const { productTypes } = await schemaFunction(
      {
         action: 'search',
         keywords: args.keywords,
         country: args.country,
         customer_id: args.customerId
      },
      productTypesSchema
   );
   return productTypes;
}

/**
 * A product type's schema, keyed per marketplace: the cache table first, then the edge function
 * (which fills it; in the sandbox it answers the fixture row for any marketplace).
 */
export async function fetchDefinition(args: {
   productType: string;
   country: string;
   locale: string;
   customerId: string;
}): Promise<Definition> {
   const marketplaceId = marketplaceIdFor(args.country);
   if (!marketplaceId) throw new AmazonApiError('amazon_marketplace_unsupported');
   const { data } = await supabase
      .from('amazon_product_type_definition')
      .select('*')
      .eq('marketplace_id', marketplaceId)
      .eq('product_type', args.productType)
      .eq('locale', args.locale)
      .limit(1)
      .maybeSingle()
      .throwOnError();
   if (data) return definitionSchema.parse(data);
   return schemaFunction(
      {
         action: 'definition',
         product_type: args.productType,
         country: args.country,
         locale: args.locale,
         customer_id: args.customerId
      },
      definitionSchema
   );
}

/** What the cell still misses, Amazon's match for its GTIN, and the state; writes the state. */
export const checkCell = (cellId: string): Promise<CheckResult> =>
   listing({ action: 'check', cell_id: cellId }, checkResultSchema);

/** Amazon's VALIDATION_PREVIEW of the cell; throttled, so only on the user's request. */
export const validateCell = (cellId: string): Promise<ValidateResult> =>
   listing({ action: 'validate', cell_id: cellId }, validateResultSchema);

/** Creates or updates the listing (the function decides which); resolves to the cell and the submission. */
export const publishCell = (cellId: string): Promise<CellPublication> =>
   listing({ action: 'publish', cell_id: cellId }, cellAndSubmissionSchema);

/** Takes the listing down; resolves to the cell and the delete submission. */
export const deleteListing = (cellId: string): Promise<CellPublication> =>
   listing({ action: 'delete', cell_id: cellId }, cellAndSubmissionSchema);

/** The function takes at most 50 products per call. */
const BULK_BATCH = 50;

/** Publishes the products' cells in the country, 50 products per call, in order. */
export async function publishBulk(productIds: string[], country: string): Promise<BulkResult[]> {
   const results: BulkResult[] = [];
   for (let start = 0; start < productIds.length; start += BULK_BATCH) {
      const { results: batch } = await listing(
         {
            action: 'publish_bulk',
            product_ids: productIds.slice(start, start + BULK_BATCH),
            country
         },
         z.object({ results: z.array(bulkResultSchema) })
      );
      results.push(...batch);
   }
   return results;
}

/** Production answers the consent URL to go to; the sandbox connects at once and answers the account. */
export const connectAmazon = (accountId: string, returnTo: string): Promise<ConnectResult> =>
   call(
      'amazon-auth',
      { method: 'POST', body: { action: 'connect', account_id: accountId, return_to: returnTo } },
      connectResultSchema
   );

export async function disconnectAmazon(accountId: string): Promise<void> {
   await call(
      'amazon-auth',
      { method: 'POST', body: { action: 'disconnect', account_id: accountId } },
      z.unknown()
   );
}

// --- display ---

/**
 * The form field an issue is about: the schema's title of its first attribute, else the attribute's
 * own name (not in the schema), else null (an issue without attributeNames; shown under General).
 */
export const issueField = (issue: AmazonIssue, schema: AmazonSchema | null): string | null => {
   const name = issue.attributeNames[0];
   if (!name) return null;
   // Amazon may name a part of an attribute: `item_name[marketplace_id=...]`, `a.b`.
   const base = name.split(/[[.]/)[0]!;
   return schema?.properties[name]?.title ?? schema?.properties[base]?.title ?? name;
};

// --- hooks ---

const READ_STALE_MS = 5 * 60 * 1000;

/** Product types for the keywords (two letters at least) in the country. */
export function useProductTypeSearch(
   keywords: MaybeRefOrGetter<string>,
   country: MaybeRefOrGetter<string | null>,
   customerId: MaybeRefOrGetter<string | null>
) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'amazon_product_type_definition', {
            view: 'search',
            keywords: toValue(keywords).trim(),
            country: toValue(country),
            customerId: toValue(customerId)
         })
      ),
      queryFn: () =>
         searchProductTypes({
            keywords: toValue(keywords).trim(),
            country: toValue(country)!,
            customerId: toValue(customerId)!
         }),
      enabled: computed(
         () => toValue(keywords).trim().length >= 2 && !!toValue(country) && !!toValue(customerId)
      ),
      staleTime: READ_STALE_MS
   });
}

export type DefinitionArgs = Parameters<typeof fetchDefinition>[0];

/** The schema of a product type; null arguments wait. */
export function useDefinition(args: MaybeRefOrGetter<DefinitionArgs | null>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'amazon_product_type_definition', {
            view: 'definition',
            ...toValue(args)
         })
      ),
      queryFn: () => fetchDefinition(toValue(args)!),
      enabled: computed(() => !!toValue(args)),
      staleTime: READ_STALE_MS,
      // Its readers (the product's Amazon tab, the cell drawer) show the error in place.
      meta: { silent: true }
   });
}

/**
 * The key of a cell's check. It is not under a table, so writes (a publish, a removal) do not
 * call Amazon again; the check runs when asked.
 */
export const cellCheckKey = (tenantId: string | null, cellId: string | null) =>
   [...queryKeys.tenant(tenantId), 'amazon_listing_check', { id: cellId }] as const;

/** The cell's completeness against the schema and its Amazon match (writes the state, so not on focus). */
export function useCellCheck(cellId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() => cellCheckKey(tenantKey.value, toValue(cellId))),
      queryFn: () => checkCell(toValue(cellId)!),
      enabled: computed(() => !!toValue(cellId)),
      refetchOnWindowFocus: false,
      retry: false
   });
}

/** A market cell of the product on Amazon, as the product's Amazon tab reads it. */
export type ProductAmazonCell = Pick<
   MarketCellRow,
   'id' | 'country' | 'listing_language' | 'price' | 'currency'
>;

/** The product's Amazon cells, oldest first (the tab works in the first one's marketplace). */
export function useProductAmazonCells(productId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'market_cell', {
            view: 'amazon_cells',
            productId: toValue(productId)
         })
      ),
      queryFn: async ({ signal }): Promise<ProductAmazonCell[]> => {
         const { data } = await supabase
            .from('market_cell')
            .select('id, country, listing_language, price, currency')
            .eq('product_id', toValue(productId)!)
            .eq('platform_id', 'amazon')
            .order('created_at')
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(productId))
   });
}

/** A customer's Amazon platform account as the panel shows it (no credential is a column). */
export type AmazonAccount = Pick<
   CustomerPlatformAccountRow,
   'id' | 'customer_id' | 'platform_id' | 'api_connection' | 'authorized_at' | 'seller_id'
>;

/**
 * The Amazon platform accounts of one customer (`{customerId}`) or of every customer (`{}`); null
 * waits. A customer has one at most (UNIQUE customer, platform).
 */
export function useAmazonAccounts(filter: MaybeRefOrGetter<{ customerId?: string } | null>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'customer_platform_account', {
            view: 'amazon',
            ...toValue(filter)
         })
      ),
      queryFn: async ({ signal }): Promise<AmazonAccount[]> => {
         let query = supabase
            .from('customer_platform_account')
            .select('id, customer_id, platform_id, api_connection, authorized_at, seller_id')
            .eq('platform_id', 'amazon');
         const customerId = toValue(filter)?.customerId;
         if (customerId) query = query.eq('customer_id', customerId);
         const { data } = await query.abortSignal(signal).throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(filter))
   });
}

/**
 * Whether the product is a variation parent (another product names it as its parent): a parent
 * sends no identifier and no offer, so those count as provided (R7, serverProvided).
 */
export function useProductIsParent(productId: MaybeRefOrGetter<string | null | undefined>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'product', { view: 'is_parent', id: toValue(productId) })
      ),
      queryFn: async ({ signal }) => {
         const { count } = await supabase
            .from('product')
            .select('id', { count: 'exact', head: true })
            .eq('parent_id', toValue(productId)!)
            .abortSignal(signal)
            .throwOnError();
         return (count ?? 0) > 0;
      },
      enabled: computed(() => !!toValue(productId))
   });
}

/** The cell's submissions, newest first. */
export function useListingSubmissions(cellId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();
   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'listing_submission', { cellId: toValue(cellId) })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('listing_submission')
            .select('*')
            .eq('cell_id', toValue(cellId)!)
            .order('created_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return z.array(submissionSchema).parse(data);
      },
      enabled: computed(() => !!toValue(cellId))
   });
}

// A publish or delete that fails after Amazon answered still writes a submission, so the lists
// are refreshed when the call settles, not only when it succeeds.
function useListingMutation<A, R>(mutationFn: (args: A) => Promise<R>) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn,
      onSettled: () => invalidateTables(queryClient, ['market_cell', 'listing_submission'])
   });
}

export const usePublishCell = () => useListingMutation(publishCell);
export const useValidateCell = () => useMutation({ mutationFn: validateCell });
export const useDeleteListing = () => useListingMutation(deleteListing);
export const usePublishBulk = () =>
   useListingMutation(({ productIds, country }: { productIds: string[]; country: string }) =>
      publishBulk(productIds, country)
   );

export function useConnectAmazon() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ accountId, returnTo }: { accountId: string; returnTo: string }) =>
         connectAmazon(accountId, returnTo),
      onSettled: () => invalidateTables(queryClient, ['customer_platform_account'])
   });
}

export function useDisconnectAmazon() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: disconnectAmazon,
      onSettled: () => invalidateTables(queryClient, ['customer_platform_account'])
   });
}
