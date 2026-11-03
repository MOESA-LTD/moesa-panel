import { defineResource, type ResourceInput } from '@/api/defineResource';
import {
   dateOnly,
   email,
   optional,
   parseDateOnly,
   phone,
   required,
   requiredText,
   website
} from '@/lib/form/fields';
import i18n from '@plugins/i18n';
import * as z from 'zod';

export type SupplierStatus = Db['public']['Enums']['supplier_status'];
export type SupplierRow = Tables['supplier']['Row'];
export type SupplierContactRow = Tables['supplier_contact']['Row'];

export const SUPPLIER_STATUSES = [
   'candidate',
   'approved',
   'suspended'
] as const satisfies readonly SupplierStatus[];

/** Country letters and a number, e.g. CN1, TR12. */
export const SUPPLIER_CODE = /^[A-Z]{2}[0-9]{1,3}$/;

// Suppliers are shared by every customer of the tenant: no customer_id, and the customer filter
// does not apply to them.
export const supplierResource = defineResource('supplier');
export const supplierContactResource = defineResource('supplier_contact');

const text = () => optional(z.string().trim());

/** The free-text columns: empty in the form, null in the row. */
const TEXT_COLUMNS = [
   'city',
   'capacity_note',
   'default_incoterm',
   'payment_terms',
   'storage_fee_rule',
   'late_payment_penalty',
   'cancellation_rule',
   'notes'
] as const;

export const supplierSchema = z.object({
   id: z.string().optional(),
   code: z
      .string({ error: () => i18n.t('form.required') })
      .trim()
      .toUpperCase()
      .regex(SUPPLIER_CODE, { error: () => i18n.t('ops.supplier.errors.invalid_code') }),
   display_name: requiredText(),
   country: required(z.string().trim().min(1)),
   city: text(),
   website: optional(website()),
   product_groups: z.array(z.string().trim().min(1)),
   capacity_note: text(),
   default_incoterm: text(),
   deposit_rate: z.number().min(0).max(100).nullable(),
   payment_terms: text(),
   damage_notice_hours: z.number().int().min(0).nullable(),
   storage_fee_rule: text(),
   late_payment_penalty: text(),
   cancellation_rule: text(),
   rating: z.number().int().min(1).max(5).nullable(),
   last_audit_on: optional(dateOnly()),
   status: z.enum(SUPPLIER_STATUSES).default('candidate'),
   notes: text()
});

export type SupplierFormValues = z.input<typeof supplierSchema>;

export const toSupplierFormValues = (
   supplier?: Partial<SupplierRow> | null
): SupplierFormValues => ({
   id: supplier?.id ?? undefined,
   code: supplier?.code ?? '',
   display_name: supplier?.display_name ?? '',
   country: supplier?.country ?? null,
   website: supplier?.website ?? '',
   product_groups: supplier?.product_groups ?? [],
   deposit_rate: supplier?.deposit_rate ?? null,
   damage_notice_hours: supplier?.damage_notice_hours ?? null,
   rating: supplier?.rating ?? null,
   last_audit_on: parseDateOnly(supplier?.last_audit_on),
   status: supplier?.status ?? 'candidate',
   ...(Object.fromEntries(
      TEXT_COLUMNS.map((column) => [column, supplier?.[column] ?? ''])
   ) as Record<(typeof TEXT_COLUMNS)[number], string>)
});

/** The row to save; empty fields as null. */
export const toSupplierPayload = ({
   id,
   ...supplier
}: z.output<typeof supplierSchema>): ResourceInput<'supplier'> => ({
   ...(id ? { id } : {}),
   ...(Object.fromEntries(
      Object.entries(supplier).map(([column, value]) => [column, value ?? null])
   ) as Omit<z.output<typeof supplierSchema>, 'id'>)
});

export const supplierContactSchema = z.object({
   id: z.string().optional(),
   supplier_id: z.string().min(1),
   name: requiredText(),
   role: optional(z.string().trim()),
   email: optional(email()),
   phone: optional(phone()),
   is_primary: z.boolean()
});

export type SupplierContactFormValues = z.input<typeof supplierContactSchema>;

export const toSupplierContactFormValues = (
   contact?: Partial<SupplierContactRow> | null
): SupplierContactFormValues => ({
   id: contact?.id ?? undefined,
   supplier_id: contact?.supplier_id ?? '',
   name: contact?.name ?? '',
   role: contact?.role ?? '',
   email: contact?.email ?? '',
   phone: contact?.phone ?? '',
   is_primary: contact?.is_primary ?? false
});

/** The row to save; empty fields as null. */
export const toSupplierContactPayload = ({
   id,
   ...contact
}: z.output<typeof supplierContactSchema>): ResourceInput<'supplier_contact'> => ({
   ...(id ? { id } : {}),
   ...contact,
   role: contact.role ?? null,
   email: contact.email ?? null,
   phone: contact.phone ?? null
});
