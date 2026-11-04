import { DISMISSED_KEY, PAGE_GUIDES, type GuidePage } from '@/constants/guide';
import { defineStore } from 'pinia';
import { ref } from 'vue';

type Dismissed = Record<string, true>;

// Storage may be unavailable (private mode, blocked site data); the guide then opens once a session.
// One object under DISMISSED_KEY; unreadable JSON counts as nothing dismissed.
const readDismissed = (): Dismissed => {
   try {
      const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
         ? (parsed as Dismissed)
         : {};
   } catch {
      return {};
   }
};

const markDismissed = (route: string) => {
   try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...readDismissed(), [route]: true }));
   } catch {
      // Kept in memory only.
   }
};

/** The page guide side panel: which page it shows, and the task it opens on. */
export const useGuideStore = defineStore('guide', () => {
   const open = ref(false);
   const page = ref<GuidePage | null>(null);
   const focusTask = ref<string | null>(null);
   const shown = new Set<string>();

   const show = (guidePage: GuidePage, task?: string) => {
      page.value = guidePage;
      focusTask.value = task ?? null;
      open.value = true;
   };

   const hide = () => {
      open.value = false;
   };

   /** Opens the page's guide on the first visit of its route (spec M20), never again after. */
   const autoOpen = (guidePage: GuidePage) => {
      const route = PAGE_GUIDES[guidePage].route;
      if (shown.has(route) || readDismissed()[route]) return;
      shown.add(route);
      markDismissed(route);
      show(guidePage);
   };

   /**
    * Follows a navigation: an open panel switches to the new page's guide, or closes on a route
    * without one; then the new page's guide opens by itself on its first visit.
    */
   const followRoute = (guidePage: GuidePage | null) => {
      if (open.value) {
         if (guidePage) show(guidePage);
         else hide();
      }
      if (guidePage) autoOpen(guidePage);
   };

   return { open, page, focusTask, show, hide, autoOpen, followRoute };
});
