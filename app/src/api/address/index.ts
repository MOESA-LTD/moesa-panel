import { defineResource, type ResourceInput, type ResourceRow } from '@/api/defineResource';
import { optional, requiredText } from '@/lib/form/fields';
import * as z from 'zod';

export type Address = ResourceRow<'address'>;

export const addressResource = defineResource('address');

export const addressSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   country: requiredText(),
   city: requiredText(),
   // NOT NULL in the database.
   district: requiredText(),
   details: optional(z.string())
});

export type AddressFormValues = z.input<typeof addressSchema>;

export const toAddressFormValues = (address?: Partial<Address> | null): AddressFormValues => ({
   id: address?.id ?? undefined,
   display_name: address?.display_name ?? '',
   country: address?.country ?? '',
   city: address?.city ?? '',
   district: address?.district ?? '',
   details: address?.details ?? ''
});

export const toAddressPayload = (
   values: z.output<typeof addressSchema>
): ResourceInput<'address'> => values;
