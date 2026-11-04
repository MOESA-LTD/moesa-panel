import type { Membership } from '@/api/account/memberships';
import en from '@/plugins/i18n/locales/en/index.json';
import Memberships from '@/views/pages/account/sections/Memberships.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const memberships = ref<Membership[]>([]);
const isPending = ref(false);

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/account/memberships', () => ({
   useMyMemberships: () => ({ memberships, isPending })
}));

const row = (over: Partial<Membership> & Pick<Membership, 'id' | 'display_name'>): Membership => ({
   depth: 0,
   owned: false,
   roles: [],
   ...over
});

const mountSection = async () => {
   const wrapper = mount(Memberships, {
      global: { plugins: [i18NPlugin, PrimeVue], directives: { focustrap: {}, tooltip: {} } }
   });
   await flushPromises();
   return wrapper;
};

describe('account Memberships section', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      isPending.value = false;
      memberships.value = [
         row({ id: 'a', display_name: 'Atlas', owned: true, roles: ['admin'] }),
         row({ id: 'b', display_name: 'Atlas Izmir', depth: 1, roles: ['coordinator'] }),
         row({ id: 'c', display_name: 'Other Co' })
      ];
   });

   it('lists one row per membership in the given order, indenting by depth', async () => {
      const rows = (await mountSection()).findAll('[data-membership]');
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.text())).toEqual([
         expect.stringContaining('Atlas'),
         expect.stringContaining('Atlas Izmir'),
         expect.stringContaining('Other Co')
      ]);
      expect(rows[0]!.attributes('style')).toContain('padding-inline-start: 0rem');
      expect(rows[1]!.attributes('style')).toContain('padding-inline-start: 1.25rem');
   });

   it('shows the Owner badge on owned rows only', async () => {
      const rows = (await mountSection()).findAll('[data-membership]');
      expect(rows[0]!.text()).toContain('Owner');
      expect(rows[1]!.text()).not.toContain('Owner');
   });

   it('shows a chip per role name and No role when there is none', async () => {
      const rows = (await mountSection()).findAll('[data-membership]');
      expect(rows[0]!.text()).toContain('admin');
      expect(rows[1]!.text()).toContain('coordinator');
      expect(rows[1]!.text()).not.toContain('No role');
      expect(rows[2]!.text()).toContain('No role');
   });

   it('shows both Owner and No role for a branch reached only through ownership', async () => {
      memberships.value = [row({ id: 'o', display_name: 'Owned Branch', owned: true })];
      const text = (await mountSection()).get('[data-membership]').text();
      expect(text).toContain('Owner');
      expect(text).toContain('No role');
   });

   it('shows the empty text when there are no memberships', async () => {
      memberships.value = [];
      const wrapper = await mountSection();
      expect(wrapper.findAll('[data-membership]')).toHaveLength(0);
      expect(wrapper.text()).toContain(i18n.t('account.memberships.empty'));
   });

   it('shows a skeleton and no rows while pending', async () => {
      isPending.value = true;
      memberships.value = [];
      const wrapper = await mountSection();
      expect(wrapper.find('[data-pc-name="skeleton"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-membership]')).toHaveLength(0);
      expect(wrapper.text()).not.toContain(i18n.t('account.memberships.empty'));
   });
});
