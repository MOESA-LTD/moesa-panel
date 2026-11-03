import { defineResource, type ResourceInput } from '@/api/defineResource';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { dateOnly, optional, parseDateOnly, required, website } from '@/lib/form/fields';
import i18n from '@plugins/i18n';
import dayjs from 'dayjs';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type DocumentType = Enums['document_type'];
export type DocumentStatus = Enums['document_status'];
export type DocumentEntity = Enums['document_entity'];
export type DocumentRow = Tables['document']['Row'];

/** The type's part of a file name (spec §7.6). */
export const DOCUMENT_TYPE_CODES: Record<DocumentType, string> = {
   spec_sheet: 'SPEC',
   tech_pack: 'TECHPACK',
   sample_report: 'SAMPLE',
   pi: 'PI',
   po: 'PO',
   psi_report: 'PSI',
   test_report: 'TEST',
   sds: 'SDS',
   doc_of_conformity: 'DOC',
   technical_file: 'TECHFILE',
   label_artwork: 'LABEL',
   packing_list: 'PL',
   commercial_invoice: 'CI',
   bill_of_lading: 'BL',
   customs: 'CUSTOMS',
   delivery_receipt: 'DELIVERY',
   gate_approval: 'GATE',
   change_request: 'CR',
   contract: 'CONTRACT',
   certificate: 'CERT',
   other: 'OTHER'
};

/** The status's part of a file name. */
export const DOCUMENT_STATUS_SUFFIX: Record<DocumentStatus, string> = {
   draft: 'taslak',
   signed: 'imzali',
   approved: 'onayli',
   superseded: 'eski'
};

// Derived from the records above, which the compiler checks against the database enums.
export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_CODES) as [DocumentType, ...DocumentType[]];
export const DOCUMENT_STATUSES = Object.keys(DOCUMENT_STATUS_SUFFIX) as [
   DocumentStatus,
   ...DocumentStatus[]
];

export const DOCUMENT_ENTITIES = [
   'customer',
   'supplier',
   'product',
   'project',
   'project_gate',
   'purchase_order',
   'shipment',
   'incident'
] as const satisfies readonly DocumentEntity[];

/**
 * `<code>_<TYPECODE>_v<NN>_<YYYYMMDD>_<status>`, e.g. THO-MOP40-2P_SPEC_v03_20261102_imzali. A
 * document without a date is named with today's.
 */
export function documentFileName({
   code,
   type,
   version,
   issuedOn,
   status
}: {
   code: string;
   type: DocumentType;
   version: number;
   issuedOn?: string | Date | null;
   status: DocumentStatus;
}) {
   const date = dayjs(issuedOn ?? undefined).format('YYYYMMDD');
   const nn = String(version).padStart(2, '0');
   return `${code}_${DOCUMENT_TYPE_CODES[type]}_v${nn}_${date}_${DOCUMENT_STATUS_SUFFIX[status]}`;
}

export const documentResource = defineResource('document');

export const documentSchema = z
   .object({
      id: z.string().optional(),
      entity_type: z.enum(DOCUMENT_ENTITIES),
      entity_id: z.string(),
      customer_id: z.string().nullish(),
      type: required(z.enum(DOCUMENT_TYPES)),
      version: z.number().int().min(1),
      issued_on: optional(dateOnly()),
      status: z.enum(DOCUMENT_STATUSES).default('draft'),
      url: optional(website()),
      is_signed: z.boolean(),
      is_stamped: z.boolean(),
      sent_from_official_email: z.boolean(),
      notes: optional(z.string())
   })
   // Mirrors the database rule (document_signed_requires), so it shows before saving.
   .superRefine((document, ctx) => {
      if (
         document.status === 'signed' &&
         !(
            document.is_signed &&
            document.is_stamped &&
            document.sent_from_official_email &&
            document.issued_on
         )
      )
         ctx.addIssue({
            code: 'custom',
            path: ['status'],
            message: i18n.t('errors.document_signed_incomplete')
         });
   });

export type DocumentFormValues = z.input<typeof documentSchema>;

export const toDocumentFormValues = (
   document?: Partial<DocumentRow> | null
): DocumentFormValues => ({
   id: document?.id ?? undefined,
   entity_type: document?.entity_type ?? 'product',
   entity_id: document?.entity_id ?? '',
   customer_id: document?.customer_id ?? null,
   type: document?.type ?? null,
   version: document?.version ?? 1,
   issued_on: parseDateOnly(document?.issued_on),
   status: document?.status ?? 'draft',
   url: document?.url ?? '',
   is_signed: document?.is_signed ?? false,
   is_stamped: document?.is_stamped ?? false,
   sent_from_official_email: document?.sent_from_official_email ?? false,
   notes: document?.notes ?? ''
});

/**
 * The row to save. With the record's code (SKU, customer, supplier or project code) the file name
 * is set from it; without one the stored name is kept.
 */
export const toDocumentPayload = (
   document: z.output<typeof documentSchema>,
   code?: string | null
): ResourceInput<'document'> => ({
   ...document,
   ...(code
      ? {
           file_name: documentFileName({
              code,
              type: document.type,
              version: document.version,
              issuedOn: document.issued_on,
              status: document.status
           })
        }
      : {})
});

/** ResourceTable props for the documents of one record. */
export const useEntityDocuments = (entityType: DocumentEntity, entityId: string) => ({
   from: 'document' as const,
   select: '*',
   useMeta: false,
   filters: createFilters({
      entity_type: equalsFilter(entityType),
      entity_id: equalsFilter(entityId)
   })
});
