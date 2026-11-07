import { API_CONNECTIONS, LISTING_STATES } from '@/api/amazon';
import {
   CHANGE_KINDS,
   CHANGE_REQUEST_SOURCES,
   CHANGE_REQUEST_STATUSES,
   CHANGE_REQUEST_URGENCIES
} from '@/api/changeRequest';
import { PACKAGES, CUSTOMER_STATUSES } from '@/api/customer';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '@/api/document';
import {
   COST_PAYERS,
   INCIDENT_DEADLINE_KINDS,
   INCIDENT_FAMILIES,
   INCIDENT_OUTCOMES,
   INCIDENT_PARTIES,
   INCIDENT_ROOT_CAUSES,
   INCIDENT_SEVERITIES,
   INCIDENT_STATUSES
} from '@/api/incident';
import {
   CONTENT_STATUSES,
   MARKET_CELL_STATUSES,
   MARKET_COMPLIANCES,
   STOCK_SOURCES
} from '@/api/marketMatrix';
import { PRODUCT_STATUSES } from '@/api/product';
import { GATE_CODES, PROJECT_PATHS, PROJECT_TYPES, TASK_STATUSES } from '@/api/project';
import { PAYMENT_KINDS, PURCHASE_ORDER_STATUSES } from '@/api/purchaseOrder';
import { SHIPMENT_MODES, SHIPMENT_STATUSES } from '@/api/shipment';
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
   task_status: TASK_STATUSES,
   purchase_order_status: PURCHASE_ORDER_STATUSES,
   payment_kind: PAYMENT_KINDS,
   shipment_status: SHIPMENT_STATUSES,
   shipment_mode: SHIPMENT_MODES,
   market_cell_status: MARKET_CELL_STATUSES,
   market_compliance: MARKET_COMPLIANCES,
   stock_source: STOCK_SOURCES,
   content_status: CONTENT_STATUSES,
   incident_family: INCIDENT_FAMILIES,
   incident_severity: INCIDENT_SEVERITIES,
   incident_status: INCIDENT_STATUSES,
   incident_party: INCIDENT_PARTIES,
   incident_root_cause: INCIDENT_ROOT_CAUSES,
   incident_outcome: INCIDENT_OUTCOMES,
   incident_deadline_kind: INCIDENT_DEADLINE_KINDS,
   cost_payer: COST_PAYERS,
   change_request_status: CHANGE_REQUEST_STATUSES,
   change_request_source: CHANGE_REQUEST_SOURCES,
   change_request_urgency: CHANGE_REQUEST_URGENCIES,
   change_kind: CHANGE_KINDS,
   listing_state: LISTING_STATES,
   api_connection: API_CONNECTIONS
} as const;

export type GlossaryEnum = keyof typeof GLOSSARY_ENUMS;

export const glossaryKey = (e: GlossaryEnum, value: string) => `glossary.${e}.${value}`;

/** i18n prefix of each enum's value labels (`<prefix>.<value>`); null means the value is its own label. */
export const GLOSSARY_LABELS: Record<GlossaryEnum, string | null> = {
   package: null,
   project_type: 'ops.project.type',
   project_path: 'ops.project.path',
   gate_code: 'ops.project.gate',
   document_type: 'ops.document.type',
   document_status: 'ops.document.status',
   supplier_status: 'ops.supplier.status',
   customer_status: 'ops.customer.status',
   product_status: 'ops.product.status',
   task_status: 'ops.project.task_status',
   purchase_order_status: 'ops.purchase_order.status',
   payment_kind: 'ops.purchase_order.payment.kind',
   shipment_status: 'ops.shipment.status',
   shipment_mode: 'ops.shipment.mode',
   market_cell_status: 'ops.market.status',
   market_compliance: 'ops.market.compliance',
   stock_source: 'ops.market.stock_source',
   content_status: 'ops.market.content_status',
   incident_family: 'ops.incident.family',
   incident_severity: 'ops.incident.severity',
   incident_status: 'ops.incident.status',
   incident_party: 'ops.incident.party',
   incident_root_cause: 'ops.incident.root_cause',
   incident_outcome: 'ops.incident.outcome',
   incident_deadline_kind: 'ops.incident.deadline_kind',
   cost_payer: 'ops.incident.cost_payer',
   change_request_status: 'ops.change_request.status',
   change_request_source: 'ops.change_request.source',
   change_request_urgency: 'ops.change_request.urgency',
   change_kind: 'ops.change_request.kind',
   listing_state: 'ops.amazon.state',
   api_connection: 'ops.amazon.api_connection'
};
