import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { clientRepository } from './repository';

export function useClient(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantId();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'client', toValue(id))),
      queryFn: ({ signal }) => clientRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

export function useClientOptions() {
   const tenantId = useTenantId();

   return useQuery({
      queryKey: computed(() => queryKeys.list(tenantId.value, 'client', { view: 'options' })),
      queryFn: ({ signal }) => clientRepository.options(signal)
   });
}

export function useSaveClient() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: clientRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['client'])
   });
}

export function useDeleteClient() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: clientRepository.remove,
      // Addresses and records of the client are removed by cascade.
      onSuccess: () => invalidateTables(queryClient, ['client', 'client_address', 'record'])
   });
}

export function useSaveClientAddresses() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ clientId, addressIds }: { clientId: string; addressIds: string[] }) =>
         clientRepository.setAddresses(clientId, addressIds),
      onSuccess: () => invalidateTables(queryClient, ['client', 'client_address'])
   });
}
