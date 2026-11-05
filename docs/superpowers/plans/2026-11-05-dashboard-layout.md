# Configurable Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard into a personal, per-browser layout of the 14 operations boxes and the notification feed, each box in one "dense list" card shell, reorderable, hideable and sized narrow or wide in an edit mode.

**Architecture:** A registry (`DASHBOARD_BOXES`) describes each box; each box is a thin component that owns its query (through one shared composable) and renders the shared `DashboardBox` shell, so a hidden box never mounts and never fetches. A pinia store (`useDashboardLayout`) holds the saved layout and an edit draft, reads and validates `localStorage` per user, and filters by permission at read time. `Index.vue` renders the visible boxes in a CSS grid wrapped by `vuedraggable`, with the edit toolbar teleported into the page header.

**Tech Stack:** Vue 3.5, PrimeVue 4 (auto-registered by `PrimeVueResolver`, `app/vite.config.mjs:46`, which vitest merges), Tailwind 3, TanStack Query 5, Pinia 2, vue-i18n 10, @casl/vue, @vueuse/core, vuedraggable 4.1.0 (new), vitest + @vue/test-utils + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`, section "M6 Dashboard ve haftalık ritim", paragraph "Yapılandırılabilir dashboard (eklendi 05.11.2026, onaylandı)" and its "Geliştirici kararları" line; K7 for language.

## Global Constraints

- Box inventory: today's 14 operations boxes + the notification feed; default order = today's order; every box defaults to `narrow`.
- Row cap: narrow 4, wide 8; the badge is always the full count.
- Grid: 3 columns at `xl`, 2 at `md`, 1 below; wide = `md:col-span-2` (full row on tablet, 2 of 3 on desktop, 1 column on phones). Row flow, no `grid-flow-dense`, no free grid, no box height.
- Areas (fixed palette, owner reviews): projects, products, supply, logistics, incidents, change_requests, market, notifications.
- "Tümünü aç" only on a box whose registry entry has `to`; no new list route. Customer-filter boxes keep the row's `onSelect` (sets the global customer filter before navigating).
- "Bu kartı nasıl kapatırım?" is the existing `guideTask` link, optional per box.
- Storage: `localStorage` key `dashboard.layout.<userId>`, one object `{ order: id[], sizes: { id: 'narrow' | 'wide' }, hidden: id[] }`; `sizes` holds only boxes that differ from the default. Written on Save only; last writer wins across tabs. Not in the database. No role-based defaults.
- Read validation: unknown ids dropped, an id in `hidden` is removed from `order`, a box without permission is skipped (neither shown nor offered in "Gizli kutular"), new registry ids are appended visible; corrupt, missing or blocked storage falls back to the default layout.
- Edit mode: none below `md` (768 px). Discard returns to the last saved layout; Reset to default = registry order and sizes, all visible (persisted only on Save). While editing, no link inside a box navigates.
- Removed: the branches, users and roles statistics cards, and `TotalRowCountCard.vue` with its `dashboard.statistics.*` keys. CASL gating unchanged (`read` on the box's subject).
- Language (K7): UI in TR and EN by hand, `en` is the source locale; every other locale is filled by `pnpm i18n-sync` (run from `app/`). i18n copy is plain text, `[[CODE]]` term markers only. TR copy below is marked [owner to confirm].
- `vuedraggable` pinned exactly: `"vuedraggable": "4.1.0"` in `app/package.json` dependencies (precedent: `chart.js` is pinned exactly).
- All commands run from `app/`. Every commit message ends with the Co-Authored-By trailer your session provides.

## Review Focus

1. **A layout saved by an earlier version or edited by hand** (an id no longer in the registry, duplicates, an id in both `order` and `hidden`, `sizes: { x: 'huge' }`, `order` not an array, an array or `null` at the top level): the dashboard opens on a clean layout, never throws. Pinned in Task 4 (`normalizeLayout` cases).
2. **A box the user lost permission to, or abilities not loaded yet on first render**: the box is neither shown nor in "Gizli kutular", saving in that state does not erase its place, and nothing (not even "no boxes") renders until the access is loaded. Pinned in Task 4 (`reorder`/`move` keep unseen slots, `visibleBoxes`), Task 5 (`accessReady` gate) and Task 6 (strip excludes it).
3. **Blocked storage** (private mode, `getItem`/`setItem` throw): default layout on read; Save applies the layout for this visit and shows one warning toast. Pinned in Task 4 (`save()` returns `false`) and Task 6 (toast).
4. **Two tabs, or two accounts in one browser**: Save writes the whole object (no merge with what the other tab stored); signing in as another user in the same tab loads that user's key and drops any draft. Pinned in Task 4 (whole-object write, per-user keys) and Task 5 (user-id watch).
5. **Wide on tablet, and leaving edit mode half-way**: a wide box spans `md:col-span-2`; shrinking below `md`, navigating away, or clicking a link inside a box while editing must never leave a half-made layout that later looks saved. Pinned in Task 1 (links inert while editing), Task 5 (span class) and Task 6 (media query, unmount discard, saved layout unchanged).

---

## File Structure

- Create `app/src/constants/dashboard.ts` — ids, types, area palette, row limits, storage key, the `DASHBOARD_EDITING` injection key, the registry `DASHBOARD_BOXES`, `boxById`.
- Create `app/src/components/service-components/dashboard/DashboardBox.vue` — the card shell. Replaces `CountListCard.vue` (deleted in Task 3).
- Create `app/src/views/pages/dashboard/boxes/` — `views.ts` (pure row builders and per-family views), `useBoxView.ts` (hook → view, shared by every box), eight thin box components (`GatesBox`, `TasksBox`, `EvidenceBox`, `PurchaseOrdersBox`, `ShipmentsBox`, `IncidentsBox`, `ChangeRequestsBox`, `MarketBox`), `NotificationsBox.vue`.
- Create `app/src/store/dashboardLayout/index.ts` — layout store and its pure helpers.
- Create `app/src/views/pages/dashboard/DashboardBoxEditBar.vue`, `DashboardHiddenStrip.vue` — edit-mode controls.
- Modify `app/src/views/pages/dashboard/Index.vue` — the grid, the store wiring and the toolbar.
- Modify `app/src/constants/guide.ts` — the `edit_dashboard` guide task.
- Delete `app/src/components/service-components/dashboard/CountListCard.vue`, `app/src/components/service-components/charts/TotalRowCountCard.vue`, `app/tests/components/CountListCard.test.ts` (`TotalRowCountCard` has no test).
- Modify locales `en` and `tr` by hand, the rest via `pnpm i18n-sync`; `app/package.json`, `app/pnpm-lock.yaml`.
- Tests: `app/tests/components/DashboardBox.test.ts`, `app/tests/views/dashboardBoxes.test.ts`, `app/tests/constants/dashboard.test.ts`, `app/tests/store/dashboardLayout.test.ts`, `app/tests/views/dashboard.test.ts`; `app/tests/api/dashboard.test.ts` loses its `CountListCard` block.

## Copy (EN source / TR [owner to confirm])

New keys under `dashboard.layout`:

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

Guide task `guide.pages.dashboard.tasks.edit_dashboard` (Task 6):

| key | en | tr [owner to confirm] |
|---|---|---|
| `title` | Arrange your dashboard | Dashboard'unuzu düzenleyin |
| `steps.1` | On a tablet or computer, click Edit at the top right; each box gets a handle, an eye and a narrow or wide switch. | Tablet ya da bilgisayarda sağ üstteki Düzenle'ye tıklayın; her kutuda bir tutamaç, bir göz simgesi ve dar/geniş seçimi çıkar. |
| `steps.2` | Drag a box by its handle, or use Move left and Move right in its menu; the eye moves it to Hidden boxes, where a click adds it back at the end. | Kutuyu tutamacından sürükleyin ya da menüsündeki Sola taşı ve Sağa taşı ile taşıyın; göz simgesi kutuyu Gizli kutular şeridine alır, oradan bir tıklama sona ekler. |
| `steps.3` | Click Save to keep the layout in this browser for your account; Discard returns to the last saved layout, Reset to default shows every box in the default order. | Düzeni bu tarayıcıda hesabınız için saklamak için Kaydet'e tıklayın; Vazgeç son kaydedilen düzene döner, Varsayılana dön tüm kutuları varsayılan sırayla gösterir. |

Removed in Task 3: the whole `dashboard.statistics` group (its only users were the three cards and `TotalRowCountCard`). Empty box text stays `dashboard.ops.none` ("None" / "Yok").

---

### Task 1: Dashboard types and the `DashboardBox` shell

**Files:**
- Create: `app/src/constants/dashboard.ts`
- Create: `app/src/components/service-components/dashboard/DashboardBox.vue`
- Modify: `app/src/plugins/i18n/locales/en/index.json`, `tr/index.json` (+ `pnpm i18n-sync`)
- Test: `app/tests/components/DashboardBox.test.ts`

**Interfaces:**
- Produces (in `@/constants/dashboard`):
  - `DASHBOARD_BOX_IDS = ['gates_team','gates_management','gates_customer','tasks_overdue','tasks_due_soon','unsigned_skus','incomplete_compliance','po_action','po_production','shipments_in_transit','shipments_late','incidents_open','change_requests_open','market_summary','notifications'] as const` (today's order)
  - `type DashboardBoxId = (typeof DASHBOARD_BOX_IDS)[number]`
  - `type BoxSize = 'narrow' | 'wide'`; `BOX_SIZES: readonly BoxSize[] = ['narrow', 'wide']`
  - `type DashboardArea = 'projects' | 'products' | 'supply' | 'logistics' | 'incidents' | 'change_requests' | 'market' | 'notifications'`
  - `DASHBOARD_AREA_CLASSES: Record<DashboardArea, { icon: string; badge: string }>` (Step 3)
  - `ROW_LIMIT: Record<BoxSize, number> = { narrow: 4, wide: 8 }`
  - `layoutStorageKey(userId: string): string` → `` `dashboard.layout.${userId}` ``
  - `DASHBOARD_EDITING: InjectionKey<Readonly<Ref<boolean>>> = Symbol('dashboard-editing')` (provided by `Index.vue` in Task 6; absent = not editing)
  - `type DashboardBoxDef = { id: DashboardBoxId; title: string /* i18n key */; icon: string; area: DashboardArea; size: BoxSize; permission: string /* CASL subject, action 'read' */; to?: RouteLocationRaw; guideTask?: string; component: Component }`
  - `type DashboardRow = { code: string; context?: string; tag?: string; urgent?: boolean; to: RouteLocationRaw; onSelect?: () => void }`
- Produces: `DashboardBox.vue` props `{ box: DashboardBoxDef; size: BoxSize; count: number; rows?: DashboardRow[]; empty?: boolean }` (`empty` defaults to `count === 0`); default slot `{ limit: number; editing: boolean }` replaces the row list when given.

- [ ] **Step 1: Write the failing tests** in `app/tests/components/DashboardBox.test.ts`

Today's `CustomLink` stub (`tests/api/dashboard.test.ts`, `tests/components/CountListCard.test.ts`) is `<a><slot :navigate="navigate" /></a>` with a spy `navigate`; this one also takes the `to` prop and renders it on the `<a>`:

```ts
const navigate = vi.fn();
const CustomLink = defineComponent({
   props: ['to'],
   setup: (props) => ({ navigate, toJson: computed(() => JSON.stringify(props.to)) }),
   template: '<a :data-to="toJson"><slot :navigate="navigate" /></a>'
});
const box = (overrides: Partial<DashboardBoxDef> = {}): DashboardBoxDef => ({
   id: 'tasks_overdue', title: 'dashboard.ops.tasks_overdue', icon: 'pi pi-clock', area: 'projects',
   size: 'narrow', permission: 'project_task', component: {}, ...overrides
});
const rowsOf = (n: number): DashboardRow[] =>
   Array.from({ length: n }, (_, i) => ({ code: `P${i}`, to: { name: 'dashboard' } }));
const mountBox = (
   props: { count: number; box?: DashboardBoxDef; size?: BoxSize; rows?: DashboardRow[]; empty?: boolean },
   options: { editing?: boolean; slot?: string } = {}
) =>
   mount(DashboardBox, {
      props: { box: box(), size: 'narrow', ...props },
      slots: options.slot ? { default: options.slot } : {},
      global: {
         plugins: [i18NPlugin, PrimeVue],
         provide: { [DASHBOARD_EDITING]: ref(options.editing ?? false) },
         stubs: { CustomLink }
      }
   });
const buttonByText = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text() === text);

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => { setActivePinia(createPinia()); navigate.mockReset(); });

it('caps rows at four when narrow and eight when wide, the badge keeps the full count', () => {
   expect(mountBox({ size: 'narrow', count: 10, rows: rowsOf(10) }).findAll('li')).toHaveLength(4);
   const wide = mountBox({ size: 'wide', count: 10, rows: rowsOf(10) });
   expect(wide.findAll('li')).toHaveLength(8);
   expect(wide.get('[data-test="box-badge"]').text()).toBe('10');
});
it('shows the code bold, the context grey and the tag', () => {
   const li = mountBox({ count: 1, rows: [{ code: 'PRJ-1', context: 'G2 · THO', tag: '3 days late', urgent: true, to: { name: 'dashboard' } }] }).get('li');
   expect(li.get('.font-semibold').text()).toBe('PRJ-1');
   expect(li.get('.text-muted-color').text()).toBe('G2 · THO');
   expect(li.text()).toContain('3 days late');
});
it('says None at zero count, and lists rows at zero count when empty is false', () => {
   const none = mountBox({ count: 0, rows: rowsOf(2) });
   expect(none.text()).toContain(i18n.t('dashboard.ops.none'));
   expect(none.findAll('li')).toHaveLength(0);
   expect(mountBox({ count: 0, empty: false, rows: rowsOf(2) }).findAll('li')).toHaveLength(2);
});
it('colours the icon and the badge by area', () => {
   const w = mountBox({ count: 1, box: box({ area: 'products' }) });
   const { icon, badge } = DASHBOARD_AREA_CLASSES.products;
   expect(w.get('[data-test="box-icon"]').classes()).toEqual(expect.arrayContaining(icon.split(' ')));
   expect(w.get('[data-test="box-badge"]').classes()).toEqual(expect.arrayContaining(badge.split(' ')));
});
it('shows "Open all" only when the box has a route, and it navigates', async () => {
   const w = mountBox({ count: 1, box: box({ to: { name: 'ops-project-list' } }) });
   const openAll = buttonByText(w, i18n.t('dashboard.layout.open_all'))!;
   expect(openAll.element.closest('a')!.getAttribute('data-to')).toContain('ops-project-list');
   await openAll.trigger('click');
   expect(navigate).toHaveBeenCalledOnce();
   expect(buttonByText(mountBox({ count: 1 }), i18n.t('dashboard.layout.open_all'))).toBeUndefined();
});
it('links to the guide task when the box has one', async () => {
   const show = vi.spyOn(useGuideStore(), 'show');
   await buttonByText(mountBox({ count: 1, box: box({ guideTask: 'close_tasks' }) }), i18n.t('guide.panel.close_card'))!.trigger('click');
   expect(show).toHaveBeenCalledWith('dashboard', 'close_tasks');
   expect(buttonByText(mountBox({ count: 1 }), i18n.t('guide.panel.close_card'))).toBeUndefined();
});
it("runs the row's onSelect before navigating", async () => {
   const calls: string[] = [];
   navigate.mockImplementation(() => calls.push('navigate'));
   await mountBox({ count: 1, rows: [{ code: 'THO', to: { name: 'dashboard' }, onSelect: () => calls.push('select') }] }).get('li button').trigger('click');
   expect(calls).toEqual(['select', 'navigate']);
});
it('renders the slot with the size limit instead of rows', () => {
   const w = mountBox({ count: 3, size: 'wide', rows: rowsOf(3) }, { slot: '<template #default="{ limit }"><p>{{ limit }}</p></template>' });
   expect(w.get('p').text()).toBe('8');
   expect(w.findAll('li')).toHaveLength(0);
});
it('makes every link inert while the dashboard is edited', async () => {
   const onSelect = vi.fn();
   const w = mountBox(
      { count: 1, box: box({ to: { name: 'ops-project-list' }, guideTask: 'close_tasks' }), rows: [{ code: 'THO', to: { name: 'dashboard' }, onSelect }] },
      { editing: true }
   );
   expect(w.findAll('a')).toHaveLength(0);
   expect(w.get('li [aria-disabled="true"]').text()).toContain('THO');
   await w.get('li [aria-disabled="true"]').trigger('click');
   expect(onSelect).not.toHaveBeenCalled();
   expect(navigate).not.toHaveBeenCalled();
   expect(buttonByText(w, i18n.t('dashboard.layout.open_all'))!.attributes('disabled')).toBeDefined();
   expect(buttonByText(w, i18n.t('guide.panel.close_card'))!.attributes('disabled')).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/DashboardBox.test.ts`
Expected: FAIL, `Failed to resolve import "@/components/service-components/dashboard/DashboardBox.vue"`.

- [ ] **Step 3: Implement `app/src/constants/dashboard.ts` (the Interfaces above, no registry yet) and `DashboardBox.vue`**

Area palette (full class strings so Tailwind's content scan finds them):

| area | icon | badge |
|---|---|---|
| projects | `bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300` | `bg-blue-600 text-white` |
| products | `bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300` | `bg-teal-600 text-white` |
| supply | `bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300` | `bg-amber-600 text-white` |
| logistics | `bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300` | `bg-sky-600 text-white` |
| incidents | `bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300` | `bg-red-600 text-white` |
| change_requests | `bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300` | `bg-violet-600 text-white` |
| market | `bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300` | `bg-emerald-600 text-white` |
| notifications | `bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300` | `bg-slate-600 text-white` |

Shell: root `div` `rounded-xl shadow-md bg-surface-0 dark:bg-surface-900 p-4 flex flex-col gap-3`; header = icon chip `data-test="box-icon"` (`w-8 h-8 rounded-lg flex items-center justify-center` + area icon classes, `<i :class="box.icon">`), title `font-semibold` = `$t(box.title)`, badge `data-test="box-badge"` `ms-auto rounded-full px-2 text-sm font-semibold` + area badge classes. Rows shown = `rows.slice(0, ROW_LIMIT[size])`; each `li` is `rounded-lg bg-surface-50 dark:bg-surface-800 px-3 py-2`: code `font-semibold`, context `text-muted-color truncate`, tag PrimeVue `Tag` (`:severity="row.urgent ? 'danger' : 'secondary'"`, `class="!text-xs ms-auto shrink-0"`). Footer `flex items-center justify-between`: the guide button as in `CountListCard.vue` (label `guide.panel.close_card`, `useGuideStore().show('dashboard', box.guideTask)` on click), then "Open all": `<CustomLink :to="box.to" v-slot="{ navigate }"><Button text size="small" :label="$t('dashboard.layout.open_all')" :icon="PrimeIcons.ARROW_RIGHT" icon-pos="right" @click="navigate" /></CustomLink>`.

While editing (`const editing = inject(DASHBOARD_EDITING, ref(false))`): rows render without `CustomLink`, as a `div` with `aria-disabled="true"` and no click handler; the content and footer wrapper gets `pointer-events-none select-none`; "Open all" renders as the same Button `disabled` without `CustomLink`; the guide button is `:disabled="editing"`. The slot receives `editing` so custom content does the same.

Add `dashboard.layout.open_all` to `en` and `tr` (Copy table), then `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/DashboardBox.test.ts tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 5: Commit** (message ends with the Co-Authored-By trailer your session provides)

```bash
git add src/constants/dashboard.ts src/components/service-components/dashboard/DashboardBox.vue tests/components/DashboardBox.test.ts src/plugins/i18n/locales
git commit -m "feat(dashboard): one dense-list card shell for every box, coloured by area"
```

---

### Task 2: The operations boxes, each owning its query

**Files:**
- Create: `app/src/views/pages/dashboard/boxes/views.ts`, `useBoxView.ts`, `GatesBox.vue`, `TasksBox.vue`, `EvidenceBox.vue`, `PurchaseOrdersBox.vue`, `ShipmentsBox.vue`, `IncidentsBox.vue`, `ChangeRequestsBox.vue`, `MarketBox.vue`
- Test: `app/tests/views/dashboardBoxes.test.ts`

**Interfaces:**
- Consumes: `DashboardBox`, `DashboardRow`, `DashboardBoxDef`, `DashboardBoxId`, `BoxSize` (Task 1); hooks and groupers of `@/api/dashboard` (unchanged).
- Produces in `views.ts`:
  - `type BoxView = { count: number; rows: DashboardRow[]; empty?: boolean }`
  - `type SetCustomer = (id: string | null) => void`
  - per-family views, each `(rows, id) => BoxView` and picking its group from `id`:
    `gatesView(rows: readonly DashboardGateRow[], id)` (`gates_team|gates_management|gates_customer` → `groupGates(rows).team|management|customer`),
    `tasksView(rows: readonly DashboardTaskRow[], id)` (`tasks_overdue|tasks_due_soon` → `splitTasks(rows).overdue|dueSoon`),
    `evidenceView(setCustomer: SetCustomer)` → `(rows: readonly DashboardEvidenceRow[], id) => BoxView` (`unsigned_skus`: `skuCountOf = row.unsigned_sku_count ?? 0`, card `'unsigned_spec'`; `incomplete_compliance`: `skuCountOf = (row.active_sku_count ?? 0) - (row.compliance_complete_count ?? 0)`, card `'compliance'`; today's `evidenceBox` logic: rows with `skuCountOf > 0`, most first, `count` = their sum),
    `ordersView(rows: readonly DashboardPurchaseOrderRow[], id)` (`po_action|po_production`),
    `shipmentsView(rows: readonly DashboardShipmentRow[], id)` (`shipments_in_transit|shipments_late`),
    `incidentsView(rows: readonly DashboardIncidentRow[])`, `changeRequestsView(rows: readonly DashboardChangeRequestRow[])` (count = rows length),
    `marketView(setCustomer: SetCustomer)` → `(rows: readonly DashboardMarketRow[]) => BoxView` (count = `marketSummary(rows).live`, `empty = items.length === 0`).
- Produces in `useBoxView.ts`: `useBoxView<Row>(box: DashboardBoxDef, useRows: () => { data: Ref<Row[] | undefined> }, view: (rows: readonly Row[], id: DashboardBoxId) => BoxView): ComputedRef<BoxView>` — calls `useRows()` once and maps `data ?? []` through `view(rows, box.id)`.
- Produces: each box component has props `{ box: DashboardBoxDef; size: BoxSize }` and is only `const view = useBoxView(props.box, useDashboardGates, gatesView)` + `<DashboardBox :box :size v-bind="view" />` (Evidence/Market pass `evidenceView(useCustomerFilter().set)` / `marketView(useCustomerFilter().set)`).

Row split (today's `label` becomes `code` + `context`, today's `meta` becomes `tag`; routes, i18n keys and meta text as in today's `Index.vue`):

| builder | code | context | tag | urgent |
|---|---|---|---|---|
| gate | `project_code` | gate name · `customer_code` | waiting days | — |
| task | `project_code` | `display_name` | days left / due today / days late | `days_left < 0` |
| evidence | `customer_code` | — | SKU count | — |
| orders | `code` | `supplier_code` · `customer_code` | status / ready · balance | — |
| shipments | `code` | `customer_code` | ETA / days late | late group only |
| incident | `code` | `title` · `customer_code` | severity · notice missing or deadline | `management_notice_missing` |
| change request | `code` | `title` · `customer_code` | status · decision date | — |
| market | `customer_code` | — | live · preparing · suppressed | — |

Null codes fall back to `''`; empty context parts are filtered as today.

- [ ] **Step 1: Write the failing tests** in `app/tests/views/dashboardBoxes.test.ts`

```ts
import '../setup/mockMain';
// helpers (row builders as in tests/api/dashboard.test.ts: cast partial rows)
const gate = (project_code: string, needs_management: boolean, needs_customer_approval: boolean) =>
   ({ project_code, gate_code: 'G2', customer_code: 'THO', waiting_days: 4, project_id: 'p', needs_management, needs_customer_approval }) as DashboardGateRow;
const task = (project_code: string, days_left: number) =>
   ({ project_code, display_name: 'Spec', days_left, overdue: days_left < 0, project_id: 'p' }) as DashboardTaskRow;
const evidence = (customer_id: string, unsigned_sku_count: number) =>
   ({ customer_id, customer_code: customer_id.toUpperCase(), unsigned_sku_count, active_sku_count: 0, compliance_complete_count: 0 }) as DashboardEvidenceRow;
beforeAll(() => i18n.setLocaleMessage('en', en));

it('picks the management gates and counts them all', () => {
   const v = gatesView([gate('A', true, false), gate('B', false, false), gate('C', true, true)], 'gates_management');
   expect(v.count).toBe(2);
   expect(v.rows.map((r) => r.code)).toEqual(['A', 'C']);
   expect(v.rows[0]).toMatchObject({ context: `${i18n.t('ops.project.gate.G2')} · THO`, tag: i18n.t('dashboard.ops.waiting_days', { days: 4 }) });
});
it('marks overdue tasks urgent with their days late', () => {
   const [row] = tasksView([task('A', -3), task('B', 2)], 'tasks_overdue').rows;
   expect(row).toMatchObject({ code: 'A', tag: i18n.t('dashboard.ops.days_overdue', { days: 3 }), urgent: true });
   expect(tasksView([task('A', -3), task('B', 2)], 'tasks_due_soon').rows[0].urgent).toBeFalsy();
});
it('sums the SKUs per customer, most first, and sets the customer filter before opening the list', () => {
   const setCustomer = vi.fn();
   const v = evidenceView(setCustomer)([evidence('a', 1), evidence('b', 0), evidence('c', 5)], 'unsigned_skus');
   expect(v.count).toBe(6);
   expect(v.rows.map((r) => [r.code, r.tag])).toEqual([['C', '5'], ['A', '1']]);
   expect(v.rows[0].to).toEqual(evidenceTarget({ customer_id: 'c' }, 'unsigned_spec').route);
   v.rows[0].onSelect!();
   expect(setCustomer).toHaveBeenCalledWith('c');
});
it('counts live market cells and is empty without targets', () => {
   const v = marketView(vi.fn())([{ customer_id: 'a', live_count: 3, target_count: 0 } as DashboardMarketRow]);
   expect(v).toMatchObject({ count: 3, empty: true, rows: [] });
});
it('marks an incident urgent when management was not told', () => {
   const [row] = incidentsView([{ code: 'INC-1', title: 'Leak', severity: 's1', management_notice_missing: true, incident_id: 'i' } as DashboardIncidentRow]).rows;
   expect(row.urgent).toBe(true);
   expect(row.tag).toContain(i18n.t('dashboard.ops.meta.notice_missing'));
});
it('a box component runs its hook and hands the view to the shell', () => {
   const rows = ref([gate('A', false, false)]);
   const useRows = vi.fn(() => ({ data: rows }));
   const Shell = defineComponent({ props: ['box', 'size', 'count', 'rows'], template: '<p>{{ count }}:{{ rows.map((r) => r.code).join() }}</p>' });
   const Probe = defineComponent({
      props: ['box', 'size'],
      setup: (props) => ({ view: useBoxView(props.box, useRows, gatesView) }),
      components: { Shell },
      template: '<Shell :box="box" :size="size" v-bind="view" />'
   });
   const w = mount(Probe, { props: { box: { id: 'gates_team' }, size: 'narrow' } });
   expect(useRows).toHaveBeenCalledOnce();
   expect(w.text()).toBe('1:A');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboardBoxes.test.ts`
Expected: FAIL, `Failed to resolve import "@/views/pages/dashboard/boxes/views"`.

- [ ] **Step 3: Implement `views.ts`, `useBoxView.ts` and the eight thin box components** per Interfaces. TanStack dedupes the shared query keys, so the three gate boxes still make one request. `Index.vue` is not touched yet.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboardBoxes.test.ts tests/api/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (with the Co-Authored-By trailer your session provides)

```bash
git add src/views/pages/dashboard/boxes tests/views/dashboardBoxes.test.ts
git commit -m "feat(dashboard): each operations box is a thin component over one shared query view"
```

---

### Task 3: Notification feed box, the registry, and `Index.vue` from the registry

**Files:**
- Create: `app/src/views/pages/dashboard/boxes/NotificationsBox.vue`
- Modify: `app/src/views/pages/dashboard/boxes/views.ts` (add `feedPreview`)
- Modify: `app/src/constants/dashboard.ts` (registry)
- Modify: `app/src/views/pages/dashboard/Index.vue` (whole file)
- Delete: `app/src/components/service-components/dashboard/CountListCard.vue`, `app/tests/components/CountListCard.test.ts`, `app/src/components/service-components/charts/TotalRowCountCard.vue`
- Modify: `app/tests/api/dashboard.test.ts` (drop the `CountListCard` describe block and its now-unused imports)
- Modify: locales (remove the `dashboard.statistics` group from `en`/`tr`, then `pnpm i18n-sync`)
- Test: `app/tests/constants/dashboard.test.ts`, `app/tests/views/dashboard.test.ts`, `app/tests/views/dashboardBoxes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `DASHBOARD_BOXES: readonly DashboardBoxDef[]` in `DASHBOARD_BOX_IDS` order; `boxById(id: DashboardBoxId): DashboardBoxDef` (looks up `DASHBOARD_BOXES`). Components are `defineAsyncComponent(() => import('@/views/pages/dashboard/boxes/<Family>.vue'))`, so the registry imports no API code.
- Produces in `views.ts`: `feedPreview<Item extends { since: string | null }>(items: readonly Item[], limit: number): { since: string; items: Item[] }[]` — the first `limit` items in feed order, grouped by `since` in first-seen order.
- Produces: the grid container classes `w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start` (Tasks 5 and 6 reuse them); each box wrapper `div` carries `:data-box-id="id"`.

Registry (title, icon, permission, guideTask from today's `Index.vue`; all `size: 'narrow'`):

| id | title | icon | area | permission | guideTask | to |
|---|---|---|---|---|---|---|
| gates_team | dashboard.ops.gates_team | FLAG | projects | project_gate | close_gates | ops-project-list |
| gates_management | dashboard.ops.gates_management | BRIEFCASE | projects | project_gate | close_gates | ops-project-list |
| gates_customer | dashboard.ops.gates_customer | USER | projects | project_gate | close_gates | ops-project-list |
| tasks_overdue | dashboard.ops.tasks_overdue | EXCLAMATION_TRIANGLE | projects | project_task | close_tasks | — |
| tasks_due_soon | dashboard.ops.tasks_due_soon | CLOCK | projects | project_task | close_tasks | — |
| unsigned_skus | dashboard.ops.unsigned_skus | FILE_EDIT | products | product | sign_spec | `{ name: 'ops-product-list', query: { spec: 'false' } }` |
| incomplete_compliance | dashboard.ops.incomplete_compliance | SHIELD | products | product | complete_compliance | ops-product-list |
| po_action | dashboard.ops.po_action | SHOPPING_CART | supply | purchase_order | advance_po | ops-purchase-order-list |
| po_production | dashboard.ops.po_production | COG | supply | purchase_order | advance_po | ops-purchase-order-list |
| shipments_in_transit | dashboard.ops.shipments_in_transit | SEND | logistics | shipment | track_shipment | ops-shipment-list |
| shipments_late | dashboard.ops.shipments_late | EXCLAMATION_TRIANGLE | logistics | shipment | track_shipment | ops-shipment-list |
| incidents_open | dashboard.ops.incidents_open | EXCLAMATION_CIRCLE | incidents | incident | close_incident | ops-incident-list |
| change_requests_open | dashboard.ops.change_requests_open | SYNC | change_requests | change_request | decide_cr | ops-change-request-list |
| market_summary | dashboard.ops.market_summary | TABLE | market | market_cell | update_market | ops-market-list |
| notifications | dashboard.notifications.title | BELL | notifications | audit_log | — | branch-audit-log-list |

(Icons are `PrimeIcons.<NAME>`; a plain route name means `{ name: '<name>' }`.)

`NotificationsBox` (props `{ box: DashboardBoxDef; size: BoxSize }`): today's `useDashboardNotifications` moved in unchanged (loads on setup, so a hidden feed never fetches); `<DashboardBox :box :size :count="data.length">` with the default slot `{ limit, editing }` rendering today's grouped markup over `feedPreview(data, limit)`; while `editing`, the resource and user links render as plain `span`s. An empty feed shows "None" (spec: "Boş kutu kaybolmaz").

`Index.vue` (this task): drop all queries, builders and the three `TotalRowCountCard`s; keep the `dialogRef` padding; the grid above with, for each `box` of `DASHBOARD_BOXES` where `$can('read', box.permission)`, a wrapper `div :data-box-id="box.id"` holding `<component :is="box.component" :box :size="box.size" />`.

- [ ] **Step 1: Write the failing tests**

`app/tests/constants/dashboard.test.ts`:

```ts
const lookup = (tree: unknown, path: string): unknown =>
   path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
const routeNames = (routes: RouteRecordRaw[]): string[] =>
   routes.flatMap((r) => [...(typeof r.name === 'string' ? [r.name] : []), ...routeNames(r.children ?? [])]);

it("has unique ids in today's order", () => {
   expect(DASHBOARD_BOXES.map((b) => b.id)).toEqual(['gates_team','gates_management','gates_customer','tasks_overdue','tasks_due_soon','unsigned_skus','incomplete_compliance','po_action','po_production','shipments_in_transit','shipments_late','incidents_open','change_requests_open','market_summary','notifications']);
   expect(new Set(DASHBOARD_BOXES.map((b) => b.id)).size).toBe(DASHBOARD_BOXES.length);
});
it('gives every box a permission, a component, a narrow default, an area colour and an existing title', () => {
   for (const b of DASHBOARD_BOXES) {
      expect(b.permission).toMatch(/^[a-z_]+$/);
      expect(b.component).toBeTruthy();
      expect(b.size).toBe('narrow');
      expect(DASHBOARD_AREA_CLASSES[b.area]).toBeDefined();
      expect(lookup(en, b.title)).toEqual(expect.any(String));
   }
   expect(boxById('unsigned_skus').area).toBe('products');
   expect(boxById('incomplete_compliance').area).toBe('products');
});
it('points every "open all" route and guide task at something that exists', () => {
   const names = routeNames([...opsRoutes, ...branchRoutes]);
   const guideTasks = PAGE_GUIDES.dashboard.tasks.map((t) => t.id);
   for (const b of DASHBOARD_BOXES) {
      if (b.to) expect(names).toContain((b.to as { name: string }).name);
      if (b.guideTask) expect(guideTasks).toContain(b.guideTask);
   }
   expect(boxById('tasks_overdue').to).toBeUndefined();
});
```

(`opsRoutes`, `branchRoutes` are the default exports of `@/router/routes/ops` and `@/router/routes/branch`.)

Add to `app/tests/views/dashboardBoxes.test.ts`:

```ts
it('previews the first items of the feed, grouped by period', () => {
   const items = [{ id: 1, since: 'today' }, { id: 2, since: 'today' }, { id: 3, since: 'older' }, { id: 4, since: 'older' }];
   expect(feedPreview(items, 3)).toEqual([{ since: 'today', items: items.slice(0, 2) }, { since: 'older', items: [items[2]] }]);
});
```

`app/tests/views/dashboard.test.ts` (grows in Tasks 5–6):

```ts
import '../setup/mockMain';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/composables/useDialogRef', async () => ({ useDialogRef: () => (await import('vue')).ref(null) }));
vi.mock('@/constants/dashboard', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/constants/dashboard')>();
   const { defineComponent, inject, ref } = await import('vue');
   const Stub = defineComponent({
      props: ['box', 'size'],
      setup: () => ({ editing: inject(actual.DASHBOARD_EDITING, ref(false)) }),
      template: '<div data-test="box" :data-editing="String(editing)">{{ box.id }}:{{ size }}</div>'
   });
   const boxes = actual.DASHBOARD_BOXES.map((b) => ({ ...b, component: Stub }));
   return { ...actual, DASHBOARD_BOXES: boxes, boxById: (id: string) => boxes.find((b) => b.id === id)! };
});

const allow = (...subjects: string[]) => ability.update(subjects.map((subject) => ({ action: 'select', subject })));
const mountDashboard = async () => {
   document.body.innerHTML = '<span id="page-toolbar"></span>';
   const w = mount(Index, {
      attachTo: document.body,
      global: { plugins: [i18NPlugin, PrimeVue, ToastService, [abilitiesPlugin, ability, { useGlobalProperties: true }]] }
   });
   await flushPromises();
   return w;
};
const boxIds = (w: VueWrapper) => w.findAll('[data-test="box"]').map((b) => b.text().split(':')[0]);

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => { ability.update([]); vi.unstubAllGlobals(); });

it('shows the permitted boxes in the registry order', async () => {
   allow('project_gate', 'shipment');
   expect(boxIds(await mountDashboard())).toEqual(['gates_team','gates_management','gates_customer','shipments_in_transit','shipments_late']);
});
it('no longer shows the branch, user and role statistics', async () => {
   allow('tenant', 'user', 'role');
   const w = await mountDashboard();
   expect(boxIds(w)).toEqual([]);
   expect(w.text()).not.toContain('Branches');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/constants/dashboard.test.ts tests/views/dashboard.test.ts tests/views/dashboardBoxes.test.ts`
Expected: FAIL, `DASHBOARD_BOXES` / `boxById` / `feedPreview` not exported.

- [ ] **Step 3: Implement** the registry, `feedPreview`, `NotificationsBox.vue` and the new `Index.vue`; delete `CountListCard.vue`, `CountListCard.test.ts` and `TotalRowCountCard.vue`; trim `tests/api/dashboard.test.ts`; remove `dashboard.statistics` from `en` and `tr`; `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/constants tests/views/dashboard.test.ts tests/views/dashboardBoxes.test.ts tests/api/dashboard.test.ts tests/plugins/i18n && pnpm typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit** (with the Co-Authored-By trailer your session provides)

```bash
git add src/constants/dashboard.ts src/views/pages/dashboard src/plugins/i18n/locales tests/constants/dashboard.test.ts tests/views/dashboard.test.ts tests/views/dashboardBoxes.test.ts tests/api/dashboard.test.ts
git rm src/components/service-components/dashboard/CountListCard.vue tests/components/CountListCard.test.ts src/components/service-components/charts/TotalRowCountCard.vue
git commit -m "feat(dashboard): boxes come from one registry, the notification feed is a box, the statistics cards are gone"
```

---

### Task 4: The layout store `useDashboardLayout`

**Files:**
- Create: `app/src/store/dashboardLayout/index.ts`
- Test: `app/tests/store/dashboardLayout.test.ts`

**Interfaces:**
- Consumes: `DASHBOARD_BOX_IDS`, `boxById`, `layoutStorageKey`, `BoxSize`, `BOX_SIZES`, `DashboardBoxId` (Tasks 1, 3).
- Produces (`@/store/dashboardLayout`):
  - `type DashboardLayout = { order: DashboardBoxId[]; sizes: Partial<Record<DashboardBoxId, BoxSize>>; hidden: DashboardBoxId[] }`
  - `type CanSee = (id: DashboardBoxId) => boolean`
  - `defaultLayout(): DashboardLayout` → registry order, `sizes: {}`, `hidden: []`
  - `normalizeLayout(raw: unknown): DashboardLayout` (no permission logic)
  - `useDashboardLayout` (setup store): `saved: Ref<DashboardLayout>`, `draft: Ref<DashboardLayout | null>`, `editing: ComputedRef<boolean>`, `layout: ComputedRef<DashboardLayout>` (`draft ?? saved`), `load(userId: string | null): void`, `sizeOf(id): BoxSize`, `visibleBoxes(canSee: CanSee): { shown: DashboardBoxId[]; hidden: DashboardBoxId[] }`, `edit(): void`, `hide(id): void`, `unhide(id): void`, `setSize(id, size: BoxSize): void`, `reorder(shownIds: DashboardBoxId[], canSee: CanSee): void`, `move(id, step: -1 | 1, canSee: CanSee): void`, `resetToDefault(): void`, `save(): boolean`, `discard(): void`

Behaviour:
- `normalizeLayout`: non-object, array or `null` → default; `order`/`hidden` not arrays → `[]`; keep only registry ids, first occurrence wins; an id in `hidden` is removed from `order`; registry ids in neither list are appended to `order` in registry order; `sizes` keeps only registry ids whose value is in `BOX_SIZES` and differs from `boxById(id).size`.
- `load(userId)`: `draft = null`; reads `layoutStorageKey(userId)` inside `try/catch` (unparseable JSON or a throwing `getItem` → default, as in `@/store/guide`); `null` → default, nothing read.
- Mutators change `draft` only and are no-ops while `draft` is `null`:
  - `hide(id)`: removes `id` from `order`, appends it to `hidden` (no-op if already hidden).
  - `unhide(id)`: removes `id` from `hidden`, appends it to the end of `order`.
  - `setSize(id, size)`: sets `sizes[id]`, or deletes the key when `size === boxById(id).size`.
  - `reorder(shownIds, canSee)`: only when `shownIds` is the same set as `order.filter(canSee)`, else no-op; the slots in `order` held by seen ids are refilled with `shownIds` in their new sequence; unseen ids keep their slots.
  - `move(id, step, canSee)`: within `order.filter(canSee)`, swaps `id` with its neighbour at `step`, then calls `reorder`; at an end (or for an unseen id) does nothing.
  - `resetToDefault()`: `draft = defaultLayout()`.
- `visibleBoxes(canSee)`: `shown = layout.order.filter(canSee)`, `hidden = layout.hidden.filter(canSee)`.
- `save()`: `saved = normalizeLayout(draft)`, `draft = null`, writes `JSON.stringify(saved)` (the whole object, no merge) under the user's key; returns `false` when there is no user or `setItem` throws (layout still applied in memory), else `true`.
- `discard()`: `draft = null`.

- [ ] **Step 1: Write the failing tests** in `app/tests/store/dashboardLayout.test.ts`

```ts
const ALL = [...DASHBOARD_BOX_IDS];
const stored = new Map<string, string>();
const stubStorage = (overrides: Partial<Storage> = {}) =>
   vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: vi.fn((k: string, v: string) => void stored.set(k, v)),
      removeItem: (k: string) => void stored.delete(k),
      ...overrides
   });
const store = (userId: string, layout: unknown) => stored.set(`dashboard.layout.${userId}`, JSON.stringify(layout));
const read = (userId: string) => JSON.parse(stored.get(`dashboard.layout.${userId}`) ?? 'null');
const editing = (userId = 'u1') => { const s = useDashboardLayout(); s.load(userId); s.edit(); return s; };

beforeEach(() => { stored.clear(); stubStorage(); setActivePinia(createPinia()); });
afterEach(() => vi.unstubAllGlobals());

describe('normalizeLayout', () => {
   it('falls back to the default for nothing, null, an array, a number or a string', () => {
      for (const raw of [undefined, null, [], 3, 'x']) expect(normalizeLayout(raw)).toEqual(defaultLayout());
   });
   it('drops unknown and duplicate ids and appends new boxes visible', () => {
      expect(normalizeLayout({ order: ['old_box', 'po_action', 'po_action'], hidden: ['gone'] })).toEqual({
         order: ['po_action', ...ALL.filter((id) => id !== 'po_action')], sizes: {}, hidden: []
      });
   });
   it('takes a hidden id out of the order', () => {
      expect(normalizeLayout({ order: ALL, hidden: ['notifications'] })).toEqual({
         order: ALL.filter((id) => id !== 'notifications'), sizes: {}, hidden: ['notifications']
      });
   });
   it('keeps only valid sizes that differ from the default', () => {
      expect(normalizeLayout({ order: ALL, sizes: { po_action: 'wide', shipments_late: 'narrow', market_summary: 'huge', gone: 'wide' } }).sizes).toEqual({ po_action: 'wide' });
   });
   it('treats order and hidden that are not arrays as empty', () => {
      expect(normalizeLayout({ order: 'po_action', hidden: { a: 1 } })).toEqual(defaultLayout());
   });
});

describe('useDashboardLayout', () => {
   it('reads the layout of the signed-in user only', () => {
      store('u1', { order: ALL, hidden: ['notifications'] });
      const s = useDashboardLayout();
      s.load('u1');
      expect(s.layout.hidden).toEqual(['notifications']);
      s.load('u2');
      expect(s.layout).toEqual(defaultLayout());
   });
   it('opens on the default layout when storage is unreadable or blocked', () => {
      stored.set('dashboard.layout.u1', '{not json');
      const s = useDashboardLayout();
      s.load('u1');
      expect(s.layout).toEqual(defaultLayout());
      stubStorage({ getItem: () => { throw new Error('blocked'); } });
      s.load('u1');
      expect(s.layout).toEqual(defaultLayout());
      s.load(null);
      expect(s.layout).toEqual(defaultLayout());
   });
   it('edits a draft and leaves the saved layout alone until save', () => {
      const s = editing();
      s.hide('po_action');
      s.setSize('market_summary', 'wide');
      expect(s.saved.order).toContain('po_action');
      expect(s.layout.order).not.toContain('po_action');
      expect(s.layout.hidden).toEqual(['po_action']);
      expect(s.sizeOf('market_summary')).toBe('wide');
      s.setSize('market_summary', 'narrow');
      expect(s.layout.sizes).toEqual({});
   });
   it('unhides a box at the end of the order', () => {
      const s = editing();
      s.hide('gates_team');
      s.unhide('gates_team');
      expect(s.layout.order.at(-1)).toBe('gates_team');
      expect(s.layout.hidden).toEqual([]);
   });
   it('saves the whole layout under the user key, no merge with what another tab stored', () => {
      store('u1', { order: ALL, hidden: ['notifications'] });
      const s = editing();
      store('u1', { order: ALL, hidden: ['po_action'] }); // another tab saved meanwhile
      s.unhide('notifications');
      expect(s.save()).toBe(true);
      expect(read('u1')).toEqual({ order: ALL, sizes: {}, hidden: [] });
      expect(s.editing).toBe(false);
   });
   it('discard returns to the last saved layout', () => {
      const s = editing();
      s.hide('po_action');
      s.discard();
      expect(s.editing).toBe(false);
      expect(s.layout).toEqual(defaultLayout());
      expect(stored.size).toBe(0);
   });
   it('reset to default shows everything in registry order and writes only on save', () => {
      store('u1', { order: ALL, hidden: ['po_action'], sizes: { market_summary: 'wide' } });
      const s = editing();
      const before = stored.get('dashboard.layout.u1');
      s.resetToDefault();
      expect(s.layout).toEqual(defaultLayout());
      expect(stored.get('dashboard.layout.u1')).toBe(before);
      s.save();
      expect(read('u1')).toEqual(defaultLayout());
   });
   it('keeps the layout for the visit when storage refuses the write', () => {
      stubStorage({ setItem: () => { throw new Error('quota'); } });
      const s = editing();
      s.hide('po_action');
      expect(s.save()).toBe(false);
      expect(s.saved.hidden).toEqual(['po_action']);
      expect(s.editing).toBe(false);
   });
   it('does nothing outside edit mode', () => {
      const s = useDashboardLayout();
      s.load('u1');
      s.hide('po_action');
      s.setSize('po_action', 'wide');
      expect(s.layout).toEqual(defaultLayout());
   });
   it('moves past boxes the user cannot see and keeps their slots', () => {
      const canSee = (id: DashboardBoxId) => id !== 'gates_management';
      const s = editing();
      s.move('gates_team', 1, canSee);
      expect(s.layout.order.slice(0, 3)).toEqual(['gates_customer', 'gates_management', 'gates_team']);
      s.move('gates_customer', -1, canSee);
      expect(s.layout.order.slice(0, 3)).toEqual(['gates_customer', 'gates_management', 'gates_team']);
   });
   it('reorders the shown boxes and leaves the others in place', () => {
      const canSee = (id: DashboardBoxId) => id !== 'po_action';
      const s = editing();
      const shown = s.visibleBoxes(canSee).shown;
      s.reorder([shown[1], shown[0], ...shown.slice(2)], canSee);
      expect(s.layout.order.indexOf('po_action')).toBe(ALL.indexOf('po_action'));
      expect(s.layout.order.slice(0, 2)).toEqual(['gates_management', 'gates_team']);
      s.reorder(['gates_team'], canSee); // not the shown set: ignored
      expect(s.layout.order.slice(0, 2)).toEqual(['gates_management', 'gates_team']);
   });
   it('offers neither shown nor hidden boxes the user cannot see', () => {
      store('u1', { order: ALL, hidden: ['incidents_open'] });
      const s = useDashboardLayout();
      s.load('u1');
      const { shown, hidden } = s.visibleBoxes((id) => id !== 'incidents_open');
      expect(hidden).toEqual([]);
      expect(shown).not.toContain('incidents_open');
   });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/store/dashboardLayout.test.ts`
Expected: FAIL, `Failed to resolve import "@/store/dashboardLayout"`.

- [ ] **Step 3: Implement `app/src/store/dashboardLayout/index.ts`** per Interfaces and Behaviour; the user id lives in a closure variable set by `load`. Comment the storage `try/catch` blocks as `@/store/guide` does.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/store/dashboardLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (with the Co-Authored-By trailer your session provides)

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
- Consumes: `useDashboardLayout` (Task 4), `boxById` (Task 3), `useAuthStore().user` and `useAuthStore().accessReady(): Promise<void>` (the promise the router's auth guard awaits, `app/src/router/middlewares/before-each/auth/index.ts:33`), `useAbility()` from `@casl/vue`.
- Produces in `Index.vue`: `canSee: CanSee = (id) => ability.can('read', boxById(id).permission)`; `accessLoaded = ref(false)` set to `true` when `auth.accessReady()` resolves; `shown = computed(() => layout.visibleBoxes(canSee).shown)`; wrapper `:class="{ 'md:col-span-2': layout.sizeOf(id) === 'wide' }"` and `<component :is="boxById(id).component" :box="boxById(id)" :size="layout.sizeOf(id)" />`. Task 6 builds on these names.

Behaviour: `watch(() => auth.user?.id ?? null, (id) => layout.load(id), { immediate: true })`. Until `accessLoaded`, nothing renders in place of the grid. Then, with `shown` empty: `dashboard.layout.all_hidden` if some registry box passes `canSee`, else `dashboard.layout.no_boxes`, as a `text-muted-color` paragraph.

- [ ] **Step 1: Write the failing tests** (add to `app/tests/views/dashboard.test.ts`)

```ts
const auth = vi.hoisted(() => ({ value: null as unknown as { user: { id: string } | null; accessReady: () => Promise<void> } }));
vi.mock('@/store/auth', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/store/auth')>()),
   useAuthStore: () => auth.value
}));
const stored = new Map<string, string>();
const store = (userId: string, layout: unknown) => stored.set(`dashboard.layout.${userId}`, JSON.stringify(layout));
beforeEach(() => {
   auth.value = reactive({ user: { id: 'u1' }, accessReady: () => Promise.resolve() });
   stored.clear();
   vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: vi.fn((k: string, v: string) => void stored.set(k, v)), removeItem: vi.fn() });
});

it('shows the stored order, without hidden boxes, wide ones across two columns', async () => {
   allow('project_gate', 'shipment');
   store('u1', { order: ['shipments_late', 'gates_team'], hidden: ['gates_customer'], sizes: { shipments_late: 'wide' } });
   const w = await mountDashboard();
   expect(boxIds(w)).toEqual(['shipments_late', 'gates_team', 'gates_management', 'shipments_in_transit']);
   expect(w.get('[data-box-id="shipments_late"]').classes()).toContain('md:col-span-2');
   expect(w.get('[data-box-id="gates_team"]').classes()).not.toContain('md:col-span-2');
   expect(w.get('[data-box-id="shipments_late"]').text()).toBe('shipments_late:wide');
});
it("loads the new user's layout when the account changes", async () => {
   allow('project_gate');
   store('u2', { order: ['gates_customer'] });
   const w = await mountDashboard();
   expect(boxIds(w)[0]).toBe('gates_team');
   auth.value.user = { id: 'u2' };
   await flushPromises();
   expect(boxIds(w)[0]).toBe('gates_customer');
});
it('says when every box is hidden', async () => {
   allow('project_gate');
   store('u1', { order: [], hidden: ['gates_team', 'gates_management', 'gates_customer'] });
   expect((await mountDashboard()).text()).toContain(i18n.t('dashboard.layout.all_hidden'));
});
it('says the role has no box only once the access is loaded', async () => {
   let resolve!: () => void;
   auth.value.accessReady = () => new Promise<void>((r) => (resolve = r));
   const w = await mountDashboard();
   expect(w.text()).not.toContain(i18n.t('dashboard.layout.no_boxes'));
   expect(boxIds(w)).toEqual([]);
   resolve();
   await flushPromises();
   expect(w.text()).toContain(i18n.t('dashboard.layout.no_boxes'));
});
```

The Task 3 tests keep passing: `auth.value` defaults to user `u1` with resolved access.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboard.test.ts`
Expected: FAIL, the first test's order follows the registry, not storage.

- [ ] **Step 3: Implement** as in Interfaces; add the two keys to `en`/`tr`; `pnpm i18n-sync`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboard.test.ts tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 5: Commit** (with the Co-Authored-By trailer your session provides)

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
- Modify: `app/src/constants/guide.ts` (`PAGE_GUIDES.dashboard.tasks`)
- Modify: locales (remaining `dashboard.layout.*` keys and `guide.pages.dashboard.tasks.edit_dashboard` in `en`/`tr`; `pnpm i18n-sync`)
- Test: `app/tests/views/dashboard.test.ts`, `app/tests/constants/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 4 store API; Task 5 `canSee`, `shown`, `accessLoaded`; Task 3 grid classes; Task 1 `DASHBOARD_EDITING`.
- Produces:
  - `DashboardBoxEditBar.vue`: props `{ box: DashboardBoxDef; size: BoxSize; first: boolean; last: boolean }`; emits `hide: []`, `update:size: [BoxSize]`, `move: [-1 | 1]`. A row above the card: `button.dashboard-drag-handle` (`PrimeIcons.BARS`, `aria-label` `dashboard.layout.drag`, `cursor-grab`); `<SelectButton size="small" :model-value="size" :options="[{ value: 'narrow', label: t('dashboard.layout.size_narrow') }, { value: 'wide', label: t('dashboard.layout.size_wide') }]" option-label="label" option-value="value" :allow-empty="false" @update:model-value="(s) => emit('update:size', s)" />`; an icon button `PrimeIcons.EYE_SLASH` (`aria-label` `dashboard.layout.hide`); a `PrimeIcons.ELLIPSIS_V` button (`aria-label` `dashboard.layout.menu`) toggling `<Menu ref="menu" popup append-to="self" :model>` with `move_left` (`ARROW_LEFT`, `disabled: first`, emits `move` `-1`) and `move_right` (`ARROW_RIGHT`, `disabled: last`, emits `move` `1`). `SelectButton` and `Menu` are auto-registered by `PrimeVueResolver` (no import; `Menu` is new to `src`, so check it renders in the test).
  - `DashboardHiddenStrip.vue`: props `{ ids: DashboardBoxId[] }`, emits `unhide: [DashboardBoxId]`; title `dashboard.layout.hidden_title`, hint `hidden_hint`, one button per id (`boxById(id).icon` + `$t(boxById(id).title)`), `hidden_empty` when `ids` is empty.
  - `PAGE_GUIDES.dashboard.tasks` gains `task('edit_dashboard', 'read', 'tenant')` (last). `read` on `tenant` is held by every seeded role (owner and Branch manager: everything; Staff: `branch` group selects; Auditor: every select; management and coordinator: the `branch` group incl. `public.tenant` select) and has the label `fields.tenant` ("Branch" / "Şube").

`Index.vue` changes:
- `const canEdit = useMediaQuery('(min-width: 768px)')`; `watch(canEdit, (wide) => { if (!wide) layout.discard(); })`; `onBeforeUnmount(() => layout.discard())`; `provide(DASHBOARD_EDITING, computed(() => layout.editing))`.
- Toolbar `<Teleport to="#page-toolbar" :disabled="!!dialogRef">`, only when `canEdit && accessLoaded`: outside edit mode an outlined Button `dashboard.layout.edit` (`PrimeIcons.PENCIL`) → `layout.edit()`; in edit mode a text Button `reset` → `resetToDefault()`, an outlined secondary Button `discard` → `discard()`, a Button `save` → `if (!layout.save()) toast.add({ severity: 'warn', summary: t('dashboard.layout.not_persisted'), life: 5000 })`.
- The grid becomes `<draggable tag="div" class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start" :model-value="shown" :item-key="(id: DashboardBoxId) => id" handle=".dashboard-drag-handle" :disabled="!layout.editing" :animation="150" @update:model-value="(ids: DashboardBoxId[]) => layout.reorder(ids, canSee)">` with `#item="{ element: id, index }"` rendering the Task 5 wrapper; in edit mode the wrapper also gets `outline-dashed outline-2 outline-offset-2 outline-surface-300 rounded-xl` and the edit bar (`:first="index === 0" :last="index === shown.length - 1"`, `@hide="layout.hide(id)"`, `@update:size="(s) => layout.setSize(id, s)"`, `@move="(step) => layout.move(id, step, canSee)"`).
- Below the grid in edit mode: `<DashboardHiddenStrip :ids="layout.visibleBoxes(canSee).hidden" @unhide="layout.unhide" />`.

- [ ] **Step 1: Write the failing tests**

Add to `app/tests/constants/dashboard.test.ts`:

```ts
it('the dashboard guide explains the edit mode to every role', () => {
   expect(PAGE_GUIDES.dashboard.tasks.find((t) => t.id === 'edit_dashboard')).toEqual({ id: 'edit_dashboard', steps: 3, permission: { action: 'read', subject: 'tenant' } });
});
```

Add to `app/tests/views/dashboard.test.ts` (`tests/plugins/i18n/guide.test.ts` already checks the guide task's `title` and `steps.1..3` in `en` and `tr`):

```ts
import DashboardBoxEditBar from '@/views/pages/dashboard/DashboardBoxEditBar.vue';
const ui = vi.hoisted(() => ({ toast: vi.fn(), wideScreen: null as unknown as Ref<boolean> }));
vi.mock('@vueuse/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@vueuse/core')>()), useMediaQuery: () => ui.wideScreen }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: ui.toast }) }));
beforeEach(() => { ui.wideScreen = ref(true); });

const t = (key: string) => i18n.t(key);
const button = (label: string) =>
   [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined) => { expect(el).toBeDefined(); (el as HTMLElement).click(); await flushPromises(); };
const inBox = (w: VueWrapper, id: string) => w.get(`[data-box-id="${id}"]`);
const byLabel = (w: VueWrapper, id: string, label: string) => inBox(w, id).get(`button[aria-label="${label}"]`).element;
const menuItem = (w: VueWrapper, id: string, label: string) =>
   inBox(w, id).findAll('[role="menuitem"]').find((i) => i.text() === label)!;
const startEditing = async () => { allow('project_gate', 'purchase_order'); const w = await mountDashboard(); await click(button(t('dashboard.layout.edit'))); return w; };

it('opens the edit toolbar from Edit, and only from md up', async () => {
   const w = await startEditing();
   for (const label of ['dashboard.layout.save', 'dashboard.layout.discard', 'dashboard.layout.reset']) expect(button(t(label))).toBeDefined();
   expect(w.findAllComponents(DashboardBoxEditBar)).toHaveLength(boxIds(w).length);
   ui.wideScreen.value = false;
   await flushPromises();
   expect(button(t('dashboard.layout.edit'))).toBeUndefined();
   expect(button(t('dashboard.layout.save'))).toBeUndefined();
   expect(w.findAllComponents(DashboardBoxEditBar)).toHaveLength(0);
});
it('tells the boxes they are being edited, so their links are inert', async () => {
   const w = await startEditing();
   expect(w.findAll('[data-test="box"]').every((b) => b.attributes('data-editing') === 'true')).toBe(true);
   await click(button(t('dashboard.layout.discard')));
   expect(w.findAll('[data-test="box"]').every((b) => b.attributes('data-editing') === 'false')).toBe(true);
});
it('hides a box into the strip and brings it back at the end', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'gates_team', t('dashboard.layout.hide')));
   expect(boxIds(w)).not.toContain('gates_team');
   await click(button(t('dashboard.ops.gates_team')));
   expect(boxIds(w).at(-1)).toBe('gates_team');
});
it('switches a box to wide', async () => {
   const w = await startEditing();
   await click(inBox(w, 'po_action').findAll('button').find((b) => b.text() === t('dashboard.layout.size_wide'))!.element);
   expect(inBox(w, 'po_action').classes()).toContain('md:col-span-2');
   expect(inBox(w, 'po_action').get('[data-test="box"]').text()).toBe('po_action:wide');
});
it('moves a box with the menu, Move left disabled on the first box', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'gates_management', t('dashboard.layout.menu')));
   await click(menuItem(w, 'gates_management', t('dashboard.layout.move_left')).get('a, .p-menu-item-content').element);
   expect(boxIds(w).slice(0, 2)).toEqual(['gates_management', 'gates_team']);
   await click(byLabel(w, 'gates_management', t('dashboard.layout.menu')));
   expect(menuItem(w, 'gates_management', t('dashboard.layout.move_left')).attributes('aria-disabled')).toBe('true');
});
it('saves the layout and keeps it after a remount', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.save')));
   expect(JSON.parse(stored.get('dashboard.layout.u1')!).hidden).toEqual(['po_action']);
   expect(button(t('dashboard.layout.save'))).toBeUndefined();
   w.unmount();
   setActivePinia(createPinia());
   expect(boxIds(await mountDashboard())).not.toContain('po_action');
});
it('discard reverts to the saved layout', async () => {
   const w = await startEditing();
   const before = boxIds(w);
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.discard')));
   expect(boxIds(w)).toEqual(before);
   expect(stored.size).toBe(0);
});
it('does not offer a box the user cannot see in the strip', async () => {
   store('u1', { order: [], hidden: ['incidents_open'] });
   const w = await startEditing();
   expect(w.text()).toContain(t('dashboard.layout.hidden_empty'));
   expect(button(t('dashboard.ops.incidents_open'))).toBeUndefined();
});
it('warns when the browser refuses to save', async () => {
   const w = await startEditing();
   vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('blocked'); }, removeItem: vi.fn() });
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.save')));
   expect(ui.toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn', summary: t('dashboard.layout.not_persisted') }));
   expect(boxIds(w)).not.toContain('po_action');
});
it('drops an unsaved draft when the dashboard is left or the screen gets narrow', async () => {
   let w = await startEditing();
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   w.unmount();
   expect(useDashboardLayout().editing).toBe(false);
   expect(useDashboardLayout().layout.order).toContain('po_action');
   w = await mountDashboard();
   await click(button(t('dashboard.layout.edit')));
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   ui.wideScreen.value = false;
   await flushPromises();
   ui.wideScreen.value = true;
   await flushPromises();
   expect(boxIds(w)).toContain('po_action');
   expect(stored.size).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/views/dashboard.test.ts tests/constants/dashboard.test.ts`
Expected: FAIL, `Failed to resolve import "@/views/pages/dashboard/DashboardBoxEditBar.vue"` (and the guide task assertion fails).

- [ ] **Step 3: Install the dependency**

Run: `pnpm add vuedraggable@4.1.0 --save-exact`
Expected: `app/package.json` dependencies contain `"vuedraggable": "4.1.0"`.

- [ ] **Step 4: Implement** the two components, the `Index.vue` changes and the guide task; add the remaining `dashboard.layout.*` keys and the `edit_dashboard` copy to `en`/`tr` (Copy tables); `pnpm i18n-sync`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run tests/views/dashboard.test.ts tests/constants tests/plugins/i18n`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all exit 0.

Then `pnpm dev:vue`, sign in, and check at 1280 px, 900 px and 390 px: three/two/one columns; a wide box spans two of three, the full row, then one column; Edit is absent at 390 px; dragging by the handle reorders; a row click while editing does nothing; Save survives a reload; a second account in the same browser sees its own layout; with site data blocked the dashboard opens on the default and Save shows the warning; the page guide lists "Arrange your dashboard".

- [ ] **Step 7: Commit** (with the Co-Authored-By trailer your session provides)

```bash
git add package.json pnpm-lock.yaml src/views/pages/dashboard src/constants/guide.ts src/plugins/i18n/locales tests/views/dashboard.test.ts tests/constants/dashboard.test.ts
git commit -m "feat(dashboard): edit mode to reorder, hide and size the boxes, saved per user"
```
