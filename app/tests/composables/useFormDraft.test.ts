import { useFormDraft } from '@/composables/useFormDraft';
import { draftKey, loadDraft, saveDraft } from '@/lib/form/drafts';
import { mount } from '@vue/test-utils';
import { isEqual } from 'lodash';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, reactive, ref, type Ref } from 'vue';

// The draft key comes from the signed-in user and tenant.
const auth = reactive({
   user: { id: 'u1' } as { id: string } | null,
   currentTenant: { id: 't1' } as { id: string } | null
});
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));

type Values = { name: string };
const KEY = draftKey({ userId: 'u1', tenantId: 't1' }, 'client:c1');

let values: Ref<Values>;
let initial: Ref<Values>;
let draft: ReturnType<typeof useFormDraft<Values>>;
let unmount: () => void;

function setup(enabled = true) {
   values = ref({ name: 'Ada' });
   initial = ref({ name: 'Ada' });
   const isDirty = computed(() => !isEqual(values.value, initial.value));

   const wrapper = mount(
      defineComponent({
         setup() {
            draft = useFormDraft({
               form: 'client:c1',
               values,
               isDirty,
               base: () => initial.value,
               restore: (next) => (values.value = { ...next }),
               enabled
            });
            return () => h('div');
         }
      })
   );
   unmount = () => wrapper.unmount();
}

const tick = () => vi.advanceTimersByTimeAsync(400);

beforeEach(() => {
   vi.useFakeTimers();
   sessionStorage.clear();
   auth.user = { id: 'u1' };
   auth.currentTenant = { id: 't1' };
});
afterEach(() => vi.useRealTimers());

describe('useFormDraft', () => {
   it('keeps edits as a draft, with the values they started from', async () => {
      setup();
      values.value.name = 'Ada L.';
      await tick();

      expect(loadDraft(KEY)).toMatchObject({ values: { name: 'Ada L.' }, base: { name: 'Ada' } });
   });

   it('drops the draft when the form is clean again (saved or reset)', async () => {
      setup();
      values.value.name = 'Ada L.';
      await tick();

      values.value = { name: 'Ada' };
      await tick();

      expect(loadDraft(KEY)).toBeNull();
   });

   it('restores a draft over the loaded values', () => {
      saveDraft(KEY, { values: { name: 'Ada L.' }, base: { name: 'Ada' } });
      setup();
      draft.apply();

      expect(values.value.name).toBe('Ada L.');
      expect(draft.restored.value).toBe(true);
      expect(draft.stale.value).toBe(false);
   });

   it('tells when the row changed since the draft was made', () => {
      saveDraft(KEY, { values: { name: 'Ada L.' }, base: { name: 'Old name' } });
      setup();
      draft.apply();

      expect(draft.stale.value).toBe(true);
   });

   it('does not keep or restore drafts of a read-only form', async () => {
      saveDraft(KEY, { values: { name: 'Ada L.' }, base: { name: 'Ada' } });
      setup(false);
      draft.apply();
      expect(values.value.name).toBe('Ada');

      values.value.name = 'Changed';
      await tick();
      expect(loadDraft(KEY)).toBeNull();
   });

   it('writes pending edits when the page is hidden (reload, closed tab)', () => {
      setup();
      values.value.name = 'Ada L.';
      window.dispatchEvent(new Event('pagehide'));

      expect(loadDraft(KEY)?.values).toEqual({ name: 'Ada L.' });
   });

   it('leaving without saving drops the draft, even with edits still pending', async () => {
      setup();
      values.value.name = 'Ada L.';
      await tick();
      values.value.name = 'Ada Lovelace';

      draft.discard();
      unmount();
      await tick();

      expect(loadDraft(KEY)).toBeNull();
   });

   it('writes nothing once the user signed out', async () => {
      setup();
      auth.user = null;
      values.value.name = 'Ada L.';
      await tick();

      expect(sessionStorage.length).toBe(0);
   });

   it('keeps the draft under the tenant it was started in', async () => {
      setup();
      auth.currentTenant = { id: 't2' };
      values.value.name = 'Ada L.';
      await tick();

      expect(loadDraft(KEY)?.values).toEqual({ name: 'Ada L.' });
   });
});
