// HTTP attack suite helpers (Task 20, R12): real requests against the local PostgREST, GoTrue and
// Storage. The keys come from `supabase status -o env` through the environment (API_URL, ANON_KEY,
// SERVICE_ROLE_KEY, JWT_SECRET) and are never printed. Local stack only.
import { create, getNumericDate } from 'jsr:@zaubrik/djwt@3';

const env = (name: string): string => {
   const value = Deno.env.get(name);
   if (!value) throw new Error(`${name} is not set: eval "$(supabase status -o env | sed 's/^/export /')"`);
   return value;
};

export const API_URL = env('API_URL').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) {
   throw new Error('the HTTP suite runs against the local stack only (API_URL must be http://127.0.0.1 or http://localhost)');
}
export const ANON_KEY = env('ANON_KEY');
const SERVICE_ROLE_KEY = env('SERVICE_ROLE_KEY');
export const JWT_SECRET = env('JWT_SECRET');

export const DEMO_PASSWORD = 'Demo1234!';
export const RESTRICTED_EMAIL = 'http-restricted@moesa-panel.test';
export const MIXED_EMAIL = 'http-mixed@moesa-panel.test';

export type Profile = 'api' | 'public' | (string & {});
export type RestInit = {
   method?: string;
   body?: unknown;
   headers?: Record<string, string>;
   profile?: Profile;
};
export type RestResult = { status: number; body: any; headers: Headers };

/** Signs in with the demo password and returns the access token. */
export async function signIn(email: string): Promise<string> {
   const r = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
   });
   const body = await r.json();
   if (!r.ok || !body.access_token) throw new Error(`sign-in failed for ${email}: ${r.status} ${body.error_code ?? body.msg ?? ''}`);
   return body.access_token;
}

/** HS256 JWT, for forged-claim attacks. */
export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
   const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
   ]);
   return await create({ alg: 'HS256', typ: 'JWT' }, { exp: getNumericDate(60), ...payload }, key);
}

const readBody = async (r: Response): Promise<unknown> => {
   const text = await r.text();
   if (!text) return null;
   try {
      return JSON.parse(text);
   } catch {
      return text;
   }
};

/** A PostgREST request as the bearer of `token`; Accept-Profile (and Content-Profile on writes) from `profile`. */
export async function rest(token: string, path: string, init: RestInit = {}): Promise<RestResult> {
   const method = init.method ?? 'GET';
   const profile = init.profile ?? 'api';
   const headers: Record<string, string> = {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Accept-Profile': profile,
      ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Profile': profile, 'Content-Type': 'application/json' } : {}),
      ...init.headers,
   };
   const r = await fetch(`${API_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
   });
   return { status: r.status, body: await readBody(r), headers: r.headers };
}

/** The same with the service key; throws on an HTTP error unless `allowError`. */
export async function admin(path: string, init: RestInit & { allowError?: boolean } = {}): Promise<RestResult> {
   const r = await rest(SERVICE_ROLE_KEY, path, { profile: 'public', ...init, headers: { apikey: SERVICE_ROLE_KEY, ...init.headers } });
   if (!init.allowError && r.status >= 400) {
      throw new Error(`admin ${init.method ?? 'GET'} ${path.split('?')[0]}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
   }
   return r;
}

/** GoTrue admin API. */
async function authAdmin(path: string, method: string, body?: unknown): Promise<RestResult> {
   const r = await fetch(`${API_URL}/auth/v1/admin/${path}`, {
      method,
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
   });
   return { status: r.status, body: await readBody(r), headers: r.headers };
}

/** Storage with the service key (upload / remove). */
async function storageAdmin(path: string, init: RequestInit): Promise<Response> {
   return await fetch(`${API_URL}/storage/v1/${path}`, {
      ...init,
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...(init.headers ?? {}) },
   });
}

export type Fixture = {
   restricted: string;
   mixed: string;
   portal: string;
   koordinator: string;
   secretId: string;
   euId: string;
   thoId: string;
   moesa: string;
   europe: string;
   nova: string;
   poId: string;
   lineId: string;
   restrictedUserId: string;
   koordinatorUserId: string;
   piObject: string;
};

const HTTP_SKUS = '(HTTP-SECRET,HTTP-EU,HTTP-NEW)';
const HTTP_ROLES = '(http_restricted,http_no_cost)';
const HTTP_PI = 'HTTP-PI';
const HTTP_EU_CUSTOMER = 'HEU';

const one = <T>(r: RestResult, what: string): T => {
   if (!Array.isArray(r.body) || r.body.length !== 1) throw new Error(`expected one ${what}, got ${JSON.stringify(r.body).slice(0, 200)}`);
   return r.body[0] as T;
};

/** Removes everything adminSetup creates, by name; safe to run when nothing is there. */
async function cleanup(): Promise<void> {
   const docs = await admin(`document?notes=eq.${HTTP_PI}&select=id,media_id`);
   for (const d of docs.body as { id: string; media_id: string | null }[]) {
      await admin(`document?id=eq.${d.id}`, { method: 'DELETE' });
      if (d.media_id) {
         const m = await admin(`media?id=eq.${d.media_id}&select=storage_path`);
         for (const { storage_path } of m.body as { storage_path: string }[]) {
            const res = await storageAdmin('object/media', {
               method: 'DELETE',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ prefixes: [storage_path] }),
            });
            await res.body?.cancel();
         }
         await admin(`media?id=eq.${d.media_id}`, { method: 'DELETE' });
      }
   }
   await admin(`purchase_order?pi_number=eq.${HTTP_PI}`, { method: 'DELETE' });
   await admin(`product?sku=in.${HTTP_SKUS}`, { method: 'DELETE' });
   await admin(`customer?code=eq.${HTTP_EU_CUSTOMER}`, { method: 'DELETE' });
   const users = await admin(`user?email=in.(${RESTRICTED_EMAIL},${MIXED_EMAIL})&select=id`);
   for (const { id } of users.body as { id: string }[]) {
      await admin(`user_role?user_id=eq.${id}`, { method: 'DELETE' });
      await admin(`tenant_user?user_id=eq.${id}`, { method: 'DELETE' });
      const r = await authAdmin(`users/${id}`, 'DELETE');
      if (r.status >= 400 && r.status !== 404) throw new Error(`deleting user ${id}: ${r.status}`);
   }
   const roles = await admin(`role?display_name=in.${HTTP_ROLES}&select=id`);
   for (const { id } of roles.body as { id: string }[]) {
      await admin(`role_field_permission?role_id=eq.${id}`, { method: 'DELETE' });
      await admin(`role_permission?role_id=eq.${id}`, { method: 'DELETE' });
      await admin(`role?id=eq.${id}`, { method: 'DELETE' });
   }
}

async function createUser(email: string): Promise<string> {
   const r = await authAdmin('users', 'POST', { email, password: DEMO_PASSWORD, email_confirm: true });
   if (r.status >= 400) throw new Error(`creating ${email}: ${r.status}`);
   return r.body.id;
}

/**
 * The HTTP fixtures, through the service key and the GoTrue admin API:
 * - http-restricted: MOESA LTD, role http_restricted (product and customer select/insert/update,
 *   purchase_order with delete, audit_log select, user select/update; no field rows: every
 *   sensitive field denied);
 * - http-mixed: management in MOESA LTD, http_no_cost in MOESA Europe (management's permissions and
 *   field rights without the cost group);
 * - products HTTP-SECRET (MOESA LTD, cost and note set, a supplier) and HTTP-EU (Europe);
 * - an HTTP purchase order (draft) with a line priced 12.5 (written by the mixed user, who holds
 *   the cost rights in MOESA LTD), and a PI document on it with a file in Storage (the 060 row rule).
 */
export async function adminSetup(): Promise<Fixture> {
   await cleanup();

   const tenants = (await admin('tenant?select=id,display_name&display_name=in.("MOESA LTD","MOESA Europe","Nova Yazılım")'))
      .body as { id: string; display_name: string }[];
   const tenant = (name: string) => {
      const t = tenants.find((x) => x.display_name === name);
      if (!t) throw new Error(`tenant ${name} missing (run supabase db reset)`);
      return t.id;
   };
   const moesa = tenant('MOESA LTD');
   const europe = tenant('MOESA Europe');
   const nova = tenant('Nova Yazılım');
   const inMoesa = { 'x-tenant-id': moesa };
   const inEurope = { 'x-tenant-id': europe };
   const rep = { Prefer: 'return=representation' };

   const thoId = one<{ id: string }>(await admin(`customer?tenant_id=eq.${moesa}&code=eq.THO&select=id`), 'THO').id;
   const supplierId = one<{ id: string }>(
      await admin(`supplier?tenant_id=eq.${moesa}&select=id&order=code&limit=1`),
      'MOESA supplier',
   ).id;
   const koordinatorUserId = one<{ id: string }>(await admin('user?email=eq.koordinator@moesa-panel.test&select=id'), 'koordinator').id;

   // Users.
   const restrictedUserId = await createUser(RESTRICTED_EMAIL);
   const mixedUserId = await createUser(MIXED_EMAIL);

   // Roles.
   const restrictedRole = one<{ id: string }>(
      await admin('role', { method: 'POST', body: { tenant_id: moesa, display_name: 'http_restricted' }, headers: rep }),
      'role',
   ).id;
   const noCostRole = one<{ id: string }>(
      await admin('role', { method: 'POST', body: { tenant_id: europe, display_name: 'http_no_cost' }, headers: rep }),
      'role',
   ).id;

   const permissions = (await admin('permission?select=id,group_name,command')).body as {
      id: string;
      group_name: string;
      command: string;
   }[];
   const restrictedPermissions = permissions.filter(
      (p) =>
         (['product', 'customer'].includes(p.group_name) && ['select', 'insert', 'update'].includes(p.command)) ||
         p.group_name === 'purchase_order' ||
         (p.group_name === 'audit_log' && p.command === 'select') ||
         (p.group_name === 'user' && ['select', 'update'].includes(p.command)),
   );
   await admin('role_permission', {
      method: 'POST',
      body: restrictedPermissions.map((p) => ({ role_id: restrictedRole, permission_id: p.id })),
   });

   const europeManagement = one<{ id: string }>(
      await admin(`role?tenant_id=eq.${europe}&display_name=eq.management&select=id`),
      'Europe management',
   ).id;
   const managementPermissions = (await admin(`role_permission?role_id=eq.${europeManagement}&select=permission_id`)).body as {
      permission_id: string;
   }[];
   await admin('role_permission', {
      method: 'POST',
      body: managementPermissions.map((p) => ({ role_id: noCostRole, permission_id: p.permission_id })),
   });
   const costFields = new Set(
      ((await admin('field_class?group_name=eq.cost&select=resource_name,field')).body as { resource_name: string; field: string }[]).map(
         (f) => `${f.resource_name}.${f.field}`,
      ),
   );
   const managementFields = (await admin(
      `role_field_permission?role_id=eq.${europeManagement}&select=resource_name,field,can_read,can_write`,
   )).body as { resource_name: string; field: string; can_read: boolean; can_write: boolean }[];
   const noCostFields = managementFields.filter((f) => !costFields.has(`${f.resource_name}.${f.field}`));
   if (noCostFields.length === managementFields.length) throw new Error('management holds no cost field rows to drop');
   await admin('role_field_permission', { method: 'POST', body: noCostFields.map((f) => ({ ...f, role_id: noCostRole })) });

   // Memberships.
   const moesaManagement = one<{ id: string }>(
      await admin(`role?tenant_id=eq.${moesa}&display_name=eq.management&select=id`),
      'MOESA management',
   ).id;
   await admin('tenant_user', {
      method: 'POST',
      body: [
         { tenant_id: moesa, user_id: restrictedUserId },
         { tenant_id: moesa, user_id: mixedUserId },
         { tenant_id: europe, user_id: mixedUserId },
      ],
   });
   await admin('user_role', {
      method: 'POST',
      body: [
         { user_id: restrictedUserId, role_id: restrictedRole },
         { user_id: mixedUserId, role_id: moesaManagement },
         { user_id: mixedUserId, role_id: noCostRole },
      ],
   });

   // Products.
   const secretId = one<{ id: string }>(
      await admin('product', {
         method: 'POST',
         headers: { ...inMoesa, ...rep },
         body: {
            tenant_id: moesa,
            customer_id: thoId,
            sku: 'HTTP-SECRET',
            display_name: 'HTTP secret',
            supplier_id: supplierId,
            purchase_price: 12.5,
            purchase_currency: 'USD',
            notes: 'secret note',
         },
      }),
      'product',
   ).id;
   const euCustomer = one<{ id: string }>(
      await admin('customer', {
         method: 'POST',
         headers: { ...inEurope, ...rep },
         body: { tenant_id: europe, code: HTTP_EU_CUSTOMER, display_name: 'HTTP EU customer', commercial_model: 'trading_partner' },
      }),
      'customer',
   ).id;
   const euId = one<{ id: string }>(
      await admin('product', {
         method: 'POST',
         headers: { ...inEurope, ...rep },
         body: { tenant_id: europe, customer_id: euCustomer, sku: 'HTTP-EU', display_name: 'HTTP EU', purchase_price: 77.7 },
      }),
      'product',
   ).id;

   // A PI file (060): purchase order, Storage object, media row and the pi document.
   // The PO code is numbered in the request's tenant, which the service role has none of: the mixed
   // user (management in MOESA LTD) creates it through api.
   const mixed = await signIn(MIXED_EMAIL);
   const po = await rest(mixed, 'purchase_order', {
      method: 'POST',
      headers: { ...inMoesa, ...rep },
      body: {
         tenant_id: moesa,
         customer_id: thoId,
         supplier_id: supplierId,
         currency: 'USD',
         incoterm: 'FOB',
         deposit_rate: 0.3,
         pi_number: HTTP_PI,
      },
   });
   if (po.status !== 201) throw new Error(`creating the HTTP purchase order: ${po.status} ${JSON.stringify(po.body).slice(0, 200)}`);
   const poId = one<{ id: string }>(po, 'purchase order').id;
   const line = await rest(mixed, 'purchase_order_line', {
      method: 'POST',
      headers: { ...inMoesa, ...rep },
      body: { tenant_id: moesa, purchase_order_id: poId, product_id: secretId, quantity: 10, unit_price: 12.5 },
   });
   if (line.status !== 201) throw new Error(`creating the HTTP order line: ${line.status} ${JSON.stringify(line.body).slice(0, 200)}`);
   const lineId = one<{ id: string }>(line, 'order line').id;
   const mediaId = crypto.randomUUID();
   const piObject = `${moesa}/${mediaId}/pi.pdf`;
   const upload = await storageAdmin(`object/media/${piObject}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: new TextEncoder().encode('%PDF-1.4\n% HTTP-PI\n'),
   });
   if (!upload.ok) throw new Error(`uploading the PI file: ${upload.status} ${await upload.text()}`);
   await upload.body?.cancel();
   await admin('media', {
      method: 'POST',
      headers: inMoesa,
      body: {
         id: mediaId,
         tenant_id: moesa,
         customer_id: thoId,
         storage_path: piObject,
         file_name: 'pi.pdf',
         mime_type: 'application/pdf',
         size_bytes: 19,
      },
   });
   await admin('document', {
      method: 'POST',
      headers: inMoesa,
      body: {
         tenant_id: moesa,
         customer_id: thoId,
         entity_type: 'purchase_order',
         entity_id: poId,
         type: 'pi',
         media_id: mediaId,
         notes: HTTP_PI,
      },
   });

   const [restricted, portal, koordinator] = await Promise.all([
      signIn(RESTRICTED_EMAIL),
      signIn('portal@moesa-panel.test'),
      signIn('koordinator@moesa-panel.test'),
   ]);

   return {
      restricted,
      mixed,
      portal,
      koordinator,
      secretId,
      euId,
      thoId,
      moesa,
      europe,
      nova,
      poId,
      lineId,
      restrictedUserId,
      koordinatorUserId,
      piObject,
   };
}

export async function adminTeardown(_f: Fixture | undefined): Promise<void> {
   await cleanup();
}

/**
 * Every `.from(...).select(...)` the app sends, as [api view, select] (Task 20). Static on purpose:
 * the suite asserts that each one still resolves through the masked api views for a restricted user.
 *
 * To regenerate after the app changes, from app/src:
 *   grep -rn "\.from(\|from=\"\|:from=\|useLookup\|defineResource\|select:\|select=\|_SELECT\s*=" --include=*.ts --include=*.vue . | grep -v test
 * and copy each table/view with its select string (constants such as PURCHASE_ORDER_SELECT,
 * CHANGE_REQUEST_SELECT and DOCUMENT_MEDIA_SELECT expanded; defineResource without a select is '*';
 * ResourceTable adds BRANCH_EMBED when sorting by branch). RPCs (.rpc) are not listed: they stay in public.
 */
export const APP_SELECTS: [string, string][] = [
   // admin
   ['plan', '*, plan_module(module_id), plan_limit(limit_key, value)'],
   ['plan', 'id,display_name,description,is_active,position,plan_module(module_id)'],
   ['module', 'id,is_core,position'],
   ['company_subscription', '*'],
   ['subscription', '*, status, plan(display_name)'],
   // amazon
   ['amazon_product_type_definition', '*'],
   ['market_cell', 'id, country, listing_language, price, currency'],
   ['customer_platform_account', 'id, customer_id, platform_id, api_connection, authorized_at, seller_id'],
   ['listing_submission', '*'],
   ['market_cell', 'id'],
   // audit
   ['audit_transaction', '*, actor(*, display_name), reverter(*, display_name)'],
   ['audit_log', '*'],
   // branch, user, role
   ['tenant', 'id'],
   [
      'tenant',
      'id, parent_id, logo_path, created_at, display_name, email, phone, website, legal_name, tax_office, tax_number, country, city, district, address',
   ],
   ['tenant', '*, branch:tenant(display_name)'],
   ['tenant_member', '*'],
   ['tenant_member', 'id, email, user_metadata'],
   ['user', '*, user_role(role(*)), tenant_owner(tenant_id), owned_via, tenant_id:managed_in'],
   ['role', '*'],
   [
      'role',
      '*, role_permission(permission(id, kind, group_name)), role_field_permission(resource_name, field, can_read, can_write)',
   ],
   ['permission', 'id,resource_name,group_name,kind'],
   ['field_group', 'id,position'],
   // customer
   ['customer', '*'],
   ['customer', 'id, code, display_name, status'],
   ['customer', 'id, code, display_name'],
   ['customer_contact', '*'],
   ['customer_warehouse', '*'],
   ['customer_warehouse', 'id, display_name, city, is_default, dock_hours, appointment_rule'],
   ['customer_platform_account', '*'],
   ['customer_brand', '*'],
   ['platform', 'id, display_name, countries'],
   // supplier
   ['supplier', '*'],
   ['supplier', 'id, code, display_name, default_incoterm, deposit_rate'],
   ['supplier_contact', '*'],
   // product
   ['product', '*, customer(code), supplier(code)'],
   ['product', '*, customer(code, display_name), supplier(code, display_name)'],
   ['product', 'id'],
   ['product', 'id, sku, display_name'],
   ['product', 'id, sku, display_name, status'],
   ['product', 'id, sku, display_name, status, purchase_price, purchase_currency'],
   ['product_with_evidence', '*, customer(code, display_name), supplier(code)'],
   ['product_with_evidence', '*, branch:tenant(display_name)'],
   // project
   ['project', '*, customer(code, display_name), project_gate(*), project_product(product(id, sku, display_name))'],
   ['project', '*, customer(code, display_name), project_gate(id, code, position, status)'],
   ['project', 'id, code, display_name'],
   ['project_task', '*'],
   ['project_product', '*'],
   ['project_gate', 'code, status, needs_customer_approval'],
   // purchase order
   [
      'purchase_order',
      [
         '*',
         'customer!purchase_order_customer_fkey(code, display_name)',
         'supplier(code, display_name, default_incoterm, deposit_rate)',
         'project!purchase_order_project_fkey(code, display_name)',
         'purchase_order_line!purchase_order_line_po_fkey(*, product!purchase_order_line_product_fkey(id, sku, display_name, status, purchase_price, purchase_currency), spec_document:document!purchase_order_line_spec_fkey(id, version, status))',
         'purchase_order_payment!purchase_order_payment_po_fkey(*)',
      ].join(', '),
   ],
   ['purchase_order', 'id'],
   ['purchase_order', '*'],
   ['purchase_order_line', '*'],
   ['purchase_order_payment', '*'],
   ['purchase_order_update', '*'],
   ['purchase_order_overview', '*'],
   ['purchase_order_overview', 'id'],
   ['purchase_order_overview', 'id, code, status, customer_id'],
   // shipment
   [
      'shipment',
      [
         '*',
         'customer!shipment_customer_fkey(code, display_name)',
         'customer_warehouse!shipment_warehouse_fkey(display_name, city, dock_hours, appointment_rule)',
         'shipment_purchase_order!shipment_purchase_order_shipment_fkey(purchase_order!shipment_purchase_order_po_fkey(id, code, status, tolerance_pct, purchase_order_line!purchase_order_line_po_fkey(id, quantity, product!purchase_order_line_product_fkey(sku, display_name, is_hazmat))))',
         'shipment_line!shipment_line_shipment_fkey(*)',
      ].join(', '),
   ],
   ['shipment_line', '*'],
   ['shipment_line', 'quantity, shipment_id, shipment!shipment_line_shipment_fkey(status)'],
   ['shipment_event', '*'],
   ['shipment_purchase_order', '*'],
   ['shipment_purchase_order', 'shipment_id'],
   ['shipment_overview', '*'],
   ['shipment_overview', 'id'],
   // change request
   [
      'change_request',
      '*, customer!change_request_customer_fkey(code, display_name), project!change_request_project_fkey(code, display_name, project_gate!project_gate_project_fkey(code, status, needs_customer_approval)), change_request_product!change_request_product_cr_fkey(product_id, product!change_request_product_product_fkey(sku, display_name)), affected_document:document!change_request_affected_document_fkey(id, entity_type, entity_id, type, version, status), result_document:document!change_request_result_document_fkey(id, type, version, status)',
   ],
   ['change_request', '*, customer!change_request_customer_fkey(code), project!change_request_project_fkey(code)'],
   ['change_request_product', '*'],
   // incident
   [
      'incident',
      '*, customer!incident_customer_fkey(code, display_name), incident_log!incident_log_incident_fkey(*), incident_deadline!incident_deadline_incident_fkey(*), project_gate!project_gate_rollback_incident_fkey(id, code, status, project_id)',
   ],
   ['incident', 'id, code, title'],
   ['incident_log', '*'],
   ['incident_deadline', '*'],
   ['incident_overview', '*'],
   ['project', 'id, code'],
   ['market_cell_overview', 'id, sku, cell_key'],
   // market matrix
   [
      'market_cell',
      '*, product!market_cell_product_fkey(sku, display_name), project!market_cell_project_fkey(code, display_name), platform!market_cell_platform_fkey(display_name, countries, product_id_label)',
   ],
   ['market_cell_overview', '*'],
   // documents and media
   ['document', '*, media!document_media_fkey(id, storage_path, file_name)'],
   ['document', '*, customer!document_customer_fkey(code), media!document_media_fkey(id, storage_path, file_name)'],
   ['document', 'id, type, version, status'],
   ['document', 'id, version, status'],
   ['document', 'id, entity_id, type, version, file_name'],
   ['document', 'id, type, version, file_name'],
   ['document', 'id, entity_type, type, status, version'],
   ['media', '*'],
   ['media_link', '*, media(*)'],
   ['media_link', 'position'],
   ['media_link', '*'],
   ['media_library', '*'],
   ['media_library', 'link_count, document_count'],
   // settings, transfer, dashboard
   ['setting', 'id, key, value, description'],
   ['transfer', '*'],
   ['dashboard_notification_feed', '*'],
   ['dashboard_shipment', '*'],
   ['dashboard_market', '*'],
   ['dashboard_incident', '*'],
   ['dashboard_change_request', '*'],
   ['dashboard_gate_pending', '*'],
   ['dashboard_product_evidence', '*'],
   ['dashboard_purchase_order', '*'],
   ['dashboard_task_due', '*'],
];
