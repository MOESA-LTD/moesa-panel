import { dismissedKey, PAGE_GUIDES, type GuidePage } from '@/constants/guide';
import { defineStore } from 'pinia';
import { ref } from 'vue';

// Storage may be unavailable (private mode, blocked site data); the guide then opens once a session.
const wasShown = (key: string): boolean => {
   try {
      return localStorage.getItem(key) !== null;
   } catch {
      return false;
   }
};

const markShown = (key: string) => {
   try {
      localStorage.setItem(key, '1');
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
      const key = dismissedKey(PAGE_GUIDES[guidePage].route);
      if (shown.has(key) || wasShown(key)) return;
      shown.add(key);
      markShown(key);
      show(guidePage);
   };

   return { open, page, focusTask, show, hide, autoOpen };
});
