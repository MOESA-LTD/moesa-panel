<script setup lang="ts">
import {
   addressResource,
   addressSchema,
   toAddressFormValues,
   toAddressPayload,
   type Address
} from '@/api/address';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new address. */
   data?: Partial<Address> | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready } = useUpsertForm({
   id: () => props.id ?? props.data?.id,
   prefill: () => props.data,
   useRow: addressResource.useOne,
   useSaveRow: addressResource.useSave,
   subject: 'address',
   schema: addressSchema,
   toFormValues: toAddressFormValues,
   toPayload: toAddressPayload
});
await ready;
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :readonly
      >
         <FormField :readonly fluid :error="errors.display_name" :label="$t('fields.name')">
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.display_name" />
            </template>
         </FormField>
         <FormField :readonly fluid :error="errors.country" :label="$t('fields.country')">
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.country" />
            </template>
         </FormField>
         <FormField :readonly fluid :error="errors.city" :label="$t('fields.city')">
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.city" />
            </template>
         </FormField>
         <FormField :readonly fluid :error="errors.district" :label="$t('fields.district')">
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.district" />
            </template>
         </FormField>
         <FormField
            class="!flex-auto !max-w-full w-full h-fit"
            :readonly
            fluid
            :error="errors.details"
            :label="$t('fields.details')"
         >
            <template #default="slotProps">
               <Editor v-bind="slotProps" v-model="values.details" />
            </template>
         </FormField>
      </FormBox>
   </div>
</template>
