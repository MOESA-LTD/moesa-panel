import type { GlossaryEnum } from '@/api/glossary';

/** The pages that have a guide (i18n `guide.pages.<page>`). */
export const GUIDE_PAGES = [
   'dashboard',
   'setting',
   'customer',
   'supplier',
   'product',
   'project',
   'document',
   'media',
   'purchase_order',
   'shipment',
   'market_matrix',
   'incident',
   'change_request'
] as const;

export type GuidePage = (typeof GUIDE_PAGES)[number];

/**
 * A common task of a page: its copy is `guide.pages.<page>.tasks.<id>.title` and `steps.1` to
 * `steps.<steps>`; it is shown to the roles that have its permission.
 */
export type GuideTask = {
   id: string;
   steps: number;
   permission: { action: 'read' | 'create' | 'update' | 'delete'; subject: string };
};

/** A page's guide: its route, the tasks, the related pages (route names) and the terms it uses. */
export type PageGuide = {
   route: string;
   tasks: readonly GuideTask[];
   related: readonly string[];
   glossary: readonly GlossaryEnum[];
};

const task = (
   id: string,
   action: GuideTask['permission']['action'],
   subject: string
): GuideTask => ({ id, steps: 3, permission: { action, subject } });

export const PAGE_GUIDES: Record<GuidePage, PageGuide> = {
   dashboard: {
      route: 'dashboard',
      tasks: [
         task('close_gates', 'update', 'project_gate'),
         task('close_tasks', 'update', 'project_task'),
         task('sign_spec', 'create', 'document'),
         task('complete_compliance', 'update', 'product'),
         task('advance_po', 'update', 'purchase_order'),
         task('track_shipment', 'update', 'shipment'),
         task('close_incident', 'update', 'incident'),
         task('decide_cr', 'update', 'change_request'),
         task('update_market', 'update', 'market_cell')
      ],
      related: ['ops-project', 'ops-purchase-order', 'ops-shipment', 'ops-incident', 'ops-market'],
      glossary: ['gate_code', 'incident_severity']
   },
   setting: {
      route: 'ops-setting',
      tasks: [task('change_setting', 'update', 'setting'), task('read_setting', 'read', 'setting')],
      related: ['dashboard', 'ops-purchase-order', 'ops-incident'],
      glossary: []
   },
   customer: {
      route: 'ops-customer',
      tasks: [
         task('add_customer', 'create', 'customer'),
         task('add_warehouse', 'create', 'customer_warehouse'),
         task('add_platform', 'create', 'customer_platform_account')
      ],
      related: ['ops-project', 'ops-product', 'ops-market'],
      glossary: ['customer_status', 'package']
   },
   supplier: {
      route: 'ops-supplier',
      tasks: [
         task('add_supplier', 'create', 'supplier'),
         task('add_contact', 'create', 'supplier_contact'),
         task('see_orders', 'read', 'purchase_order')
      ],
      related: ['ops-purchase-order', 'ops-product'],
      glossary: ['supplier_status']
   },
   product: {
      route: 'ops-product',
      tasks: [
         task('import_products', 'create', 'product'),
         task('add_spec', 'create', 'document'),
         task('add_media', 'create', 'media')
      ],
      related: ['ops-document', 'ops-media', 'ops-market'],
      glossary: ['product_status', 'document_status']
   },
   project: {
      route: 'ops-project',
      tasks: [
         task('open_project', 'create', 'project'),
         task('pass_gate', 'update', 'project_gate'),
         task('rollback_gate', 'update', 'project_gate')
      ],
      related: ['ops-incident', 'ops-purchase-order', 'ops-change-request'],
      glossary: ['project_type', 'project_path', 'package', 'gate_code', 'task_status']
   },
   document: {
      route: 'ops-document',
      tasks: [
         task('find_document', 'read', 'document'),
         task('new_version', 'create', 'document'),
         task('set_status', 'update', 'document')
      ],
      related: ['ops-product', 'ops-media', 'ops-change-request'],
      glossary: ['document_type', 'document_status']
   },
   media: {
      route: 'ops-media',
      tasks: [
         task('upload', 'create', 'media'),
         task('link', 'create', 'media_link'),
         task('delete_media', 'delete', 'media')
      ],
      related: ['ops-document', 'ops-product'],
      glossary: []
   },
   purchase_order: {
      route: 'ops-purchase-order',
      tasks: [
         task('create_po', 'create', 'purchase_order'),
         task('check_pi', 'update', 'purchase_order'),
         task('record_payment', 'create', 'purchase_order_payment')
      ],
      related: ['ops-shipment', 'ops-supplier', 'ops-project'],
      glossary: ['purchase_order_status', 'payment_kind']
   },
   shipment: {
      route: 'ops-shipment',
      tasks: [
         task('plan_shipment', 'create', 'shipment'),
         task('log_event', 'create', 'shipment_event'),
         task('accept', 'update', 'shipment')
      ],
      related: ['ops-purchase-order', 'ops-incident', 'ops-customer'],
      glossary: ['shipment_status', 'shipment_mode']
   },
   market_matrix: {
      route: 'ops-market',
      tasks: [
         task('add_cells', 'create', 'market_cell'),
         task('screen_compliance', 'update', 'market_cell'),
         task('go_live', 'update', 'market_cell')
      ],
      related: ['ops-product', 'ops-customer', 'ops-incident'],
      glossary: ['market_cell_status', 'market_compliance', 'content_status', 'stock_source']
   },
   incident: {
      route: 'ops-incident',
      tasks: [
         task('open_incident', 'create', 'incident'),
         task('keep_log', 'create', 'incident_log'),
         task('close', 'update', 'incident')
      ],
      related: ['ops-shipment', 'ops-project', 'ops-change-request'],
      glossary: [
         'incident_severity',
         'incident_status',
         'incident_family',
         'incident_deadline_kind'
      ]
   },
   change_request: {
      route: 'ops-change-request',
      tasks: [
         task('open_cr', 'create', 'change_request'),
         task('approve_cr', 'update', 'change_request'),
         task('apply_cr', 'update', 'change_request')
      ],
      related: ['ops-project', 'ops-document', 'ops-incident'],
      glossary: ['change_request_status', 'change_request_source', 'change_kind']
   }
};

/** The page whose route is the deepest of the matched routes that has a guide, if any. */
export const guideForRoute = (matched: readonly { name?: string | symbol }[]): GuidePage | null => {
   for (const record of [...matched].reverse()) {
      const found = GUIDE_PAGES.find((p) => PAGE_GUIDES[p].route === record.name);
      if (found) return found;
   }
   return null;
};

/** The page's tasks the user may do. */
export const visibleTasks = (
   guide: PageGuide,
   can: (action: string, subject: string) => boolean
): GuideTask[] => guide.tasks.filter((t) => can(t.permission.action, t.permission.subject));

/** The storage key remembering that a route's guide has been shown once. */
export const dismissedKey = (route: string) => `guide.dismissed.${route}`;
