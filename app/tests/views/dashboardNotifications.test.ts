import '../setup/mockMain';
import { boxById, DASHBOARD_EDITING } from '@/constants/dashboard';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import NotificationsBox from '@/views/pages/dashboard/boxes/NotificationsBox.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

const feed = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock('@/lib/supabase', () => ({
   supabase: {
      from: () => {
         let since = '';
         const q = {
            select: () => q,
            eq: (_: string, value: string) => ((since = value), q),
            order: () => q,
            limit: () => q,
            throwOnError: () => q,
            then: (resolve: (r: { data: unknown[] }) => unknown) =>
               Promise.resolve({ data: feed.rows.filter((r) => r.since === since) }).then(resolve)
         };
         return q;
      }
   }
}));

const CustomLink = defineComponent({
   props: ['to'],
   template: '<a data-test="link"><slot :navigate="() => {}" /></a>'
});
const note = (id: number, since: string) => ({
   id,
   since,
   activity: 'updated',
   operation: 'UPDATE',
   table_name: 'product',
   resource_id: `r${id}`,
   new_data: null,
   old_data: null,
   user_id: 'u1',
   user_name: 'Ayse',
   created_at: ''
});
const mountFeed = async (editing = false) => {
   const w = mount(NotificationsBox, {
      props: { box: boxById('notifications'), size: 'narrow' },
      global: {
         plugins: [
            i18NPlugin,
            PrimeVue,
            ToastService,
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ],
         provide: { [DASHBOARD_EDITING as symbol]: ref(editing) },
         stubs: { CustomLink }
      }
   });
   await flushPromises();
   return w;
};

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
   feed.rows = [];
   ability.update([]);
});

it('stays on the dashboard and says "None" when the feed is empty', async () => {
   const w = await mountFeed();
   expect(w.text()).toContain(i18n.t('dashboard.ops.none'));
   expect(w.get('[data-test="box-badge"]').text()).toBe('0');
});
it('groups the first rows by period and badges the full count', async () => {
   feed.rows = [
      note(1, 'today'),
      note(2, 'today'),
      note(3, 'older'),
      note(4, 'older'),
      note(5, 'older')
   ];
   const w = await mountFeed();
   expect(w.findAll('li')).toHaveLength(4); // the narrow limit
   expect(w.text()).toContain(i18n.t('dashboard.notifications.today'));
   expect(w.text()).toContain(i18n.t('dashboard.notifications.older'));
   expect(w.get('[data-test="box-badge"]').text()).toBe('5');
});
it('renders the record and user links only when not editing', async () => {
   ability.update([
      { action: 'select', subject: 'product' },
      { action: 'select', subject: 'user' }
   ]);
   feed.rows = [note(1, 'today')];
   expect((await mountFeed(false)).findAll('li [data-test="link"]')).toHaveLength(2);
   const editing = await mountFeed(true);
   expect(editing.findAll('li [data-test="link"]')).toHaveLength(0);
   expect(editing.text()).toContain('Ayse');
});
