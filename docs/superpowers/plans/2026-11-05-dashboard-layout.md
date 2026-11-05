# Configurable Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard into a personal, per-browser layout of the 14 operations boxes and the notification feed, each box in one "dense list" card shell, reorderable, hideable and sized narrow or wide in an edit mode.

**Architecture:** A registry (`DASHBOARD_BOXES`) describes each box; each box is a small component that owns its query and renders the shared `DashboardBox` shell, so a hidden box never mounts and never fetches. A pinia store (`useDashboardLayout`) holds the saved layout and an edit draft, reads and validates `localStorage` per user, and filters by permission at read time. `Index.vue` renders the visible boxes in a CSS grid wrapped by `vuedraggable`, with the edit toolbar teleported into the page header.

**Tech Stack:** Vue 3.5, PrimeVue 4, Tailwind 3, TanStack Query 5, Pinia 2, vue-i18n 10, @casl/vue, @vueuse/core, vuedraggable 4.1.0 (new), vitest + @vue/test-utils + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`, section "M6 Dashboard ve haftalık ritim", paragraph "Yapılandırılabilir dashboard (eklendi 05.11.2026, onaylandı)" and its "Geliştirici kararları" line; K7 for language.

## Global Constraints

- Box inventory: today's 14 operations boxes + the notification feed; default order = today's order; every box defaults to `narrow`.
- Row cap: narrow 4, wide 8 (the "Geliştirici kararları" line overrides the earlier "dar 3, geniş 6"); the badge is always the full count.
- Grid: 3 columns at `xl`, 2 at `md`, 1 below; wide = 2 columns (`md:col-span-2`), which is the full row on tablet and 1 column on phones. Row flow, no `grid-flow-dense`, no free grid, no box height.
- "Tümünü aç" only on a box whose registry entry has `to`; no new list route. Customer-filter boxes keep the row's `onSelect` (sets the global customer filter before navigating).
- "Bu kartı nasıl kapatırım?" is the existing `guideTask` link, optional per box.
- Storage: `localStorage` key `dashboard.layout.<userId>`, one object `{ order: id[], sizes: { id: 'narrow' | 'wide' }, hidden: id[] }`; `sizes` holds only boxes that differ from the default. Written on Save only; last writer wins across tabs. Not in the database. No role-based defaults.
- Read validation: unknown ids dropped, an id in `hidden` is removed from `order`, a box without permission is skipped (neither shown nor offered in "Gizli kutular"), new registry ids are appended visible; corrupt, missing or blocked storage falls back to the default layout.
- Edit mode: none below `md` (768 px). Discard returns to the last saved layout; Reset to default = registry order and sizes, all visible (persisted only on Save).
- Removed: the branches, users and roles statistics cards. CASL gating unchanged (`read` on the box's subject).
- Language (K7): UI in TR and EN by hand, `en` is the source locale; every other locale is filled by `pnpm i18n-sync` (run from `app/`). Field and enum names stay English snake_case. TR copy below is marked [owner to confirm].
- `vuedraggable` pinned exactly: `"vuedraggable": "4.1.0"` in `app/package.json` dependencies (precedent: `chart.js` is pinned exactly).
- All commands run from `app/`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A layout saved by an earlier version or edited by hand** (an id no longer in the registry, duplicates, an id in both `order` and `hidden`, `sizes: { x: 'huge' }`, `order` not an array, an array or `null` at the top level): the dashboard opens on a clean layout, never throws. Pinned in Task 4 (`normalizeLayout` cases).
2. **A box the user lost permission to, or abilities not loaded yet on first render**: the box is neither shown nor in "Gizli kutular", and saving in that state must not erase its place, so it comes back where it was once the permission returns. Pinned in Task 4 (`reorder`/`move` keep permission-less slots, `visibleBoxes`) and Task 6 (strip excludes it).
3. **Blocked storage** (private mode, `getItem`/`setItem` throw): default layout on read; Save still applies the layout for this visit and shows one warning toast instead of failing silently or throwing. Pinned in Task 4 (`save()` returns `false`) and Task 6 (toast).
4. **Two tabs, or two accounts in one browser**: Save writes the whole object (no merge with what the other tab stored); signing in as another user in the same tab loads that user's key and drops any draft. Pinned in Task 4 (`load('u2')` after a `u1` save) and Task 5 (the user-id watch).
5. **Wide on tablet and leaving edit mode mid-way**: a wide box takes the full row at `md` and two of three columns at `xl`; shrinking the window below `md` or navigating away while editing discards the draft, so a half-made layout never reappears as if saved. Pinned in Task 5 (span class) and Task 6 (media query and unmount discard).

---

## File Structure

- Create `app/src/constants/dashboard.ts` — box ids, types, area palette, row limits, storage key, the registry `DASHBOARD_BOXES`, `boxById`.
- Create `app/src/components/service-components/dashboard/DashboardBox.vue` — the card shell (header, badge, rows or slot, footer links). Replaces `CountListCard.vue` (deleted in Task 3).
- Create `app/src/views/pages/dashboard/boxes/` — one component per box family, each owning its query: `GatesBox.vue`, `TasksBox.vue`, `EvidenceBox.vue`, `PurchaseOrdersBox.vue`, `ShipmentsBox.vue`, `IncidentsBox.vue`, `ChangeRequestsBox.vue`, `MarketBox.vue`, `NotificationsBox.vue`, plus `rows.ts` (the row builders moved out of `Index.vue`).
- Create `app/src/store/dashboardLayout/index.ts` — layout store and its pure helpers.
- Create `app/src/views/pages/dashboard/DashboardBoxEditBar.vue` and `DashboardHiddenStrip.vue` — edit-mode controls.
- Modify `app/src/views/pages/dashboard/Index.vue` — becomes the grid, the store wiring and the toolbar.
- Modify `app/src/plugins/i18n/locales/en/index.json`, `tr/index.json` (by hand), the rest via `pnpm i18n-sync`.
- Modify `app/package.json`, `app/pnpm-lock.yaml` — `vuedraggable`.
- Tests: `app/tests/components/DashboardBox.test.ts` (replaces `CountListCard.test.ts`), `app/tests/views/dashboardBoxes.test.ts`, `app/tests/constants/dashboard.test.ts`, `app/tests/store/dashboardLayout.test.ts`, `app/tests/views/dashboard.test.ts`; `app/tests/api/dashboard.test.ts` loses its `CountListCard` block.

## Copy (EN source / TR [owner to confirm])

All new keys live under `dashboard.layout`. Used by the task named in the last column.

| key | en | tr [owner to confirm] | task |
|---|---|---|---|
| `open_all` | Open all | Tümünü aç | 1 |
| `all_hidden` | All boxes are hidden. Use Edit to show them again. | Tüm kutular gizli. Yeniden göstermek için Düzenle'yi kullanın. | 5 |
| `no_boxes` | Your role has no dashboard box. | Rolünüzün görebileceği bir dashboard kutusu yok. | 5 |
| `edit` | Edit | Düzenle | 6 |
| `save` | Save | Kaydet | 6 |
| `discard` | Discard | Vazgeç | 6 |
| `reset` | Reset to default | Varsayılana dön | 6 |
| `hidden_title` | Hidden boxes | Gizli kutular | 6 |
| `hidden_hint` | Click a box to add it at the end. | Sona eklemek için bir kutuya tıklayın. | 6 |
| `hidden_empty` | No hidden boxes | Gizli kutu yok | 6 |
| `size_narrow` | Narrow | Dar | 6 |
| `size_wide` | Wide | Geniş | 6 |
| `hide` | Hide | Gizle | 6 |
| `drag` | Drag to reorder | Sıralamak için sürükleyin | 6 |
| `menu` | Box options | Kutu seçenekleri | 6 |
| `move_left` | Move left | Sola taşı | 6 |
| `move_right` | Move right | Sağa taşı | 6 |
| `not_persisted` | Saved for this visit only: this browser does not allow saving. | Yalnızca bu ziyaret için kaydedildi: tarayıcı kaydetmeye izin vermiyor. | 6 |

Removed in Task 3: `dashboard.statistics.branches`, `dashboard.statistics.users`, `dashboard.statistics.roles` (only the removed cards used them; `TotalRowCountCard` keeps the other `dashboard.statistics.*` keys). Empty box text stays `dashboard.ops.none` ("None" / "Yok").

---

### Task 1: Dashboard types and the `DashboardBox` shell

**Files:**
- Create: `app/src/constants/dashboard.ts`
- Create: `app/src/components/service-components/dashboard/DashboardBox.vue`
- Modify: `app/src/plugins/i18n/locales/en/index.json`, `app/src/plugins/i18n/locales/tr/index.json` (+ `pnpm i18n-sync`)
- Test: `app/tests/components/DashboardBox.test.ts`

**Interfaces:**
- Produces (in `@/constants/dashboard`):
  - `DASHBOARD_BOX_IDS` = `['gates_team','gates_management','gates_customer','tasks_overdue','tasks_due_soon','unsigned_skus','incomplete_compliance','po_action','po_production','shipments_in_transit','shipments_late','incidents_open','change_requests_open','market_summary','notifications'] as const` (today's order)
  - `type DashboardBoxId = (typeof DASHBOARD_BOX_IDS)[number]`
  - `type BoxSize = 'narrow' | 'wide'`; `BOX_SIZES: readonly BoxSize[] = ['narrow','wide']`
  - `type DashboardArea = 'projects' | 'supply' | 'logistics' | 'incidents' | 'change_requests' | 'market' | 'notifications'`
  - `DASHBOARD_AREA_CLASSES: Record<DashboardArea, { icon: string; badge: string }>` (full Tailwind class strings, see Step 3)
  - `ROW_LIMIT: Record<BoxSize, number> = { narrow: 4, wide: 8 }`
  - `layoutStorageKey(userId: string): string` → `` `dashboard.layout.${userId}` ``
  - `type DashboardBoxDef = { id: DashboardBoxId; title: string /* i18n key */; icon: string; area: DashboardArea; size: BoxSize; permission: string /* CASL subject, action 'read' */; to?: RouteLocationRaw; guideTask?: string; component: Component }`
  - `type DashboardRow = { code: string; context?: string; tag?: string; urgent?: boolean; to: RouteLocationRaw; onSelect?: () => void }`
- Produces: `DashboardBox.vue` props `{ box: DashboardBoxDef; size: BoxSize; count: number; rows?: DashboardRow[]; empty?: boolean }` (`empty` defaults to `count === 0`); default slot `{ limit: number }` replaces the row list when given.

- [ ] **Step 1: Write the failing tests** in `app/tests/components/DashboardBox.test.ts`

Mount with `i18NPlugin`, `PrimeVue`, a fresh pinia, and the `CustomLink` stub from today's `CountListCard.test.ts` (records `to` as a `data-to` attribute via `JSON.stringify` and calls a spy `navigate`). A `box(overrides)` helper builds a `DashboardBoxDef` with `id: 'tasks_overdue'`, `title: 'dashboard.ops.tasks_overdue'`, `area: 'projects'`, `size: 'narrow'`, `permission: 'project_task'`, `component: {}`.

```ts
it('caps rows at four when narrow and eight when wide, the badge keeps the full count', () => {
   const rows = Array.from({ length: 10 }, (_, i) => ({ code: `P${i}`, to: { name: 'dashboard' } }));
   expect(mountBox({ size: 'narrow', count: 10, rows }).findAll('li')).toHaveLength(4);
   const wide = mountBox({ size: 'wide', count: 10, rows });
   expect(wide.findAll('li')).toHaveLength(8);
   expect(wide.get('[data-test="box-badge"]').text()).toBe('10');
});
it('shows the code bold, the context grey and the tag', () => {
   const li = mountBox({ count: 1, rows: [{ code: 'PRJ-1', context: 'G2 · THO', tag: '3 days late', urgent: true, to: { name: 'dashboard' } }] }).get('li');
   expect(li.get('.font-semibold').text()).toBe('PRJ-1');
   expect(li.get('.text-muted-color').text()).toBe('G2 · THO');
   expect(li.text()).toContain('3 days late');
});
it('says None when empty, and lists rows at zero count when empty is false', () => { /* count 0 → text has dashboard.ops.none, no li; empty:false + 2 rows → 2 li */ });
it('colours the icon and the badge by area', () => { /* box area 'logistics' → header icon element has every class of DASHBOARD_AREA_CLASSES.logistics.icon, badge has .badge */ });
it('shows "Open all" only when the box has a route', () => {
   expect(openAll(mountBox({ count: 1, box: box({ to: { name: 'ops-project-list' } }) }))?.attributes('data-to')).toContain('ops-project-list');
   expect(openAll(mountBox({ count: 1 }))).toBeUndefined();
});
it('links to the guide task when the box has one', async () => { /* guideTask 'close_tasks' → click guide.panel.close_card button → useGuideStore().show called with ('dashboard','close_tasks'); none without guideTask */ });
it("runs the row's onSelect before navigating", async () => { /* calls === ['select','navigate'] */ });
it('renders the slot with the size limit instead of rows', () => { /* slot `<template #default="{ limit }"><p>{{ limit }}</p></template>`, size 'wide' → p text '8', no li */ });
```

`openAll(wrapper)` finds the button whose text is `i18n.t('dashboard.layout.open_all')`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/DashboardBox.test.ts`
Expected: FAIL, cannot resolve `@/components/service-components/dashboard/DashboardBox.vue`.

- [ ] **Step 3: Implement `app/src/constants/dashboard.ts` (types and constants above, no registry yet) and `DashboardBox.vue`**

Area palette (developer palette, owner reviews; full strings so Tailwind's content scan finds them):

| area | icon | badge |
|---|---|---|
| projects | `bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300` | `bg-blue-600 text-white` |
| supply | `bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300` | `bg-amber-600 text-white` |
| logistics | `bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300` | `bg-cyan-600 text-white` |
| incidents | `bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300` | `bg-red-600 text-white` |
| change_requests | `bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300` | `bg-violet-600 text-white` |
| market | `bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300` | `bg-emerald-600 text-white` |
| notifications | `bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300` | `bg-slate-600 text-white` |

Shell look: root `div` `rounded-xl shadow-md bg-surface-0 dark:bg-surface-900 p-4 flex flex-col gap-3`; header = icon chip (`w-8 h-8 rounded-lg flex items-center justify-center` + area icon classes, `<i :class="box.icon">`), title `font-semibold` from `$t(box.title)`, badge `ms-auto rounded-full px-2 text-sm font-semibold` + area badge classes with `data-test="box-badge"`; each row `li` is `rounded-lg bg-surface-50 dark:bg-surface-800 px-3 py-2` wrapping today's `CustomLink` + button: code `font-semibold`, context `text-muted-color truncate`, tag a PrimeVue `Tag` (`:severity="row.urgent ? 'danger' : 'secondary'"`, `class="!text-xs ms-auto shrink-0"`); footer `flex items-center justify-between`: the guide button exactly as in `CountListCard.vue` (label `guide.panel.close_card`, opens `useGuideStore().show('dashboard', box.guideTask)` on click), then a `CustomLink :to="box.to"` text Button `dashboard.layout.open_all` with `PrimeIcons.ARROW_RIGHT`, `iconPos="right"`. Rows shown = `rows.slice(0, ROW_LIMIT[size])`.

Add `dashboard.layout.open_all` to `en` and `tr` (Copy table), then `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/DashboardBox.test.ts tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/dashboard.ts src/components/service-components/dashboard/DashboardBox.vue tests/components/DashboardBox.test.ts src/plugins/i18n/locales
git commit -m "feat(dashboard): one dense-list card shell for every box, coloured by area"
```

---

### Task 2: The operations boxes, each owning its query

**Files:**
- Create: `app/src/views/pages/dashboard/boxes/rows.ts`, `GatesBox.vue`, `TasksBox.vue`, `EvidenceBox.vue`, `PurchaseOrdersBox.vue`, `ShipmentsBox.vue`, `IncidentsBox.vue`, `ChangeRequestsBox.vue`, `MarketBox.vue`
- Test: `app/tests/views/dashboardBoxes.test.ts`

**Interfaces:**
- Consumes: `DashboardBox` props, `DashboardRow`, `DashboardBoxDef`, `BoxSize` (Task 1); the hooks and groupers in `@/api/dashboard` (unchanged).
- Produces: every box component has props `{ box: DashboardBoxDef; size: BoxSize }` and renders `<DashboardBox :box :size :count :rows [:empty]>`. The family component picks its group from `box.id`:
  - `GatesBox`: `gates_team | gates_management | gates_customer` → `groupGates(...).team | .management | .customer`
  - `TasksBox`: `tasks_overdue | tasks_due_soon` → `splitTasks(...).overdue | .dueSoon`
  - `EvidenceBox`: `unsigned_skus | incomplete_compliance` → today's `evidenceBox` counts with card `'unsigned_spec' | 'compliance'`
  - `PurchaseOrdersBox`: `po_action | po_production`; `ShipmentsBox`: `shipments_in_transit | shipments_late`
  - `IncidentsBox`, `ChangeRequestsBox`: count = rows length; `MarketBox`: count = `market.live`, `empty = market.items.length === 0`
- Produces in `rows.ts`: `gateRow`, `taskRow`, `actionOrderRow`, `productionOrderRow`, `inTransitShipmentRow`, `lateShipmentRow`, `incidentRow`, `changeRequestRow`, `marketRow(row, setCustomer: (id: string | null) => void)`, `evidenceRows(rows, count, card, setCustomer): { count: number; rows: DashboardRow[] }` — each `(row) => DashboardRow`, moved from `Index.vue` with today's routes, i18n keys and meta text.

Row split (today's `label` becomes `code` + `context`, today's `meta` becomes `tag`):

| builder | code | context | tag | urgent |
|---|---|---|---|---|
| gate | `project_code` | gate name · `customer_code` | waiting days | — |
| task | `project_code` | `display_name` | days left / due today / days late | `days_left < 0` |
| evidence | `customer_code` | — | SKU count | — |
| orders | `code` | `supplier_code` · `customer_code` | status / ready · balance | — |
| shipments | `code` | `customer_code` | ETA / days late | late builder only |
| incident | `code` | `title` · `customer_code` | severity · notice missing or deadline | `management_notice_missing` |
| change request | `code` | `title` · `customer_code` | status · decision date | — |
| market | `customer_code` | — | live · preparing · suppressed | — |

Null codes fall back to `''`; empty context parts are filtered as today.

- [ ] **Step 1: Write the failing tests** in `app/tests/views/dashboardBoxes.test.ts`

Import `../setup/mockMain` first; `vi.mock('@/api/dashboard', importOriginal)` replacing the `useDashboard*` hooks with `vi.fn()` returning `{ data: ref(rows) }`; build each `DashboardBoxDef` in a local `def(id)` helper (the registry arrives in Task 3), then mount each family with a stubbed `DashboardBox` that exposes its props (`props: ['box','size','count','rows','empty']`, template renders `JSON.stringify` of them in `data-props`).

```ts
it('picks the management gates for gates_management and counts them all', () => {
   gates.value = [gate('a', true, false), gate('b', false, false), gate('c', true, true)];
   const p = boxProps(GatesBox, 'gates_management');
   expect(p.count).toBe(groupGates(gates.value).management.length);
   expect(p.rows.map((r) => r.code)).toEqual(groupGates(gates.value).management.map((g) => g.project_code ?? ''));
});
it('marks overdue tasks urgent with their days late', () => { /* tasks_overdue row days_left -3 → tag i18n.t('dashboard.ops.days_overdue',{days:3}), urgent true */ });
it('sets the customer filter before an evidence row opens the product list', () => {
   /* unsigned_skus: rows[0].onSelect() → useCustomerFilter().customerId === row.customer_id; rows[0].to equals evidenceTarget(row,'unsigned_spec').route */
});
it('counts live market cells and is empty without targets', () => { /* market rows with target_count 0 → count = live sum, empty true */ });
it('marks an incident urgent when management was not told', () => { /* management_notice_missing true → urgent true, tag contains dashboard.ops.meta.notice_missing */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboardBoxes.test.ts`
Expected: FAIL, cannot resolve `@/views/pages/dashboard/boxes/GatesBox.vue`.

- [ ] **Step 3: Implement `rows.ts` and the eight box components** as specified in Interfaces. Each component calls its own `useDashboard*` hook (TanStack dedupes the shared query keys, so the three gate boxes still make one request). Do not touch `Index.vue` yet.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboardBoxes.test.ts tests/api/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/pages/dashboard/boxes tests/views/dashboardBoxes.test.ts
git commit -m "feat(dashboard): each operations box is its own component with its own query"
```

---

### Task 3: Notification feed box, the registry, and `Index.vue` from the registry

**Files:**
- Create: `app/src/views/pages/dashboard/boxes/NotificationsBox.vue`
- Modify: `app/src/constants/dashboard.ts` (add registry)
- Modify: `app/src/views/pages/dashboard/Index.vue` (whole file)
- Delete: `app/src/components/service-components/dashboard/CountListCard.vue`, `app/tests/components/CountListCard.test.ts`
- Modify: `app/tests/api/dashboard.test.ts` (drop the `CountListCard` describe block and its imports; Task 1 covers it)
- Modify: locales (remove `dashboard.statistics.branches|users|roles`, then `pnpm i18n-sync`)
- Test: `app/tests/constants/dashboard.test.ts`, `app/tests/views/dashboard.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `DASHBOARD_BOXES: readonly DashboardBoxDef[]` in `DASHBOARD_BOX_IDS` order; `boxById(id: DashboardBoxId): DashboardBoxDef`. Components are `defineAsyncComponent(() => import('@/views/pages/dashboard/boxes/<Family>.vue'))`, so the registry imports no API code.

Registry values (title, icon, area, permission, guideTask copied from today's `Index.vue`; `size: 'narrow'` for all; `to` = list route where one exists):

| id | title | icon | area | permission | guideTask | to |
|---|---|---|---|---|---|---|
| gates_team | dashboard.ops.gates_team | FLAG | projects | project_gate | close_gates | ops-project-list |
| gates_management | dashboard.ops.gates_management | BRIEFCASE | projects | project_gate | close_gates | ops-project-list |
| gates_customer | dashboard.ops.gates_customer | USER | projects | project_gate | close_gates | ops-project-list |
| tasks_overdue | dashboard.ops.tasks_overdue | EXCLAMATION_TRIANGLE | projects | project_task | close_tasks | — |
| tasks_due_soon | dashboard.ops.tasks_due_soon | CLOCK | projects | project_task | close_tasks | — |
| unsigned_skus | dashboard.ops.unsigned_skus | FILE_EDIT | supply | product | sign_spec | `{ name: 'ops-product-list', query: { spec: 'false' } }` |
| incomplete_compliance | dashboard.ops.incomplete_compliance | SHIELD | supply | product | complete_compliance | ops-product-list |
| po_action | dashboard.ops.po_action | SHOPPING_CART | supply | purchase_order | advance_po | ops-purchase-order-list |
| po_production | dashboard.ops.po_production | COG | supply | purchase_order | advance_po | ops-purchase-order-list |
| shipments_in_transit | dashboard.ops.shipments_in_transit | SEND | logistics | shipment | track_shipment | ops-shipment-list |
| shipments_late | dashboard.ops.shipments_late | EXCLAMATION_TRIANGLE | logistics | shipment | track_shipment | ops-shipment-list |
| incidents_open | dashboard.ops.incidents_open | EXCLAMATION_CIRCLE | incidents | incident | close_incident | ops-incident-list |
| change_requests_open | dashboard.ops.change_requests_open | SYNC | change_requests | change_request | decide_cr | ops-change-request-list |
| market_summary | dashboard.ops.market_summary | TABLE | market | market_cell | update_market | ops-market-list |
| notifications | dashboard.notifications.title | BELL | notifications | audit_log | — | branch-audit-log-list |

(Icons are `PrimeIcons.<NAME>`; plain route names mean `{ name: '<name>' }`.)

`NotificationsBox`: today's `useDashboardNotifications` moved in unchanged (loads on setup, so a hidden feed never fetches); renders `<DashboardBox :box :size :count="data.length">` with the default slot: today's grouped markup (period headings, tag, `i18n-t` sentence with the two links) over the first `limit` items in feed order, grouped after slicing. An empty feed now shows "None" instead of disappearing (spec: "Boş kutu kaybolmaz").

`Index.vue` (this task): drop all queries, builders and the three `TotalRowCountCard`s; keep `dialogRef` padding; render `<div class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">` with, for each `box` of `DASHBOARD_BOXES` where `$can('read', box.permission)`, `<component :is="box.component" :box :size="box.size" />` in a wrapper `div` carrying `:data-box-id="box.id"`.

- [ ] **Step 1: Write the failing tests**

`app/tests/constants/dashboard.test.ts`:

```ts
it('has unique ids, in today\'s order', () => {
   expect(DASHBOARD_BOXES.map((b) => b.id)).toEqual(['gates_team','gates_management','gates_customer','tasks_overdue','tasks_due_soon','unsigned_skus','incomplete_compliance','po_action','po_production','shipments_in_transit','shipments_late','incidents_open','change_requests_open','market_summary','notifications']);
   expect(new Set(DASHBOARD_BOXES.map((b) => b.id)).size).toBe(DASHBOARD_BOXES.length);
});
it('gives every box a permission, a component, a narrow default and an existing title key', () => {
   for (const b of DASHBOARD_BOXES) {
      expect(b.permission).toMatch(/^[a-z_]+$/);
      expect(b.component).toBeTruthy();
      expect(b.size).toBe('narrow');
      expect(lookup(en, b.title)).toEqual(expect.any(String));
   }
});
it('points every "open all" route and guide task at something that exists', () => {
   /* every b.to name is in the router's route names (collect names from opsRoutes/branchRoutes recursively);
      every b.guideTask is the id of a task in PAGE_GUIDES.dashboard.tasks */
});
```

`app/tests/views/dashboard.test.ts` (grows in Tasks 5–6): import `../setup/mockMain`; `vi.mock('@/constants/dashboard', importOriginal)` replacing each box's `component` with a stub `defineComponent({ props: ['box','size'], template: '<div data-test="box">{{ box.id }}:{{ size }}</div>' })`; `vi.mock('@/composables/useDialogRef', () => ({ useDialogRef: () => ref(null) }))`; mount with `abilitiesPlugin(ability, { useGlobalProperties: true })`, `i18NPlugin`, `PrimeVue`, fresh pinia, `attachTo: document.body` after adding `<span id="page-toolbar">`. `allow(...subjects)` sets `ability.update(subjects.map((subject) => ({ action: 'select', subject })))`.

```ts
it('shows the permitted boxes in the registry order', () => {
   allow('project_gate', 'shipment');
   expect(boxIds(mountDashboard())).toEqual(['gates_team','gates_management','gates_customer','shipments_in_transit','shipments_late']);
});
it('no longer shows the branch, user and role statistics', () => {
   allow('tenant', 'user', 'role');
   expect(mountDashboard().findAllComponents({ name: 'TotalRowCountCard' })).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/constants/dashboard.test.ts tests/views/dashboard.test.ts`
Expected: FAIL, `DASHBOARD_BOXES` is not exported.

- [ ] **Step 3: Implement** the registry, `NotificationsBox.vue` and the new `Index.vue` as above; delete `CountListCard.vue` and its test; trim `tests/api/dashboard.test.ts`; remove the three statistics keys from `en` and `tr`; `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/constants tests/views/dashboard.test.ts tests/views/dashboardBoxes.test.ts tests/api/dashboard.test.ts tests/plugins/i18n && pnpm typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A src/constants/dashboard.ts src/views/pages/dashboard src/components/service-components/dashboard tests src/plugins/i18n/locales
git commit -m "feat(dashboard): boxes come from one registry, the notification feed is a box, the statistics cards are gone"
```

---

### Task 4: The layout store `useDashboardLayout`

**Files:**
- Create: `app/src/store/dashboardLayout/index.ts`
- Test: `app/tests/store/dashboardLayout.test.ts`

**Interfaces:**
- Consumes: `DASHBOARD_BOX_IDS`, `DASHBOARD_BOXES`, `boxById`, `layoutStorageKey`, `BoxSize`, `BOX_SIZES`, `DashboardBoxId` (Tasks 1, 3).
- Produces (exports of `@/store/dashboardLayout`):
  - `type DashboardLayout = { order: DashboardBoxId[]; sizes: Partial<Record<DashboardBoxId, BoxSize>>; hidden: DashboardBoxId[] }`
  - `type CanSee = (id: DashboardBoxId) => boolean`
  - `defaultLayout(): DashboardLayout` → registry order, `sizes: {}`, `hidden: []`
  - `normalizeLayout(raw: unknown): DashboardLayout` — the read validation (no permission logic)
  - `useDashboardLayout` (setup store) exposing: `saved: Ref<DashboardLayout>`, `draft: Ref<DashboardLayout | null>`, `editing: ComputedRef<boolean>`, `layout: ComputedRef<DashboardLayout>` (`draft ?? saved`), `load(userId: string | null): void`, `sizeOf(id): BoxSize`, `visibleBoxes(canSee: CanSee): { shown: DashboardBoxId[]; hidden: DashboardBoxId[] }`, `edit(): void`, `hide(id): void`, `show(id): void`, `setSize(id, size: BoxSize): void`, `reorder(shownIds: DashboardBoxId[], canSee: CanSee): void`, `move(id, step: -1 | 1, canSee: CanSee): void`, `resetToDefault(): void`, `save(): boolean`, `discard(): void`

Behaviour the tests pin:
- `normalizeLayout`: non-object, array or `null` → default; `order`/`hidden` not arrays → `[]`; keep only registry ids, first occurrence wins; an id in `hidden` is removed from `order`; registry ids in neither list are appended to `order` in registry order; `sizes` keeps only registry ids with a value in `BOX_SIZES` that differs from the box's default.
- `load(userId)`: `draft = null`; reads `layoutStorageKey(userId)` inside `try/catch` (`JSON.parse` failure or a throwing `getItem` → default, as in `@/store/guide`); `null` userId → default, nothing read.
- Mutators (`hide`, `show`, `setSize`, `reorder`, `move`, `resetToDefault`) change `draft` only and are no-ops while `draft` is `null`; `show` removes from `hidden` and appends to the end of `order`.
- `reorder`: the slots in `order` held by ids in `shownIds` are refilled with `shownIds` in their new sequence; every other id (hidden by permission) keeps its slot. `move` swaps `id` with the nearest `canSee` neighbour in `step` direction among the shown ids, then goes through `reorder`; at an end it does nothing.
- `visibleBoxes(canSee)`: `shown` = `layout.order.filter(canSee)`, `hidden` = `layout.hidden.filter(canSee)`.
- `save()`: `saved = normalizeLayout(draft)`, `draft = null`, writes `JSON.stringify(saved)` (the whole object, no merge with what storage holds) under the user's key; returns `false` when there is no user or `setItem` throws (layout still applied in memory), else `true`.
- `discard()`: `draft = null`.

- [ ] **Step 1: Write the failing tests** in `app/tests/store/dashboardLayout.test.ts`

Use the `stubStorage` pattern of `tests/store/guide.test.ts` with a `Map`, fresh pinia per test, `afterEach(vi.unstubAllGlobals)`. `ALL = [...DASHBOARD_BOX_IDS]`.

```ts
describe('normalizeLayout', () => {
   it('falls back to the default for nothing, null, an array, a number or a string', () => {
      for (const raw of [undefined, null, [], 3, 'x']) expect(normalizeLayout(raw)).toEqual(defaultLayout());
   });
   it('drops unknown and duplicate ids and appends new boxes visible', () => {
      expect(normalizeLayout({ order: ['old_box', 'po_action', 'po_action'], hidden: ['gone'] }).order)
         .toEqual(['po_action', ...ALL.filter((id) => id !== 'po_action')]);
   });
   it('takes a hidden id out of the order', () => {
      const l = normalizeLayout({ order: ALL, hidden: ['notifications'] });
      expect(l.order).not.toContain('notifications');
      expect(l.hidden).toEqual(['notifications']);
   });
   it('keeps only valid sizes that differ from the default', () => {
      expect(normalizeLayout({ order: ALL, sizes: { po_action: 'wide', shipments_late: 'narrow', market_summary: 'huge', gone: 'wide' } }).sizes)
         .toEqual({ po_action: 'wide' });
   });
   it('treats order and hidden that are not arrays as empty', () => {
      expect(normalizeLayout({ order: 'po_action', hidden: { a: 1 } })).toEqual(defaultLayout());
   });
});

describe('useDashboardLayout', () => {
   it('reads the layout of the signed-in user only', () => { /* stored u1 hides 'notifications'; load('u1') → hidden ['notifications']; load('u2') → default */ });
   it('opens on the default layout when storage is unreadable or blocked', () => {
      /* getItem returns '{not json' → default; getItem throws → default; load(null) → default */
   });
   it('edits a draft and leaves the saved layout alone until save', () => {
      /* load('u1'); edit(); hide('po_action'); setSize('market_summary','wide');
         saved.order still contains po_action; layout.hidden ['po_action']; sizeOf('market_summary') 'wide' */
   });
   it('saves the whole layout under the user key, sizes only where they differ', () => {
      /* stored for u1 = { order: ['po_action'], hidden: ['notifications'] } (as written by another tab);
         load('u1'); edit(); show('notifications'); save() → true;
         JSON.parse(stored.get('dashboard.layout.u1')) equals { order: [...], sizes: {}, hidden: [] } with notifications last;
         editing false */
   });
   it('discard returns to the last saved layout', () => { /* edit, hide, discard → layout equals saved, editing false */ });
   it('reset to default shows everything in registry order and writes only on save', () => {
      /* stored layout with hidden + sizes; load; edit; resetToDefault → layout equals defaultLayout(); setItem not called; save → stored equals defaultLayout() */
   });
   it('keeps the layout for the visit when storage refuses the write', () => {
      /* setItem throws; edit; hide('po_action'); save() → false; saved.hidden ['po_action']; editing false */
   });
   it('does nothing outside edit mode', () => { /* hide('po_action') without edit → layout unchanged */ });
   it('moves past boxes the user cannot see and keeps their slots', () => {
      const canSee = (id: DashboardBoxId) => id !== 'gates_management';
      /* edit(); move('gates_team', 1, canSee) → order starts ['gates_customer','gates_management','gates_team', ...] */
      /* move('gates_customer', -1, canSee) at the first shown slot → unchanged */
   });
   it('reorders the shown boxes and leaves the others in place', () => {
      /* canSee excludes 'po_action'; reorder(shown with first two swapped, canSee) → po_action keeps its index in order */
   });
   it('offers neither shown nor hidden boxes the user cannot see', () => {
      /* hidden ['incidents_open']; canSee excludes incidents_open → visibleBoxes(canSee).hidden is [] and shown lacks it */
   });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/store/dashboardLayout.test.ts`
Expected: FAIL, cannot resolve `@/store/dashboardLayout`.

- [ ] **Step 3: Implement `app/src/store/dashboardLayout/index.ts`** per the Interfaces and behaviour list; the user id lives in a plain closure variable set by `load`. Comment the storage `try/catch` blocks the way `@/store/guide` does.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/store/dashboardLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/dashboardLayout tests/store/dashboardLayout.test.ts
git commit -m "feat(dashboard): a personal layout per user in this browser, validated on read"
```

---

### Task 5: The dashboard follows the saved layout

**Files:**
- Modify: `app/src/views/pages/dashboard/Index.vue`
- Modify: locales (`all_hidden`, `no_boxes`; `pnpm i18n-sync`)
- Test: `app/tests/views/dashboard.test.ts`

**Interfaces:**
- Consumes: `useDashboardLayout` (Task 4), `boxById`, `useAuthStore().user`, `useAbility()` from `@casl/vue`.
- Produces in `Index.vue`: `canSee: CanSee = (id) => ability.can('read', boxById(id).permission)`; `shown = computed(() => layout.visibleBoxes(canSee).shown)`; each wrapper gets `:class="{ 'md:col-span-2': layout.sizeOf(id) === 'wide' }"` and passes `:size="layout.sizeOf(id)"`. Task 6 builds on these names.

Behaviour: `watch(() => auth.user?.id ?? null, (id) => layout.load(id), { immediate: true })`. When `shown` is empty: `dashboard.layout.all_hidden` if some registry box passes `canSee`, else `dashboard.layout.no_boxes`, as a muted paragraph in place of the grid.

- [ ] **Step 1: Write the failing tests** (add to `app/tests/views/dashboard.test.ts`; `vi.mock('@/store/auth', importOriginal)` with `useAuthStore: () => auth` where `auth = reactive({ user: { id: 'u1' } })`; storage stubbed as in Task 4)

```ts
it('shows the stored order, without hidden boxes, wide ones across two columns', async () => {
   allow('project_gate', 'shipment');
   store('u1', { order: ['shipments_late', 'gates_team'], hidden: ['gates_customer'], sizes: { shipments_late: 'wide' } });
   const w = mountDashboard();
   expect(boxIds(w).slice(0, 2)).toEqual(['shipments_late', 'gates_team']);
   expect(boxIds(w)).not.toContain('gates_customer');
   expect(w.get('[data-box-id="shipments_late"]').classes()).toContain('md:col-span-2');
   expect(w.get('[data-box-id="gates_team"]').classes()).not.toContain('md:col-span-2');
   expect(w.get('[data-box-id="shipments_late"]').text()).toBe('shipments_late:wide');
});
it("loads the new user's layout when the account changes", async () => { /* u2 has another order; auth.user = { id: 'u2' }; await nextTick → boxIds follow u2 */ });
it('says when every box is hidden, and when the role has none', () => { /* all permitted ids hidden → all_hidden text; allow() nothing → no_boxes text */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboard.test.ts`
Expected: FAIL, order follows the registry, not storage.

- [ ] **Step 3: Implement** as in Interfaces; add the two keys to `en`/`tr` (Copy table); `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboard.test.ts tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/pages/dashboard/Index.vue tests/views/dashboard.test.ts src/plugins/i18n/locales
git commit -m "feat(dashboard): the boxes follow the user's saved order, sizes and hidden set"
```

---

### Task 6: Edit mode

**Files:**
- Modify: `app/package.json`, `app/pnpm-lock.yaml` (`pnpm add vuedraggable@4.1.0 --save-exact`)
- Create: `app/src/views/pages/dashboard/DashboardBoxEditBar.vue`, `app/src/views/pages/dashboard/DashboardHiddenStrip.vue`
- Modify: `app/src/views/pages/dashboard/Index.vue`
- Modify: locales (remaining `dashboard.layout.*` keys; `pnpm i18n-sync`)
- Test: `app/tests/views/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 4 store API, Task 5 `canSee` / `shown`.
- Produces:
  - `DashboardBoxEditBar.vue`: props `{ box: DashboardBoxDef; size: BoxSize; first: boolean; last: boolean }`; emits `hide: []`, `update:size: [BoxSize]`, `move: [-1 | 1]`. Content in a row above the card: a `button.dashboard-drag-handle` (`PrimeIcons.BARS`, `aria-label` `dashboard.layout.drag`, `cursor-grab`); a `SelectButton` with options narrow/wide labelled `dashboard.layout.size_narrow|size_wide`; an icon button `PrimeIcons.EYE_SLASH` (`aria-label` `dashboard.layout.hide`); a `PrimeIcons.ELLIPSIS_V` button (`aria-label` `dashboard.layout.menu`) opening `<Menu popup append-to="self">` with `move_left` (`ARROW_LEFT`, disabled when `first`) and `move_right` (`ARROW_RIGHT`, disabled when `last`).
  - `DashboardHiddenStrip.vue`: props `{ ids: DashboardBoxId[] }`, emits `show: [DashboardBoxId]`; title `dashboard.layout.hidden_title`, hint `hidden_hint`, one button per id (box icon + `$t(box.title)`), `hidden_empty` when `ids` is empty.

`Index.vue` changes:
- `const canEdit = useMediaQuery('(min-width: 768px)')`; `watch(canEdit, (wide) => { if (!wide) layout.discard(); })`; `onBeforeUnmount(() => layout.discard())`.
- Toolbar: `<Teleport to="#page-toolbar" :disabled="!!dialogRef">`, shown only when `canEdit`: outside edit mode one outlined Button `dashboard.layout.edit` (`PrimeIcons.PENCIL`) → `layout.edit()`; in edit mode text Button `reset` → `resetToDefault()`, outlined secondary Button `discard` → `discard()`, Button `save` → `if (!layout.save()) toast.add({ severity: 'warn', summary: t('dashboard.layout.not_persisted'), life: 5000 })`.
- The grid becomes `<draggable tag="div" class="<Task 5 grid classes>" :model-value="shown" :item-key="(id: DashboardBoxId) => id" handle=".dashboard-drag-handle" :disabled="!layout.editing" :animation="150" @update:model-value="(ids) => layout.reorder(ids, canSee)">` with `#item="{ element: id, index }"`: in edit mode the wrapper gets `outline-dashed outline-2 outline-offset-2 outline-surface-300 rounded-xl` and shows the edit bar (`:first="index === 0" :last="index === shown.length - 1"`, `@hide="layout.hide(id)"`, `@update:size="(s) => layout.setSize(id, s)"`, `@move="(step) => layout.move(id, step, canSee)"`).
- Below the grid in edit mode: `<DashboardHiddenStrip :ids="layout.visibleBoxes(canSee).hidden" @show="layout.show" />`.

- [ ] **Step 1: Write the failing tests** (add to `app/tests/views/dashboard.test.ts`; `vi.mock('@vueuse/core', importOriginal)` with `useMediaQuery: () => wideScreen` where `wideScreen = ref(true)`; `vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toast }) }))`; toolbar buttons are read from `document.body` by label)

```ts
it('opens the edit toolbar from Edit, and only from md up', async () => {
   const w = mountDashboard();
   await click(button(t('dashboard.layout.edit')));
   expect([t('dashboard.layout.save'), t('dashboard.layout.discard'), t('dashboard.layout.reset')].every((l) => button(l))).toBe(true);
   expect(w.findAllComponents(DashboardBoxEditBar).length).toBe(boxIds(w).length);
   wideScreen.value = false; await nextTick();
   expect(button(t('dashboard.layout.edit'))).toBeUndefined();
   expect(useDashboardLayout().editing).toBe(false);
});
it('hides a box into the strip and brings it back at the end', async () => {
   /* edit; click hide on gates_team's edit bar → boxIds lacks it, strip button with $t('dashboard.ops.gates_team');
      click strip button → boxIds ends with 'gates_team' */
});
it('switches a box to wide', async () => { /* edit; SelectButton option size_wide on po_action → wrapper has md:col-span-2, stub text 'po_action:wide' */ });
it('moves a box with the menu, Move left disabled on the first box', async () => {
   /* edit; open menu of the second box, click move_left → it is first; first box's move_left item has aria-disabled="true" */
});
it('saves the layout and keeps it after a remount', async () => {
   /* edit; hide po_action; click save → stored 'dashboard.layout.u1' hidden ['po_action']; editing false;
      unmount, new pinia, mount → boxIds lacks po_action */
});
it('discard reverts to the saved layout', async () => { /* edit; hide; discard → boxIds back; storage untouched */ });
it('does not offer a box the user cannot see in the strip', async () => {
   /* stored hidden ['incidents_open'], allow without 'incident'; edit → strip shows hidden_empty, no incidents button */
});
it('warns when the browser refuses to save', async () => { /* setItem throws; edit; hide; save → toast called with severity 'warn', summary t('dashboard.layout.not_persisted'); box stays hidden */ });
it('drops an unsaved draft when the dashboard is left', async () => { /* edit; hide; unmount → useDashboardLayout().editing false, layout equals saved */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboard.test.ts`
Expected: FAIL, no Edit button.

- [ ] **Step 3: Install the dependency**

Run: `pnpm add vuedraggable@4.1.0 --save-exact`
Expected: `app/package.json` dependencies contain `"vuedraggable": "4.1.0"`.

- [ ] **Step 4: Implement** the two components and the `Index.vue` changes above; add the remaining keys to `en`/`tr` (Copy table); `pnpm i18n-sync`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboard.test.ts tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all exit 0.

Then `pnpm dev:vue`, sign in, and check by hand at 1280 px, 900 px and 390 px: three/two/one columns; a wide box spans two of three, the full row, then one column; Edit is absent at 390 px; drag by the handle reorders; Save survives a reload; a second account in the same browser sees its own layout; with site data blocked in the browser the dashboard opens on the default and Save shows the warning.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/views/pages/dashboard tests/views/dashboard.test.ts src/plugins/i18n/locales
git commit -m "feat(dashboard): edit mode to reorder, hide and size the boxes, saved per user"
```
