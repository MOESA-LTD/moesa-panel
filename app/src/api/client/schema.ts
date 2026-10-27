import {
   dateOnly,
   email,
   optional,
   parseDateOnly,
   phone,
   required,
   requiredText
} from '@/lib/form/fields';
import * as z from 'zod';
import type { Client, ClientInput } from './repository';

/** Matches the `gender` check constraint of public.client. */
export const GENDERS = ['male', 'female'] as const;

export const clientSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   nationality: requiredText(),
   national_id: requiredText(),
   birth_date: dateOnly(),
   gender: required(z.enum(GENDERS)),
   email: optional(email()),
   phone: optional(phone())
});

export type ClientFormValues = z.input<typeof clientSchema>;

/** Form values for an existing client, or an empty form. */
export const toClientFormValues = (client?: Partial<Client> | null): ClientFormValues => ({
   id: client?.id ?? undefined,
   display_name: client?.display_name ?? '',
   nationality: client?.nationality ?? '',
   national_id: client?.national_id ?? '',
   birth_date: parseDateOnly(client?.birth_date),
   gender: (client?.gender as ClientFormValues['gender']) ?? null,
   email: client?.email ?? '',
   phone: client?.phone ?? ''
});

export const toClientPayload = (values: z.output<typeof clientSchema>): ClientInput => values;

/** The client's address selection (client_address rows). */
export const clientAddressesSchema = z.object({
   id: requiredText(),
   address: z.array(z.looseObject({ id: z.string() }))
});

export type ClientAddressesFormValues = z.input<typeof clientAddressesSchema>;

type ClientWithAddresses = Partial<Client> & { address?: Array<{ id: string }> | null };

export const toClientAddressesFormValues = (
   client?: ClientWithAddresses | null
): ClientAddressesFormValues => ({
   id: client?.id ?? '',
   address: client?.address ?? []
});
