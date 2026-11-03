import { PACKAGES, CUSTOMER_STATUSES } from '@/api/customer';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '@/api/document';
import { PRODUCT_STATUSES } from '@/api/product';
import { GATE_CODES, PROJECT_PATHS, PROJECT_TYPES, TASK_STATUSES } from '@/api/project';
import { SUPPLIER_STATUSES } from '@/api/supplier';

/** Every enum that has glossary copy (i18n `glossary.<enum>.<value>`), with all its values. */
export const GLOSSARY_ENUMS = {
   package: PACKAGES,
   project_type: PROJECT_TYPES,
   project_path: PROJECT_PATHS,
   gate_code: GATE_CODES,
   document_type: DOCUMENT_TYPES,
   document_status: DOCUMENT_STATUSES,
   supplier_status: SUPPLIER_STATUSES,
   customer_status: CUSTOMER_STATUSES,
   product_status: PRODUCT_STATUSES,
   task_status: TASK_STATUSES
} as const;

export type GlossaryEnum = keyof typeof GLOSSARY_ENUMS;

export const glossaryKey = (e: GlossaryEnum, value: string) => `glossary.${e}.${value}`;
