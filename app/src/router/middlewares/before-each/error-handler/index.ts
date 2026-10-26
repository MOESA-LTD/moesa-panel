import { CustomAuthError } from '@supabase/supabase-js';
import type { NavigationGuardWithThis } from 'vue-router';

/** Supabase reports auth redirect failures (e.g. an expired email link) in the URL hash. */
export const ErrorHandlerBeforeEach: NavigationGuardWithThis<undefined> = () => {
   const hash = window.location.hash?.substring(1);
   if (!hash) return;

   const entries = Array.from(new URLSearchParams(hash).entries()).filter(([key]) =>
      key.startsWith('error')
   );
   if (entries.length === 0) return;

   const error = Object.fromEntries(entries);

   history.replaceState(null, '', window.location.pathname + window.location.search);

   throw new CustomAuthError(error.error, error.error_code, 400, error.error_code);
};
