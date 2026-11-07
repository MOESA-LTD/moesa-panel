// Smoke test of the SP-API credentials: LWA exchange + getMarketplaceParticipations.
// Prints `ok <n> marketplaces` or the error code; never a token or a secret.
import { AmazonError, amazonEnv, spapiClient } from '../_shared/amazon.ts';

if (!Deno.env.get('AMAZON_SPAPI_LWA_CLIENT_ID')) {
   console.log(
      'skipped: no AMAZON_SPAPI_* credentials (copy .env.example to supabase/functions/.env)'
   );
   Deno.exit(0);
}

try {
   const env = amazonEnv();
   if (!env.selfRefreshToken) throw new AmazonError('amazon_unconfigured', 500);
   const spapi = spapiClient(env.selfRefreshToken, env);
   const { payload } = await spapi<{ payload?: unknown[] }>({
      method: 'GET',
      path: '/sellers/v1/marketplaceParticipations'
   });
   console.log(`ok ${payload?.length ?? 0} marketplaces (${env.env}, ${env.region})`);
} catch (error) {
   console.log(error instanceof AmazonError ? error.code : 'probe_failed');
   Deno.exit(1);
}
