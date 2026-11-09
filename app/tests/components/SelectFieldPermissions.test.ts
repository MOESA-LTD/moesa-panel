import '../setup/mockMain';
import SelectFieldPermissions from '@/components/service-components/select-permissions/SelectFieldPermissions.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import { ability, toAbilityRules } from '@/plugins/casl';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

const router = createRouter({
   history: createMemoryHistory(),
   routes: [{ path: '/', component: { template: '<div />' } }]
});

type Right = { resource_name: string; field: string; can_read: boolean; can_write: boolean };

const f = (field: string, group_name: string | null, cls = 'sensitive') => ({
   resource_name: 'public.product',
   field,
   class: cls,
   group_name
});
const FIELDS = [
   f('purchase_price', 'cost'),
   f('landed_cost_eur', 'cost'),
   f('company_price_eur', 'sell_price'),
   f('notes', 'internal_note'),
   f('sku', null, 'open')
];

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/useLookup', async () => {
   const { ref } = await import('vue');
   return {
      useLookup: (table: string) => ({
         data: ref(
            table === 'field_group'
               ? [
                    { id: 'cost', position: 1 },
                    { id: 'sell_price', position: 2 },
                    { id: 'internal_note', position: 3 }
                 ]
               : FIELDS
         ),
         suspense: () => Promise.resolve()
      })
   };
});

const grantAll = () =>
   ability.update(
      toAbilityRules(
         [
            { command: 'select', resource_name: 'public.product' },
            { command: 'update', resource_name: 'public.product' }
         ],
         []
      )
   );

const model = ref<Right[]>([]);
const mountWith = async (initial: Right[], foreignTenant = false) => {
   model.value = initial;
   const Host = defineComponent({
      setup: () => () =>
         h(Suspense, null, {
            default: () =>
               h(SelectFieldPermissions, {
                  modelValue: model.value,
                  foreignTenant,
                  'onUpdate:modelValue': (value: Right[] | undefined) => (model.value = value ?? [])
               })
         })
   });
   const w = mount(Host, {
      global: {
         plugins: [createPinia(), router, i18NPlugin, PrimeVue] as never,
         directives: { tooltip: Tooltip }
      }
   });
   await flushPromises();
   // Expand the product row.
   await w.find('.p-datatable-row-toggle-button').trigger('click');
   await flushPromises();
   return w;
};
const box = (w: Awaited<ReturnType<typeof mountWith>>, id: string) => w.find(`[data-test="${id}"]`);
const click = async (w: Awaited<ReturnType<typeof mountWith>>, id: string) => {
   await box(w, id).find('input').trigger('change');
   await flushPromises();
};

describe('SelectFieldPermissions', () => {
   beforeAll(() => i18n.setLocaleMessage('en', structuredClone(en)));
   beforeEach(grantAll);

   it('lists only sensitive product fields, grouped', async () => {
      const w = await mountWith([]);
      expect(box(w, 'field-group-public.product-cost-read').exists()).toBe(true);
      expect(box(w, 'field-public.product-sku-read').exists()).toBe(false);
   });

   it('group read toggle selects every field of the group', async () => {
      const w = await mountWith([]);
      await click(w, 'field-group-public.product-cost-read');
      expect(model.value).toEqual([
         {
            resource_name: 'public.product',
            field: 'purchase_price',
            can_read: true,
            can_write: false
         },
         {
            resource_name: 'public.product',
            field: 'landed_cost_eur',
            can_read: true,
            can_write: false
         }
      ]);
   });

   it('shows some when part of a group is selected', async () => {
      const w = await mountWith([
         {
            resource_name: 'public.product',
            field: 'purchase_price',
            can_read: true,
            can_write: false
         }
      ]);
      expect(box(w, 'field-group-public.product-cost-read').attributes('data-state')).toBe('some');
   });

   it('write implies read, and read off clears write', async () => {
      const w = await mountWith([]);
      await click(w, 'field-public.product-notes-write');
      expect(model.value).toEqual([
         { resource_name: 'public.product', field: 'notes', can_read: true, can_write: true }
      ]);
      await click(w, 'field-public.product-notes-read');
      expect(model.value).toEqual([]);
   });

   it('disables the toggles the editor does not hold', async () => {
      ability.update(
         toAbilityRules(
            [
               { command: 'select', resource_name: 'public.product' },
               { command: 'update', resource_name: 'public.product' }
            ],
            [
               {
                  resource_name: 'public.product',
                  field: 'notes',
                  can_read: true,
                  can_write: false
               },
               {
                  resource_name: 'public.product',
                  field: 'purchase_price',
                  can_read: false,
                  can_write: false
               }
            ]
         )
      );
      const w = await mountWith([]);
      const disabled = (id: string) =>
         box(w, id).find('input').attributes('disabled') !== undefined;
      expect(disabled('field-public.product-notes-read')).toBe(false);
      expect(disabled('field-public.product-notes-write')).toBe(true);
      expect(disabled('field-public.product-purchase_price-read')).toBe(true);
      // The cost group still holds one field the editor can read: it acts on that one.
      expect(disabled('field-group-public.product-cost-read')).toBe(false);
      expect(disabled('field-public.product-company_price_eur-write')).toBe(false);
   });

   it('a group toggle gives only the fields the editor holds, and then shows some', async () => {
      ability.update(
         toAbilityRules(
            [
               { command: 'select', resource_name: 'public.product' },
               { command: 'update', resource_name: 'public.product' }
            ],
            [
               {
                  resource_name: 'public.product',
                  field: 'purchase_price',
                  can_read: false,
                  can_write: false
               }
            ]
         )
      );
      const w = await mountWith([]);
      await click(w, 'field-group-public.product-cost-read');
      expect(model.value).toEqual([
         {
            resource_name: 'public.product',
            field: 'landed_cost_eur',
            can_read: true,
            can_write: false
         }
      ]);
      expect(box(w, 'field-group-public.product-cost-read').attributes('data-state')).toBe('some');
   });

   it('write needs the editor to hold read too', async () => {
      ability.update(
         toAbilityRules(
            [
               { command: 'select', resource_name: 'public.product' },
               { command: 'update', resource_name: 'public.product' }
            ],
            [{ resource_name: 'public.product', field: 'notes', can_read: false, can_write: true }]
         )
      );
      const w = await mountWith([]);
      expect(
         box(w, 'field-public.product-notes-write').find('input').attributes('disabled')
      ).toBeDefined();
   });

   it('disables every toggle for a role of another tenant', async () => {
      const w = await mountWith([], true);
      expect(
         box(w, 'field-public.product-notes-read').find('input').attributes('disabled')
      ).toBeDefined();
      expect(
         box(w, 'field-group-public.product-cost-write').find('input').attributes('disabled')
      ).toBeDefined();
   });
});
