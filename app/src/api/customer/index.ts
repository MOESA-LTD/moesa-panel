import { allValues } from '@/lib/enumValues';
import { defineResource, type ResourceInput } from '@/api/defineResource';
import { useLookup } from '@/api/useLookup';
import {
   dateOnly,
   email,
   optional,
   parseDateOnly,
   phone,
   required,
   requiredText,
   sensitive,
   website
} from '@/lib/form/fields';
import i18n from '@plugins/i18n';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type CustomerStatus = Enums['customer_status'];
export type CommercialModel = Enums['commercial_model'];
export type WarehouseType = Enums['warehouse_type'];
export type PlatformAccess = Enums['platform_access'];
export type CustomerRow = Tables['customer']['Row'];
export type CustomerContactRow = Tables['customer_contact']['Row'];
export type CustomerWarehouseRow = Tables['customer_warehouse']['Row'];
export type CustomerPlatformAccountRow = Tables['customer_platform_account']['Row'];
export type CustomerBrandRow = Tables['customer_brand']['Row'];

export const CUSTOMER_STATUSES = allValues<CustomerStatus>()([
   'lead',
   'onboarding',
   'active',
   'paused',
   'closed'
]);

export const COMMERCIAL_MODELS = [
   'trading_partner',
   'commercial_representative',
   'operations_partner'
] as const satisfies readonly CommercialModel[];

export const WAREHOUSE_TYPES = [
   'own',
   'third_party',
   'fba'
] as const satisfies readonly WarehouseType[];

export const PLATFORM_ACCESSES = [
   'authorized_user',
   'none'
] as const satisfies readonly PlatformAccess[];

/** The service packages a customer may take (checked by the database too). */
export const PACKAGES = ['A0', 'A1', 'A2', 'B', 'C', 'D', 'E'] as const;

/** Three capital letters, e.g. THO. Fixed once saved: it names documents and business codes. */
export const CUSTOMER_CODE = /^[A-Z]{3}$/;

export const customerResource = defineResource('customer');
export const customerContactResource = defineResource('customer_contact');
export const customerWarehouseResource = defineResource('customer_warehouse');
export const customerPlatformAccountResource = defineResource('customer_platform_account');
export const customerBrandResource = defineResource('customer_brand');

const text = () => optional(z.string().trim());

/** Sets the empty (undefined) fields of a parsed form to null, as the row stores them. */
const nullEmpty = <T extends object>(values: T) =>
   Object.fromEntries(Object.entries(values).map(([column, value]) => [column, value ?? null])) as {
      [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K];
   };

/** Empty form strings for the given text columns of a row. */
const textValues = <C extends string>(
   columns: readonly C[],
   row?: Partial<Record<C, unknown>> | null
) =>
   Object.fromEntries(columns.map((column) => [column, row?.[column] ?? ''])) as Record<C, string>;

/** The row to save: the id only when editing, empty fields as null. */
const toPayload = <T extends { id?: string }>({ id, ...values }: T) => ({
   ...(id ? { id } : {}),
   ...nullEmpty(values)
});

// --- customer ---

const CUSTOMER_TEXT_COLUMNS = [
   'website',
   'extra_cost_rule',
   'eu_responsible_person',
   'restricted_drive_url',
   'notes'
] as const;

export const customerSchema = z.object({
   id: z.string().optional(),
   code: z
      .string({ error: () => i18n.t('form.required') })
      .trim()
      .toUpperCase()
      .regex(CUSTOMER_CODE, { error: () => i18n.t('ops.customer.errors.invalid_code') }),
   display_name: requiredText(),
   country: z.string().trim().min(1).nullish(),
   website: optional(website()),
   commercial_model: required(z.enum(COMMERCIAL_MODELS)),
   packages: z.array(z.enum(PACKAGES)),
   status: z.enum(CUSTOMER_STATUSES).default('lead'),
   contract_accepted_on: optional(dateOnly()),
   contract_document_id: optional(z.uuid()),
   start_on: optional(dateOnly()),
   deposit_rate: z.number().min(0).max(100).nullable(),
   extra_cost_rule: text(),
   eu_responsible_person: text(),
   restricted_drive_url: optional(website()),
   notes: text()
});

export type CustomerFormValues = z.input<typeof customerSchema>;

export const toCustomerFormValues = (
   customer?: Partial<CustomerRow> | null
): CustomerFormValues => ({
   id: customer?.id ?? undefined,
   code: customer?.code ?? '',
   display_name: customer?.display_name ?? '',
   country: customer?.country ?? null,
   commercial_model: customer?.commercial_model ?? null,
   packages: (customer?.packages ?? []) as (typeof PACKAGES)[number][],
   status: customer?.status ?? 'lead',
   contract_accepted_on: parseDateOnly(customer?.contract_accepted_on),
   contract_document_id: customer?.contract_document_id ?? null,
   start_on: parseDateOnly(customer?.start_on),
   deposit_rate: customer?.deposit_rate ?? null,
   ...textValues(CUSTOMER_TEXT_COLUMNS, customer)
});

export const toCustomerPayload = (
   customer: z.output<typeof customerSchema>
): ResourceInput<'customer'> => toPayload(customer);

// --- contacts ---

export const customerContactSchema = z.object({
   id: z.string().optional(),
   customer_id: z.string().min(1),
   name: sensitive('customer_contact', 'name', requiredText()),
   role: text(),
   email: optional(email()),
   phone: optional(phone()),
   can_approve: z.boolean()
});

export type CustomerContactFormValues = z.input<typeof customerContactSchema>;

export const toCustomerContactFormValues = (
   contact?: Partial<CustomerContactRow> | null
): CustomerContactFormValues => ({
   id: contact?.id ?? undefined,
   customer_id: contact?.customer_id ?? '',
   name: contact?.name ?? '',
   can_approve: contact?.can_approve ?? false,
   ...textValues(['role', 'email', 'phone'] as const, contact)
});

export const toCustomerContactPayload = (
   contact: z.output<typeof customerContactSchema>
): ResourceInput<'customer_contact'> => toPayload(contact);

// --- warehouses ---

const WAREHOUSE_TEXT_COLUMNS = [
   'city',
   'address',
   'postal_code',
   'dock_hours',
   'appointment_rule',
   'pallet_standard',
   'receiving_person'
] as const;

export const customerWarehouseSchema = z.object({
   id: z.string().optional(),
   customer_id: z.string().min(1),
   display_name: requiredText(),
   type: required(z.enum(WAREHOUSE_TYPES)),
   country: z.string().trim().min(1).nullish(),
   city: text(),
   address: text(),
   postal_code: text(),
   dock_hours: text(),
   appointment_rule: text(),
   pallet_standard: text(),
   receiving_person: text(),
   is_default: z.boolean()
});

export type CustomerWarehouseFormValues = z.input<typeof customerWarehouseSchema>;

export const toCustomerWarehouseFormValues = (
   warehouse?: Partial<CustomerWarehouseRow> | null
): CustomerWarehouseFormValues => ({
   id: warehouse?.id ?? undefined,
   customer_id: warehouse?.customer_id ?? '',
   display_name: warehouse?.display_name ?? '',
   type: warehouse?.type ?? 'own',
   country: warehouse?.country ?? null,
   is_default: warehouse?.is_default ?? false,
   ...textValues(WAREHOUSE_TEXT_COLUMNS, warehouse)
});

export const toCustomerWarehousePayload = (
   warehouse: z.output<typeof customerWarehouseSchema>
): ResourceInput<'customer_warehouse'> => toPayload(warehouse);

// --- platform accounts (no passwords or tokens are kept) ---

export type PlatformOption = Pick<Tables['platform']['Row'], 'id' | 'display_name' | 'countries'>;

/** The marketplaces in display order (global, no tenant); their countries bound an account's. */
export const usePlatformOptions = () =>
   useLookup<PlatformOption>('platform', {
      select: 'id, display_name, countries',
      order: 'position'
   });

export const customerPlatformAccountSchema = z.object({
   id: z.string().optional(),
   customer_id: z.string().min(1),
   platform_id: required(z.string().min(1)),
   countries: z.array(z.string()),
   account_holder: text(),
   access: z.enum(PLATFORM_ACCESSES).default('none'),
   notes: text()
});

export type CustomerPlatformAccountFormValues = z.input<typeof customerPlatformAccountSchema>;

export const toCustomerPlatformAccountFormValues = (
   account?: Partial<CustomerPlatformAccountRow> | null
): CustomerPlatformAccountFormValues => ({
   id: account?.id ?? undefined,
   customer_id: account?.customer_id ?? '',
   platform_id: account?.platform_id ?? null,
   countries: account?.countries ?? [],
   access: account?.access ?? 'none',
   ...textValues(['account_holder', 'notes'] as const, account)
});

export const toCustomerPlatformAccountPayload = (
   account: z.output<typeof customerPlatformAccountSchema>
): ResourceInput<'customer_platform_account'> => toPayload(account);

// --- brands ---

export const customerBrandSchema = z.object({
   id: z.string().optional(),
   customer_id: z.string().min(1),
   name: requiredText(),
   registration_status: text(),
   brand_program_status: text(),
   gs1_prefix_owner: text()
});

export type CustomerBrandFormValues = z.input<typeof customerBrandSchema>;

export const toCustomerBrandFormValues = (
   brand?: Partial<CustomerBrandRow> | null
): CustomerBrandFormValues => ({
   id: brand?.id ?? undefined,
   customer_id: brand?.customer_id ?? '',
   name: brand?.name ?? '',
   ...textValues(
      ['registration_status', 'brand_program_status', 'gs1_prefix_owner'] as const,
      brand
   )
});

export const toCustomerBrandPayload = (
   brand: z.output<typeof customerBrandSchema>
): ResourceInput<'customer_brand'> => toPayload(brand);
