import { draftKey, loadDraft, removeDraft, saveDraft } from '@/lib/form/drafts';
import { useAuthStore } from '@/store/auth';
import { useEventListener } from '@vueuse/core';
import { isEqual } from 'lodash';
import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';

export type UseFormDraftOptions<T> = {
   /** Identifies the form and row, e.g. `role:<id>` or `role:new`. */
   form: string;
   values: Ref<T>;
   isDirty: Ref<boolean>;
   /** The values edits start from (the saved row, or the prefill of a new one). */
   base: () => T;
   /** Puts the draft's values into the form. */
   restore: (values: T) => void;
   /** Drafts are kept only while the form can be edited. */
   enabled?: MaybeRefOrGetter<boolean>;
};

const SAVE_DELAY = 300;

/**
 * Keeps a form's unsaved edits as a draft (see lib/form/drafts) so that reloading the page does not
 * lose them. `apply()` restores a draft once the form has its data; a clean form has no draft.
 */
export function useFormDraft<T>(options: UseFormDraftOptions<T>) {
   const auth = useAuthStore();

   // Fixed for this form: switching tenant or user must not move the draft elsewhere.
   const userId = auth.user?.id;
   const key = userId
      ? draftKey({ userId, tenantId: auth.currentTenant?.id ?? null }, options.form)
      : null;

   /** The form shows a restored draft (cleared once the form is clean again). */
   const restored = ref(false);
   /** The row changed since the draft was made, so saving would overwrite those changes. */
   const stale = ref(false);

   let timer: ReturnType<typeof setTimeout> | undefined;
   let discarded = false;

   function persist() {
      clearTimeout(timer);
      timer = undefined;
      // Signed out (or someone else signed in) meanwhile: nothing is written for them.
      if (!key || discarded || auth.user?.id !== userId) return;

      if (options.isDirty.value && toValue(options.enabled ?? true)) {
         saveDraft(key, { values: options.values.value, base: options.base() });
      } else {
         removeDraft(key);
      }
   }

   const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(persist, SAVE_DELAY);
   };

   watch(options.values, schedule, { deep: true });
   watch(options.isDirty, (dirty) => {
      if (dirty) return;
      restored.value = false;
      stale.value = false;
      persist();
   });

   // A reload or a closed tab must not drop the last edits still waiting for the timer.
   useEventListener(window, 'pagehide', () => timer && persist());
   onBeforeUnmount(() => timer && persist());

   /** Restores the draft of this form, if any, over the loaded values. */
   function apply() {
      if (!key || !toValue(options.enabled ?? true)) return;

      const draft = loadDraft<T>(key);
      if (!draft) return;

      options.restore(draft.values);
      restored.value = options.isDirty.value;
      stale.value = restored.value && !isEqual(draft.base, options.base());
      if (!restored.value) removeDraft(key);
   }

   /** Drops the draft for good, e.g. when the user leaves without saving. */
   function discard() {
      discarded = true;
      clearTimeout(timer);
      if (key) removeDraft(key);
   }

   return { restored, stale, apply, discard };
}
