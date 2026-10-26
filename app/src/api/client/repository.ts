import { supabase } from '@/lib/supabase';

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
   async options(signal: AbortSignal) {
      const { data } = await supabase
         .from('client')
         .select('*, address(*)')
         .order('display_name')
         .abortSignal(signal)
         .throwOnError();
      return data;
   },

   async save(values: ClientInput) {
      const { data } = await supabase
         .from('client')
         .upsert(values as ClientInsert)
         .select()
         .single()
         .throwOnError();
      return data;
   },

   async remove(id: string) {
      await supabase.from('client').delete().eq('id', id).throwOnError();
   },

   /** Replaces the client's addresses with the given ones. */
   async setAddresses(clientId: string, addressIds: string[]) {
      // TODO: run in one transaction (RPC) so a failed insert cannot leave the client without addresses.
      await supabase.from('client_address').delete().eq('client_id', clientId).throwOnError();

      if (!addressIds.length) return;

      await supabase
         .from('client_address')
         .insert(addressIds.map((address_id) => ({ address_id, client_id: clientId })))
         .throwOnError();
   }
};
