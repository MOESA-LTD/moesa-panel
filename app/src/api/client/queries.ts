import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { toModel } from '@/lib/model/Model';
import { ClientModel } from './model';
import { clientRepository } from './repository';

export function useClient(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'client', toValue(id))),
      queryFn: ({ signal }) => clientRepository.get(toValue(id)!, signal),
      select: (data) => toModel(ClientModel, data),
      enabled: computed(() => !!toValue(id))
   });
}

export function useClientOptions() {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.list(tenantId.value, 'client', { view: 'options' })),
      queryFn: ({ signal }) => clientRepository.options(signal),
      select: (data) => toModel(ClientModel, data)
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
      // invalidateTables follows the cascade to the client's addresses and records.
      onSuccess: () => invalidateTables(queryClient, ['client'])
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
