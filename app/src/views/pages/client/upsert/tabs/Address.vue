<script setup lang="ts">
import { useClient, useSaveClientAddresses } from '@/api/client/queries';
import type { Client } from '@/api/client/repository';
import { clientAddressesSchema, toClientAddressesFormValues } from '@/api/client/schema';
import SelectClient from '@/components/service-components/client/SelectClient.vue';
import { useFormReadonly } from '@/composables/useFormReadonly';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { useForm } from '@/lib/form/useForm';
import AddressTable from '@/views/pages/address/Index.vue';
import { useToast } from 'primevue';

const props = defineProps<{
   id?: string | null;
   data?: Partial<Client> | null;
}>();

const toast = useToast();
const { t } = useI18n();

const clientId = computed(() => props.id ?? props.data?.id ?? null);
const { data: client, suspense } = useClient(clientId);
if (clientId.value) await suspense();

const { values, errors, isDirty, isSubmitting, reset, handleSubmit } = useForm({
   schema: clientAddressesSchema,
   initialValues: toClientAddressesFormValues(client.value ?? props.data)
});

// Follow fresh server data (e.g. saved in another view) unless the user has unsaved edits.
watch(client, (value) => {
   if (value && !isDirty.value) reset(toClientAddressesFormValues(value));
});

useUnsavedChangesGuard(isDirty);

const readonly = useFormReadonly('client_address', () => values.value.id);

const { mutateAsync: saveAddresses } = useSaveClientAddresses();

const save = handleSubmit(async ({ id, address }) => {
   await saveAddresses({ clientId: id, addressIds: address.map((row) => row.id) });
   reset(values.value);

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
});

provide('dialogRef', true);
</script>

<template>
   <div class="card p-0">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :readonly
      >
         <FormField
            fluid
            :error="errors.id"
            :label="$t('fields.client_id')"
            v-slot="slotProps"
            v-if="!id && !data?.id"
         >
            <SelectClient
               v-bind="slotProps"
               v-model="values.id"
               @clientSelect="reset(toClientAddressesFormValues($event))"
            />
         </FormField>
         <FormField
            fluid
            :error="errors.address"
            v-slot="slotProps"
            class="!flex-auto !max-w-none w-full"
         >
            <AddressTable
               v-bind="slotProps"
               selectionMode="multiple"
               v-model:selection="values.address"
               :useMeta="false"
               :frozenValue="values.address"
               :rows="5"
            />
         </FormField>
      </FormBox>
   </div>
</template>
