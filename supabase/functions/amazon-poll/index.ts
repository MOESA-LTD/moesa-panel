// amazon-poll: resolves every submitted Amazon listing. 047's cron job POSTs here every 10 minutes
// with the service key; there is no user route.
//
//   POST, Bearer service key -> { polled, failed, given_up, remaining }
import { type AmazonEnv, amazonEnv, type Deps } from '../_shared/amazon.ts';
import { assertServiceCall } from '../_shared/auth.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import { errorResponse, HttpError, json, serve } from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts';
import { type PollDeps, pollSubmitted } from './poll.ts';

export type HandlerDeps = {
   amazon: Partial<Deps>;
   env: () => AmazonEnv;
   admin: () => SupabaseClient<Database>;
   serviceKey: string | undefined;
   refresh?: PollDeps['refresh'];
   cap?: number;
};

export async function handler(req: Request, deps: Partial<HandlerDeps> = {}): Promise<Response> {
   const d: HandlerDeps = {
      amazon: {},
      env: () => amazonEnv(),
      admin: supabaseAdmin,
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      ...deps
   };
   try {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
      assertServiceCall(req, d.serviceKey);
      const result = await pollSubmitted(
         {
            admin: d.admin(),
            env: d.env(),
            amazon: d.amazon,
            refresh: d.refresh,
            cap: d.cap
         },
         d.amazon.now
      );
      return json(result);
   } catch (error) {
      return errorResponse(error);
   }
}

if (import.meta.main) serve((req) => handler(req));
