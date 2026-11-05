import '../setup/mockMain';
import SelectPermissions from '@/components/service-components/select-permissions/SelectPermissions.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

type Permission = { id: string; resource_name: string; group_name: string; kind: string };

const p = (id: string, group_name: string, resource_name: string, kind: string): Permission => ({
   id,
   group_name,
   resource_name,
   kind
});

// Two groups of three resources each; not every resource has every kind.
const PERMISSIONS: Permission[] = [
   p('pr-r', 'product', 'product', 'read'),
   p('pr-c', 'product', 'product', 'create'),
   p('pr-m', 'product', 'product', 'modify'),
   p('pm-r', 'product', 'product_media', 'read'),
   p('pm-m', 'product', 'product_media', 'modify'),
   p('pp-r', 'product', 'product_price', 'read'),
   p('cu-r', 'customer', 'customer', 'read'),
   p('cu-c', 'customer', 'customer', 'create'),
   p('cu-m', 'customer', 'customer', 'modify'),
   p('cc-r', 'customer', 'customer_contact', 'read'),
   p('cc-c', 'customer', 'customer_contact', 'create'),
   p('cn-r', 'customer', 'customer_note', 'read')
];

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({ isSuperAdmin: true, subscription: null })
}));
vi.mock('@/api/useLookup', async () => {
   const { ref } = await import('vue');
   return {
      useLookup: () => ({ data: ref(PERMISSIONS), suspense: () => Promise.resolve() })
   };
});

const router = createRouter({
   history: createMemoryHistory(),
   routes: [{ path: '/', component: { template: '<div />' } }]
});

const byId = (...ids: string[]) => PERMISSIONS.filter(({ id }) => ids.includes(id));

const mountPicker = async (selected: Permission[] = []) => {
   const model = ref<Permission[]>(selected);
   const Host = defineComponent({
      setup: () => () =>
         h(Suspense, null, {
            default: () =>
               h(SelectPermissions, {
                  modelValue: model.value,
                  'onUpdate:modelValue': (value: Permission[]) => (model.value = value)
               })
         })
   });
   const wrapper = mount(Host, {
      global: { plugins: [createPinia(), router, i18NPlugin, PrimeVue] as never }
   });
   await flushPromises();
   return { wrapper, model };
};

const cell = (wrapper: VueWrapper, scope: string) =>
   wrapper.find(`[data-permission-cell="${scope}"]`);

const stateOf = (wrapper: VueWrapper, scope: string) => {
   const box = cell(wrapper, scope).find('.p-checkbox');
   if (box.attributes('data-p-indeterminate') === 'true') return 'some';
   return box.attributes('data-p-checked') === 'true' ? 'all' : 'none';
};

const click = async (wrapper: VueWrapper, scope: string) => {
   await cell(wrapper, scope).find('input').trigger('change');
   await flushPromises();
};

const ids = (model: { value: Permission[] }) => model.value.map(({ id }) => id).sort();

const expandGroup = async (wrapper: VueWrapper, group: string) => {
   const row = wrapper
      .findAll('tbody tr')
      .find((tr) => tr.find(`[data-permission-cell="group:${group}:read"]`).exists())!;
   await row.find('.p-datatable-row-toggle-button').trigger('click');
   await flushPromises();
};

describe('SelectPermissions', () => {
   beforeAll(() => i18n.setLocaleMessage('en', structuredClone(en)));

   it('shows a group cell as partial when only some of its permissions are selected', async () => {
      const { wrapper } = await mountPicker(byId('pr-r'));
      expect(stateOf(wrapper, 'group:product:read')).toBe('some');
      expect(stateOf(wrapper, 'group:customer:read')).toBe('none');
      expect(cell(wrapper, 'group:product:read').text()).toContain(
         i18n.t('component.select_permission.state.some')
      );
   });

   it('selects every permission of the group and kind from a partial cell', async () => {
      const { wrapper, model } = await mountPicker(byId('pr-r', 'cu-c'));
      await click(wrapper, 'group:product:read');
      expect(ids(model)).toEqual(['cu-c', 'pm-r', 'pp-r', 'pr-r']);
      expect(stateOf(wrapper, 'group:product:read')).toBe('all');
   });

   it('deselects every permission of the group and kind from a full cell', async () => {
      const { wrapper, model } = await mountPicker(byId('pr-m', 'pm-m', 'pm-r'));
      expect(stateOf(wrapper, 'group:product:modify')).toBe('all');
      await click(wrapper, 'group:product:modify');
      expect(ids(model)).toEqual(['pm-r']);
      expect(stateOf(wrapper, 'group:product:modify')).toBe('none');
   });

   it('lists the resources of an expanded group with a checkbox per kind they have', async () => {
      const { wrapper } = await mountPicker();
      expect(cell(wrapper, 'resource:product_media:read').exists()).toBe(false);
      await expandGroup(wrapper, 'product');

      const rows = wrapper.findAll('[data-permission-resource]');
      expect(rows.map((row) => row.attributes('data-permission-resource'))).toEqual([
         'product',
         'product_media',
         'product_price'
      ]);
      expect(cell(wrapper, 'resource:product_media:read').find('.p-checkbox').exists()).toBe(true);
      expect(cell(wrapper, 'resource:product_media:create').find('.p-checkbox').exists()).toBe(
         false
      );
      expect(cell(wrapper, 'resource:product_price:modify').find('.p-checkbox').exists()).toBe(
         false
      );
   });

   it('toggles exactly one permission from a resource checkbox', async () => {
      const { wrapper, model } = await mountPicker(byId('cu-r'));
      await expandGroup(wrapper, 'product');

      await click(wrapper, 'resource:product_media:modify');
      expect(ids(model)).toEqual(['cu-r', 'pm-m']);
      expect(stateOf(wrapper, 'resource:product_media:modify')).toBe('all');
      expect(stateOf(wrapper, 'group:product:modify')).toBe('some');

      await click(wrapper, 'resource:product_media:modify');
      expect(ids(model)).toEqual(['cu-r']);
   });

   it('keeps the column and all toggles tri-state', async () => {
      const { wrapper, model } = await mountPicker(byId('pr-r'));
      expect(stateOf(wrapper, 'kind:read')).toBe('some');
      expect(stateOf(wrapper, 'kind:create')).toBe('none');
      expect(stateOf(wrapper, 'all')).toBe('some');

      await click(wrapper, 'kind:read');
      expect(ids(model)).toEqual(['cc-r', 'cn-r', 'cu-r', 'pm-r', 'pp-r', 'pr-r']);
      expect(stateOf(wrapper, 'kind:read')).toBe('all');

      await click(wrapper, 'kind:read');
      expect(ids(model)).toEqual([]);
      expect(stateOf(wrapper, 'all')).toBe('none');

      await click(wrapper, 'all');
      expect(ids(model)).toEqual(PERMISSIONS.map(({ id }) => id).sort());
      expect(stateOf(wrapper, 'all')).toBe('all');

      await click(wrapper, 'all');
      expect(ids(model)).toEqual([]);
   });
});
