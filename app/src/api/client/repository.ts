import { syncJunction } from '@/api/junction';
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

   /** Makes the client's addresses exactly the given ones. */
   async setAddresses(clientId: string, addressIds: string[]) {
      await syncJunction({
         table: 'client_address',
         ownerColumn: 'client_id',
         ownerId: clientId,
         itemColumn: 'address_id',
         itemIds: addressIds
      });
   }
};
