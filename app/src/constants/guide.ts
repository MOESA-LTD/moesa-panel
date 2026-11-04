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

const page = (route: string): PageGuide => ({ route, tasks: [], related: [], glossary: [] });

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
   setting: page('ops-setting'),
   customer: page('ops-customer'),
   supplier: page('ops-supplier'),
   product: page('ops-product'),
   project: page('ops-project'),
   document: page('ops-document'),
   media: page('ops-media'),
   purchase_order: page('ops-purchase-order'),
   shipment: page('ops-shipment'),
   market_matrix: page('ops-market'),
   incident: page('ops-incident'),
   change_request: page('ops-change-request')
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
