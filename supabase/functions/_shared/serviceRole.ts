// What the service role still does while a function serves a user: the operations no user may
// perform, each for its own reason. A handler gets this narrow interface, never the client itself,
// so tenant data cannot be read or written past RLS by accident (the user's client does that;
// tests/service_role_test.ts checks the sources).
import type { Database } from './database.types.ts';
import type { SupabaseClient } from './deps.ts';

type Db = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
export type PlatformAccountRow = Tables['customer_platform_account']['Row'];
export type DefinitionInsert = Tables['amazon_product_type_definition']['Insert'];
export type DefinitionStored = Tables['amazon_product_type_definition']['Row'];

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
};

export const serviceRole = (client: Db): ServiceRole => ({
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
   }
});
