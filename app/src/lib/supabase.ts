/// <reference types="vite/client" />

// app/src/lib/supabase.ts

import ConfirmationEventBus from 'primevue/confirmationeventbus';
import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';

const handleDeleteDialog = async (options: RequestInit & Request): Promise<boolean> => {
   if (_toUpper(options.method) !== 'DELETE' || options.headers.has('x-delete-confirmed')) return;
   options.headers.delete('x-delete-confirmed');

   return await new Promise((resolve, reject) => {
      const item = JSON.parse(decodeURI(options.headers?.get?.('item')));

      if (item) options.headers.delete('item');

      // The bus behind useConfirm(); avoids importing the app instance (circular import).
      return ConfirmationEventBus.emit('confirm', {
         icon: PrimeIcons.EXCLAMATION_TRIANGLE,
         message: `${i18n.t('action.confirm.delete.question', { item })}`,
         header: i18n.t('action.confirm.delete.title', {
            name: item?.display_name || item?.name || item?.id
         }),
         acceptProps: {
            label: i18n.t('action.yes'),
            outlined: true
         },
         rejectProps: {
            label: i18n.t('action.no'),
            severity: 'secondary',
            outlined: true
         },
         accept: () => resolve(true),
         reject: () => reject(i18n.t('action.cancelled'))
      });
   });
};

/**
 * Adds the current tenant to every request. The delete confirmation is transitional: modules on
 * src/api confirm in the UI (useConfirmDelete) and send `x-delete-confirmed`.
 */
const customFetch = async (
   url: string | URL,
   options: RequestInit & Request
): Promise<Response> => {
   const { currentTenant } = useAuthStore();

   await handleDeleteDialog(options);

   if (currentTenant?.display_name) {
      options?.headers?.set?.('x-tenant', currentTenant?.display_name);
      options?.headers?.set?.('x-tenant-id', currentTenant?.id);
   }

   if (currentTenant?.id && _isString(options?.body) && !_includes(url as string, 'rpc/')) {
      const body = JSON.parse(options.body || '{}');

      if (!_isNil(body) && !_isEmpty(body) && !_isArray(body)) {
         _merge(body, { tenant_id: currentTenant?.id });
         options.body = JSON.stringify(body) as BodyInit & ReadableStream<Uint8Array<ArrayBuffer>>;
      }
   }

   return fetch(url, options);
};

const supabaseOptions: SupabaseClientOptions<'public'> = {
   auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
   },
   global: {
      fetch: customFetch as typeof fetch
   }
};

const env = import.meta.env;

export const supabase = createClient<Db>(
   env.VITE_SUPABASE_PROJECT_URL,
   env.VITE_SUPABASE_PROJECT_ANON_KEY,
   supabaseOptions
);
