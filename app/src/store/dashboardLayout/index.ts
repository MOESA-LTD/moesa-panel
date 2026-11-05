import {
   BOX_SIZES,
   boxById,
   DASHBOARD_BOX_IDS,
   layoutStorageKey,
   type BoxSize,
   type DashboardBoxId
} from '@/constants/dashboard';
import { defineStore } from 'pinia';
import { computed, ref, toRaw } from 'vue';

/** A user's dashboard: the shown boxes in order, their sizes when not the default, the hidden boxes. */
export type DashboardLayout = {
   order: DashboardBoxId[];
   sizes: Partial<Record<DashboardBoxId, BoxSize>>;
   hidden: DashboardBoxId[];
};

/** Whether the current user may see a box (its permission). */
export type CanSee = (id: DashboardBoxId) => boolean;

/** Every box shown, in registry order, at its default size. */
export const defaultLayout = (): DashboardLayout => ({
   order: [...DASHBOARD_BOX_IDS],
   sizes: {},
   hidden: []
});

const isBoxId = (value: unknown): value is DashboardBoxId =>
   (DASHBOARD_BOX_IDS as readonly unknown[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
   !!value && typeof value === 'object' && !Array.isArray(value);

/** The registry ids of a stored list, first occurrence wins; anything not a list counts as empty. */
const boxIds = (value: unknown): DashboardBoxId[] =>
   Array.isArray(value) ? [...new Set(value.filter(isBoxId))] : [];

/**
 * Makes a stored (or drafted) layout safe to render: unknown ids dropped, a hidden id taken out of
 * the order, boxes added since it was saved appended shown, sizes kept only when valid and not the
 * default. Permissions are not applied here.
 */
export const normalizeLayout = (raw: unknown): DashboardLayout => {
   if (!isRecord(raw)) return defaultLayout();
   const hidden = boxIds(raw.hidden);
   const order = boxIds(raw.order).filter((id) => !hidden.includes(id));
   for (const id of DASHBOARD_BOX_IDS) {
      if (!order.includes(id) && !hidden.includes(id)) order.push(id);
   }
   const sizes: DashboardLayout['sizes'] = {};
   if (isRecord(raw.sizes)) {
      for (const [id, size] of Object.entries(raw.sizes)) {
         if (isBoxId(id) && BOX_SIZES.includes(size as BoxSize) && size !== boxById(id).size) {
            sizes[id] = size as BoxSize;
         }
      }
   }
   return { order, sizes, hidden };
};

// Storage may be unavailable (private mode, blocked site data); the dashboard then opens on the
// default layout. One object per user; unreadable JSON counts as the default.
const readLayout = (userId: string): DashboardLayout => {
   try {
      const text = localStorage.getItem(layoutStorageKey(userId));
      return text === null ? defaultLayout() : normalizeLayout(JSON.parse(text));
   } catch {
      return defaultLayout();
   }
};

const writeLayout = (userId: string, layout: DashboardLayout): boolean => {
   try {
      localStorage.setItem(layoutStorageKey(userId), JSON.stringify(layout));
      return true;
   } catch {
      // Kept in memory only, for this visit.
      return false;
   }
};

/** The dashboard layout of the signed-in user: the saved one, and a draft while editing. */
export const useDashboardLayout = defineStore('dashboardLayout', () => {
   const saved = ref<DashboardLayout>(defaultLayout());
   const draft = ref<DashboardLayout | null>(null);
   // The user whose layout is loaded, as the last load recorded it.
   let userId: string | null = null;
   let loaded = false;

   const editing = computed(() => draft.value !== null);
   const layout = computed(() => draft.value ?? saved.value);

   /**
    * Reads the user's layout from storage. For the user already loaded it does nothing: the store
    * holds their layout, and after a refused write that in-memory layout is the only copy.
    */
   const load = (id: string | null) => {
      if (loaded && id === userId) return;
      loaded = true;
      userId = id;
      draft.value = null;
      saved.value = id === null ? defaultLayout() : readLayout(id);
   };

   const sizeOf = (id: DashboardBoxId): BoxSize => layout.value.sizes[id] ?? boxById(id).size;

   const visibleBoxes = (canSee: CanSee) => ({
      shown: layout.value.order.filter(canSee),
      hidden: layout.value.hidden.filter(canSee)
   });

   /** Starts a draft from the saved layout; a second call while editing keeps the draft. */
   const edit = () => {
      // structuredClone cannot clone the reactive proxy, only the plain object behind it.
      if (draft.value === null) draft.value = structuredClone(toRaw(saved.value));
   };

   const hide = (id: DashboardBoxId) => {
      const d = draft.value;
      if (!d || d.hidden.includes(id)) return;
      d.order = d.order.filter((other) => other !== id);
      d.hidden.push(id);
   };

   const unhide = (id: DashboardBoxId) => {
      const d = draft.value;
      if (!d || !d.hidden.includes(id)) return;
      d.hidden = d.hidden.filter((other) => other !== id);
      d.order.push(id);
   };

   const setSize = (id: DashboardBoxId, size: BoxSize) => {
      const d = draft.value;
      if (!d) return;
      if (size === boxById(id).size) delete d.sizes[id];
      else d.sizes[id] = size;
   };

   /**
    * Puts the boxes the user sees in the given sequence. The slots in the order held by seen boxes
    * are refilled in that sequence; boxes the user cannot see keep theirs.
    */
   const reorder = (shownIds: DashboardBoxId[], canSee: CanSee) => {
      const d = draft.value;
      if (!d) return;
      const seen = d.order.filter(canSee);
      const same =
         shownIds.length === seen.length &&
         new Set(shownIds).size === shownIds.length &&
         shownIds.every((id) => seen.includes(id));
      if (!same) return;
      let next = 0;
      d.order = d.order.map((id) => (canSee(id) ? shownIds[next++] : id));
   };

   /** Swaps a seen box with its seen neighbour before (-1) or after (1) it. */
   const move = (id: DashboardBoxId, step: -1 | 1, canSee: CanSee) => {
      const d = draft.value;
      if (!d) return;
      const seen = d.order.filter(canSee);
      const from = seen.indexOf(id);
      const to = from + step;
      if (from === -1 || to < 0 || to >= seen.length) return;
      [seen[from], seen[to]] = [seen[to], seen[from]];
      reorder(seen, canSee);
   };

   const resetToDefault = () => {
      if (draft.value) draft.value = defaultLayout();
   };

   /** Applies the draft and writes the whole layout; false when it could not be stored. */
   const save = (): boolean => {
      if (!draft.value) return false;
      saved.value = normalizeLayout(draft.value);
      draft.value = null;
      return userId !== null && writeLayout(userId, saved.value);
   };

   const discard = () => {
      draft.value = null;
   };

   return {
      saved,
      draft,
      editing,
      layout,
      load,
      sizeOf,
      visibleBoxes,
      edit,
      hide,
      unhide,
      setSize,
      reorder,
      move,
      resetToDefault,
      save,
      discard
   };
});
