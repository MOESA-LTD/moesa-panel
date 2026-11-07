// What the service role still does while a function serves a user: the operations no user may
// perform, each for its own reason. A handler gets this narrow interface, never the client itself,
// so tenant data cannot be read or written past RLS by accident (the user's client does that;
// tests/service_role_test.ts checks the sources).
import type { Database, Json } from './database.types.ts';
import type { SupabaseClient } from './deps.ts';

type Db = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
export type PlatformAccountRow = Tables['customer_platform_account']['Row'];
export type DefinitionInsert = Tables['amazon_product_type_definition']['Insert'];
export type DefinitionStored = Tables['amazon_product_type_definition']['Row'];
type Enums = Database['public']['Enums'];
type MarketCellRow = Tables['market_cell']['Row'];
type ListingSubmissionRow = Tables['listing_submission']['Row'];

/** The account as the OAuth callback reads it: the connection state, never a credential. */
export type CallbackAccount = Pick<
   PlatformAccountRow,
   'id' | 'customer_id' | 'platform_id' | 'api_connection' | 'authorized_at' | 'seller_id'
>;

export type ServiceRole = {
   /** Vault: the account's refresh token (amazon_account_token is not granted to users). */
   accountToken(accountId: string): Promise<string | null>;
   /**
    * Amazon refused the account's grant: the account is marked revoked and its token deleted. The
    * server's observation, not a user's choice (046 lets a user only disconnect).
    */
   revokeAccount(accountId: string): Promise<void>;
   /**
    * Stores the refresh token (none in sandbox) and marks the account connected: the connection
    * columns are server-only (046 platform_account_api_server_only).
    */
   connectAccount(
      accountId: string,
      refreshToken: string | null,
      sellerId: string
   ): Promise<PlatformAccountRow>;
   /** The account of a signed OAuth state: Amazon's redirect carries no user session. */
   callbackAccount(accountId: string, tenantId: string): Promise<CallbackAccount | null>;
   /**
    * Storage: the private `media` bucket is read and the public `listing-images` bucket written,
    * which has no user storage policy (only the service role writes what Amazon fetches).
    */
   storage: Db['storage'];
   /** The tenant-neutral product type definition cache, which no user writes. */
   storeDefinition(row: DefinitionInsert): Promise<DefinitionStored>;
   // Amazon's outcome: 046 lets only the service role write it (a user could forge it). Each call
   // passes the user this ServiceRole was made for as p_actor, so the audit names that user (role
   // amazon-listing); without one (the poll) the x-audit-role label stands.
   /** 046 listing_apply_submission: Amazon's answer for a submission (and its cell). */
   applySubmission(args: {
      submissionId: string;
      status: Enums['listing_submission_status'];
      amazonSubmissionId: string | null;
      issues: Json;
      state: Enums['listing_state'];
      asin: string | null;
   }): Promise<MarketCellRow>;
   /** 046 listing_set_state: the cell's listing state (and match), over the version read. */
   setListingState(args: {
      cellId: string;
      state: Enums['listing_state'];
      match: Json | null;
      expectedUpdatedAt: string | null;
   }): Promise<MarketCellRow>;
   /** 046 listing_settle_removal: a delete submission's answer. */
   settleRemoval(args: {
      submissionId: string;
      status: Enums['listing_submission_status'];
      amazonSubmissionId: string | null;
      issues: Json;
   }): Promise<ListingSubmissionRow>;
};

/**
 * `actorId`: the user the outcome writes are made for (p_actor); none for the poll and the schema
 * refresh. Every RPC argument is sent: PostgREST resolves a function by its argument names.
 */
export const serviceRole = (client: Db, actorId: string | null = null): ServiceRole => ({
   async accountToken(accountId) {
      const { data, error } = await client.rpc('amazon_account_token', {
         p_account_id: accountId
      });
      if (error) throw error;
      return (data as string | null) ?? null;
   },
   async revokeAccount(accountId) {
      const { error } = await client.rpc('amazon_account_disconnect', {
         p_account_id: accountId,
         p_state: 'revoked'
      });
      if (error) throw error;
   },
   async connectAccount(accountId, refreshToken, sellerId) {
      const { data, error } = await client.rpc('amazon_account_connect', {
         p_account_id: accountId,
         // NULL keeps Vault untouched: the sandbox reads the self-authorized token from the env.
         p_refresh_token: refreshToken as string,
         p_seller_id: sellerId
      });
      if (error) throw error;
      return data as PlatformAccountRow;
   },
   async callbackAccount(accountId, tenantId) {
      const { data, error } = await client
         .from('customer_platform_account')
         .select('id, customer_id, platform_id, api_connection, authorized_at, seller_id')
         .eq('id', accountId)
         .eq('tenant_id', tenantId)
         .eq('platform_id', 'amazon')
         .maybeSingle();
      if (error) throw error;
      return (data as CallbackAccount | null) ?? null;
   },
   storage: client.storage,
   async storeDefinition(row) {
      const { data, error } = await client
         .from('amazon_product_type_definition')
         .upsert(row, { onConflict: 'marketplace_id,product_type,locale' })
         .select()
         .single();
      if (error) throw error;
      return data;
   },
   async applySubmission(a) {
      const { data, error } = await client.rpc('listing_apply_submission', {
         p_submission_id: a.submissionId,
         p_status: a.status,
         p_amazon_submission_id: a.amazonSubmissionId as string,
         p_issues: a.issues,
         p_listing_state: a.state,
         p_asin: a.asin as string,
         p_actor: actorId as string
      });
      if (error) throw error;
      return data as MarketCellRow;
   },
   async setListingState(a) {
      const { data, error } = await client.rpc('listing_set_state', {
         p_cell_id: a.cellId,
         p_listing_state: a.state,
         p_listing_match: a.match as Json,
         ...(a.expectedUpdatedAt ? { p_expected_updated_at: a.expectedUpdatedAt } : {}),
         p_actor: actorId as string
      });
      if (error) throw error;
      return data as MarketCellRow;
   },
   async settleRemoval(a) {
      const { data, error } = await client.rpc('listing_settle_removal', {
         p_submission_id: a.submissionId,
         p_status: a.status,
         p_amazon_submission_id: a.amazonSubmissionId as string,
         p_issues: a.issues,
         p_actor: actorId as string
      });
      if (error) throw error;
      return data as ListingSubmissionRow;
   }
});
