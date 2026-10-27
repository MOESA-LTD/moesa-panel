import { supabase } from '@/lib/supabase';
import { forTenant } from '@/api/formTenant';
import { saveRow } from '@/api/saveRow';

export type Client = Tables['client']['Row'];
export type ClientInsert = Tables['client']['Insert'];
/** What forms send: tenant_id is added to every write by customFetch. */
export type ClientInput = Omit<ClientInsert, 'tenant_id'>;

export const clientRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('client')
         .select('*, address(*)')
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data;
   },

   /** Clients for pickers, with their addresses so the caller can prefill them. */
   /** The clients to pick from, of `tenantId` alone when given (a form's tenant). */
   async options(signal: AbortSignal, tenantId?: string | null) {
      const { data } = await forTenant(
         supabase.from('client').select('*, address(*)').order('display_name').abortSignal(signal),
         tenantId
      ).throwOnError();
      return data;
   },

   save: (values: ClientInput) => saveRow<Tables['client']['Row']>('client', values),

   async remove(id: string) {
      await supabase.from('client').delete().eq('id', id).throwOnError();
   },

   /** Makes the client's addresses exactly the given ones, in one transaction. */
   async setAddresses(clientId: string, addressIds: string[]) {
      await supabase
         .rpc('set_client_addresses', { client_id: clientId, address_ids: addressIds })
         .throwOnError();
   }
};
