// The Amazon connection of a customer: its refresh token and seller id, from Vault in production
// or from the self-authorization (AMAZON_SPAPI_REFRESH_TOKEN / _SELLER_ID) in sandbox.
import { AmazonAuthError, AmazonError, type AmazonEnv } from './amazon.ts';
import type { Database } from './database.types.ts';
import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';

export type AmazonAccount = {
   id: string;
   tenantId: string;
   customerId: string;
   sellerId: string;
   refreshToken: string;
};

/**
 * The customer's connected `amazon` platform account; any other state is 409 amazon_not_connected.
 * `db` must be the service-role client (supabaseAdmin): amazon_account_token is not granted to users.
 */
export async function amazonAccountFor(
   db: SupabaseClient<Database>,
   customerId: string,
   tenantId: string,
   env: AmazonEnv
): Promise<AmazonAccount> {
   const { data: row, error } = await db
      .from('customer_platform_account')
      .select('id, tenant_id, customer_id, seller_id, api_connection')
      .eq('customer_id', customerId)
      .eq('tenant_id', tenantId)
      .eq('platform_id', 'amazon')
      .maybeSingle();
   if (error) throw error;
   if (!row || row.api_connection !== 'connected') throw new HttpError(409, 'amazon_not_connected');

   const account = { id: row.id, tenantId: row.tenant_id, customerId: row.customer_id };

   if (env.env === 'sandbox') {
      const sellerId = row.seller_id ?? env.sellerId;
      if (!env.selfRefreshToken || !sellerId) throw new AmazonError('amazon_unconfigured', 500);
      return { ...account, sellerId, refreshToken: env.selfRefreshToken };
   }

   const { data: refreshToken, error: tokenError } = await db.rpc('amazon_account_token', {
      p_account_id: row.id
   });
   if (tokenError) throw tokenError;
   if (!refreshToken || !row.seller_id) throw new HttpError(409, 'amazon_not_connected');
   return { ...account, sellerId: row.seller_id, refreshToken };
}

/**
 * Runs `run`; when Amazon refuses the account's grant, the account is marked revoked
 * (amazon_account_disconnect) and the caller gets 409 amazon_connection_revoked.
 */
export async function withRevocation<T>(
   db: SupabaseClient<Database>,
   accountId: string,
   run: () => Promise<T>
): Promise<T> {
   try {
      return await run();
   } catch (error) {
      if (!(error instanceof AmazonAuthError) || error.code !== 'amazon_connection_revoked')
         throw error;
      const { error: rpcError } = await db.rpc('amazon_account_disconnect', {
         p_account_id: accountId,
         p_state: 'revoked'
      });
      if (rpcError) throw rpcError;
      throw new HttpError(409, 'amazon_connection_revoked');
   }
}
