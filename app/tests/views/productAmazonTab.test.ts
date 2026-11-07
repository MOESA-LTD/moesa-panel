import '../setup/mockMain';
import type { AmazonIssue, Definition } from '@/api/amazon';
import AmazonAttributeForm from '@/components/service-components/amazon-form/AmazonAttributeForm.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import Amazon from '@/views/pages/ops/product/tabs/Amazon.vue';
import {
   toPropertyGroups,
   type Attributes,
   type ProvidedAttributes
} from '@edge-shared/listingCompleteness';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { enableAutoUnmount, flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, toValue, type MaybeRefOrGetter } from 'vue';

const seed = (file: string) =>
   JSON.parse(
      readFileSync(resolve(__dirname, '../../../supabase/seed_files/amazon', file), 'utf8')
   );
const fixture = seed('LUGGAGE.A1PA6795UKMFR9.en_GB.json');
const story = seed('LUGGAGE.attributes.json') as Attributes;

const definition: Definition = {
   marketplace_id: fixture.marketplaceIds[0],
   product_type: fixture.productType,
   locale: fixture.locale,
   version: fixture.productTypeVersion.version,
   display_name: fixture.displayName,
   schema: fixture.schema,
   property_groups: toPropertyGroups(fixture.propertyGroups),
   fetched_at: '2026-11-06T00:00:00Z'
};

const MEDIA_ID = '5eed0009-0000-4000-8000-000000000001';

const api = vi.hoisted(() => ({
   product: null as unknown,
   save: vi.fn(),
   cells: [] as unknown[],
   submissions: [] as unknown[],
   definition: null as unknown,
   route: { query: {} as Record<string, string> },
   submissionsFor: null as null | (() => string | null)
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => api.route
}));
vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({ currentTenant: { id: 't1' }, canIn: () => true })
}));
vi.mock('@/api/media', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/media')>()),
   mediaResource: { useOne: () => ({ data: ref(null) }) }
}));
vi.mock('@/api/media/library', () => ({
   useMediaLibrary: () => ({
      data: ref({ pages: [[]] }),
      hasNextPage: ref(false),
      isFetching: ref(false),
      fetchNextPage: vi.fn()
   })
}));
vi.mock('@/api/media/signedUrls', async () => {
   const { computed } = await import('vue');
   return { useSignedUrl: () => computed(() => undefined) };
});
// Reactive stand-ins, so a test can let the product or the cells arrive after the tab mounted.
const productRef = ref<unknown>(null);
const cellsRef = ref<unknown[]>([]);

vi.mock('@/api/product', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/product')>()),
   productResource: {
      useOne: () => ({ data: productRef }),
      useSave: () => ({ mutateAsync: api.save, isPending: ref(false) })
   }
}));
vi.mock('@/api/amazon', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/amazon')>()),
   useProductAmazonCells: () => ({ data: cellsRef }),
   useProductTypeSearch: () => ({ data: ref([]), isFetching: ref(false) }),
   useDefinition: () => ({ data: ref(api.definition), isFetching: ref(false), error: ref(null) }),
   useListingSubmissions: (cellId: MaybeRefOrGetter<string | null>) => {
      api.submissionsFor = () => toValue(cellId);
      return { data: ref(api.submissions) };
   }
}));

const plugins = [i18NPlugin, PrimeVue, ToastService];

// The stand-in refs are shared: an earlier test's tab must not react to a later test's changes.
enableAutoUnmount(afterEach);

type FormProps = {
   modelValue?: Attributes;
   languageTag?: string;
   provided?: ProvidedAttributes;
   issues?: AmazonIssue[];
   productId?: string;
};

const NOTHING: ProvidedAttributes = { attributes: {}, sources: {} };
/** The server fills the identifier from the GTIN. */
const GTIN: ProvidedAttributes = {
   attributes: {},
   sources: { externally_assigned_product_identifier: 'server' }
};
const MARKETPLACE = 'A1PA6795UKMFR9';
/** The product card's brand, as providedAttributes derives it for de_DE. */
const BRAND: ProvidedAttributes = {
   attributes: { brand: [{ value: 'OKAEI', language_tag: 'de_DE', marketplace_id: MARKETPLACE }] },
   sources: { ...GTIN.sources, brand: 'product.brand' }
};

const mountForm = (props: FormProps = {}) =>
   mount(AmazonAttributeForm, {
      attachTo: document.body,
      props: {
         definition,
         modelValue: {},
         languageTag: 'de_DE',
         provided: NOTHING,
         ...props
      },
      global: { plugins, stubs: { RouterLink: RouterLinkStub } }
   });

type Wrapper = ReturnType<typeof mountForm>;

const groupButton = (wrapper: Wrapper, key: string) => wrapper.get(`[data-group="${key}"]`);

const lastModel = (wrapper: Wrapper) =>
   wrapper.emitted('update:modelValue')!.at(-1)![0] as Attributes;

const inputValue = (wrapper: Pick<Wrapper, 'get'>, name: string) =>
   (wrapper.get(`[data-field="${name}"] input`).element as HTMLInputElement).value;

describe('AmazonAttributeForm', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      document.body.innerHTML = '';
   });

   it('lists the schema groups with their missing counts', () => {
      const wrapper = mountForm();
      const expected = {
         product_identity: ['Product Identity', '3'],
         offer: ['Offer', '1'],
         images: ['Images', '1'],
         product_details: ['Product Details', '1']
      };
      for (const [key, [title, count]] of Object.entries(expected)) {
         const button = groupButton(wrapper, key);
         expect(button.text()).toContain(title);
         expect(button.get('[data-missing]').text()).toBe(count);
      }
      expect(groupButton(wrapper, 'variations').text()).toContain('Variations');
      expect(groupButton(wrapper, 'variations').find('[data-missing]').exists()).toBe(false);
   });

   it('next missing opens the first missing group and focuses its field', async () => {
      const filled: Attributes = {
         item_name: [{ value: 'Mop', language_tag: 'de_DE' }],
         brand: [{ value: 'OKAEI', language_tag: 'de_DE' }]
      };
      const wrapper = mountForm({
         modelValue: filled,
         provided: GTIN
      });
      expect(wrapper.find('[data-field="condition_type"]').exists()).toBe(false);

      await wrapper.get('[data-action="next-missing"]').trigger('click');
      await flushPromises();

      expect(groupButton(wrapper, 'offer').attributes('aria-current')).toBe('true');
      const field = wrapper.get('[data-field="condition_type"]').element;
      expect(field.contains(document.activeElement)).toBe(true);
   });

   it('shows required, conditional and optional badges', async () => {
      const wrapper = mountForm({ modelValue: { parentage_level: [{ value: 'child' }] } });
      const badge = (name: string) => wrapper.get(`[data-field="${name}"] [data-badge]`);

      expect(badge('item_name').attributes('data-badge')).toBe('required');
      expect(badge('item_name').text()).toBe('Required');

      await groupButton(wrapper, 'variations').trigger('click');
      expect(badge('child_parent_sku_relationship').attributes('data-badge')).toBe('conditional');

      await groupButton(wrapper, 'product_details').trigger('click');
      expect(badge('color').attributes('data-badge')).toBe('optional');
   });

   it('writes a language-tagged value in the chosen language only', async () => {
      const english: Attributes = { item_name: [{ value: 'Mop', language_tag: 'en_GB' }] };
      const wrapper = mountForm({ modelValue: english, languageTag: 'en_GB' });
      expect(inputValue(wrapper, 'item_name')).toBe('Mop');

      await wrapper.setProps({ languageTag: 'de_DE' });
      expect(inputValue(wrapper, 'item_name')).toBe('');
      await wrapper.get('[data-field="item_name"] input').setValue('Mop');

      expect(lastModel(wrapper).item_name).toEqual([
         { value: 'Mop', language_tag: 'en_GB' },
         { value: 'Mop', language_tag: 'de_DE' }
      ]);
   });

   it('the completeness bar shows filled of required', async () => {
      const wrapper = mountForm({
         modelValue: story,
         provided: GTIN
      });
      expect(wrapper.get('[data-completeness]').text()).toContain('6 / 6');
      // Nothing is written in English yet: item name, brand and bullet points are missing there.
      await wrapper.get('[data-language]').trigger('click');
      await flushPromises();
      const missingIn = (tag: string) =>
         document.querySelector(`[data-language-missing="${tag}"]`)?.textContent ?? null;
      expect(missingIn('en_GB')).toBe('3');
      expect(missingIn('de_DE')).toBeNull();
   });

   it('an image slot stores a media reference', async () => {
      const wrapper = mountForm();
      await groupButton(wrapper, 'images').trigger('click');
      await wrapper
         .get('[data-field="main_product_image_locator"] [data-action="image-pick"]')
         .trigger('click');
      const picker = wrapper.findAllComponents(MediaPickerDialog)[0]!;
      picker.vm.$emit('picked', [{ id: MEDIA_ID, kind: 'image' }]);
      await nextTick();

      expect(lastModel(wrapper).main_product_image_locator).toEqual([
         { media_location: `media:${MEDIA_ID}` }
      ]);
   });

   it('shows a json field and refuses text that is not JSON', async () => {
      const wrapper = mountForm();
      await groupButton(wrapper, 'offer').trigger('click');
      const textarea = wrapper.get('[data-field="purchasable_offer"] textarea');
      await textarea.setValue('{ nope');
      expect(wrapper.get('[data-field="purchasable_offer"]').text()).toContain(
         'This is not valid JSON.'
      );
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      await textarea.setValue('{"currency":"EUR"}');
      expect(lastModel(wrapper).purchasable_offer).toEqual([{ currency: 'EUR' }]);
   });

   it('shows an Amazon issue verbatim and links it to its field', async () => {
      const wrapper = mountForm({
         issues: [
            {
               code: '90220',
               message: "'item_package_weight' is required but not supplied.",
               severity: 'ERROR',
               attributeNames: ['item_package_weight']
            },
            {
               code: '18027',
               message: 'The image could not be downloaded.',
               severity: 'ERROR',
               attributeNames: []
            }
         ]
      });
      const issues = wrapper.findAll('[data-issue]');
      expect(issues[0]!.text()).toContain("'item_package_weight' is required but not supplied.");
      expect(issues[1]!.text()).toContain('The image could not be downloaded.');
      expect(issues[1]!.find('[data-issue-link]').exists()).toBe(false);

      await issues[0]!.get('[data-issue-link]').trigger('click');
      await flushPromises();

      expect(groupButton(wrapper, 'product_details').attributes('aria-current')).toBe('true');
      const field = wrapper.get('[data-field="item_package_weight"]').element;
      expect(field.contains(document.activeElement)).toBe(true);
   });

   it('a boolean can be cleared back to unset', async () => {
      const wrapper = mountForm({ modelValue: { is_fragile: [{ value: false }] } });
      await groupButton(wrapper, 'product_details').trigger('click');
      await wrapper.get('[data-field="is_fragile"] [data-action="boolean-clear"]').trigger('click');
      expect(lastModel(wrapper)).toEqual({});
      expect(wrapper.find('[data-field="color"] [data-action="boolean-clear"]').exists()).toBe(
         false
      );
   });

   it('gives each entry of a multi-entry field its own input id', async () => {
      const wrapper = mountForm({
         modelValue: {
            bullet_point: [
               { value: 'One', language_tag: 'de_DE' },
               { value: 'Two', language_tag: 'de_DE' }
            ]
         }
      });
      await groupButton(wrapper, 'product_details').trigger('click');
      const ids = wrapper
         .findAll('[data-field="bullet_point"] input')
         .map((input) => input.attributes('id'));
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
   });

   it('shows a derived attribute read-only with its product card source', () => {
      const wrapper = mountForm({ provided: BRAND, productId: 'p1' });
      const field = wrapper.get('[data-field="brand"]');
      expect(inputValue(wrapper, 'brand')).toBe('OKAEI');
      expect(field.get('input').attributes('disabled')).toBeDefined();
      expect(field.get('[data-derived]').text()).toBe('From the product');
      expect(field.get('[data-derived-source]').text()).toBe('Product card › Brand');
      expect(field.getComponent(RouterLinkStub).props('to')).toEqual({
         name: 'ops-product-manage-general',
         params: { id: 'p1' }
      });
      // Derived counts as filled: the identity group misses only the item name.
      expect(groupButton(wrapper, 'product_identity').get('[data-missing]').text()).toBe('1');
   });

   it('overrides a derived attribute for the listing, starting from the product value', async () => {
      const wrapper = mountForm({ provided: BRAND });
      await wrapper.get('[data-action="derived-override"]').trigger('click');
      expect(lastModel(wrapper).brand).toEqual([{ value: 'OKAEI', language_tag: 'de_DE' }]);

      await wrapper.setProps({ modelValue: lastModel(wrapper) });
      const input = wrapper.get('[data-field="brand"] input');
      expect(input.attributes('disabled')).toBeUndefined();
      await input.setValue('OKAEI Pro');
      expect(lastModel(wrapper).brand).toEqual([{ value: 'OKAEI Pro', language_tag: 'de_DE' }]);
      expect(wrapper.find('[data-action="derived-override"]').exists()).toBe(false);
   });

   it('goes back to the product value by removing the override in the language', async () => {
      const overridden: Attributes = {
         brand: [
            { value: 'OKAEI Pro', language_tag: 'de_DE' },
            { value: 'OKAEI UK', language_tag: 'en_GB' }
         ]
      };
      const wrapper = mountForm({ modelValue: overridden, provided: BRAND });
      expect(inputValue(wrapper, 'brand')).toBe('OKAEI Pro');
      await wrapper.get('[data-action="derived-reset"]').trigger('click');
      expect(lastModel(wrapper).brand).toEqual([{ value: 'OKAEI UK', language_tag: 'en_GB' }]);

      await wrapper.setProps({ modelValue: lastModel(wrapper) });
      expect(inputValue(wrapper, 'brand')).toBe('OKAEI');
      expect(wrapper.get('[data-field="brand"] input').attributes('disabled')).toBeDefined();
   });

   it('offers no override without the right to edit', () => {
      const wrapper = mountForm({ provided: BRAND });
      expect(wrapper.find('[data-action="derived-override"]').exists()).toBe(true);
      const readonly = mount(AmazonAttributeForm, {
         props: {
            definition,
            modelValue: {},
            languageTag: 'de_DE',
            provided: BRAND,
            readonly: true
         },
         global: { plugins, stubs: { RouterLink: RouterLinkStub } }
      });
      expect(readonly.find('[data-action="derived-override"]').exists()).toBe(false);
      expect(readonly.find('[data-field="brand"] [data-derived]').exists()).toBe(true);
   });

   it('is read-only without the right to edit', () => {
      const wrapper = mount(AmazonAttributeForm, {
         props: {
            definition,
            modelValue: {},
            languageTag: 'de_DE',
            provided: NOTHING,
            readonly: true
         },
         global: { plugins, stubs: { RouterLink: RouterLinkStub } }
      });
      expect(wrapper.get('[data-field="item_name"] input').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-action="next-missing"]').exists()).toBe(true);
   });
});

describe('the product Amazon tab', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   beforeEach(() => {
      document.body.innerHTML = '';
      api.save.mockReset();
      api.save.mockImplementation(async (row: object) => ({ ...(api.product as object), ...row }));
      api.cells = [];
      api.submissions = [];
      api.definition = definition;
      api.route = { query: {} };
      api.product = {
         id: 'p1',
         tenant_id: 't1',
         customer_id: 'c1',
         gtin: '4006381333931',
         amazon_product_type: 'LUGGAGE',
         amazon_schema_version: definition.version,
         listing_attributes: story
      };
   });

   const mountTab = () => {
      productRef.value = api.product;
      cellsRef.value = api.cells;
      return mount(Amazon, {
         attachTo: document.body,
         props: { id: 'p1' },
         global: { plugins, stubs: { RouterLink: RouterLinkStub } }
      });
   };

   it('shows the schema-moved notice', async () => {
      api.product = { ...(api.product as object), amazon_schema_version: 'OLD' };
      const wrapper = mountTab();
      await flushPromises();

      expect(wrapper.get('[data-schema-moved]').text()).toContain('UHqSqmb4FNUk=');
      // The stored values stay in the form.
      expect(inputValue(wrapper, 'item_name')).toBe('Baumwoll-Wischmopp-Bezug 40 cm, 2er-Pack');
   });

   it('does not show the notice on the same version', async () => {
      const wrapper = mountTab();
      await flushPromises();
      expect(wrapper.find('[data-schema-moved]').exists()).toBe(false);
   });

   it('saves the product type, the schema version and the Amazon-shaped attributes', async () => {
      const wrapper = mountTab();
      await flushPromises();

      await wrapper.get('[data-field="item_name"] input').setValue('Mop');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(api.save).toHaveBeenCalledWith({
         id: 'p1',
         amazon_product_type: 'LUGGAGE',
         amazon_schema_version: 'UHqSqmb4FNUk=',
         listing_attributes: {
            ...story,
            item_name: [{ value: 'Mop', language_tag: 'de_DE' }]
         }
      });
   });

   it('derives the brand from the product card and saves only an override', async () => {
      const unbranded: Attributes = { ...story };
      delete unbranded.brand;
      api.product = {
         ...(api.product as object),
         brand: 'OKAEI',
         pack_qty: 2,
         listing_attributes: unbranded
      };
      const wrapper = mountTab();
      await flushPromises();

      expect(inputValue(wrapper, 'brand')).toBe('OKAEI');
      expect(wrapper.find('[data-field="brand"] [data-derived]').exists()).toBe(true);
      // The story without its brand is complete: the card provides it.
      expect(wrapper.get('[data-completeness]').text()).toContain('6 / 6');

      await wrapper.get('[data-group="product_details"]').trigger('click');
      expect(inputValue(wrapper, 'number_of_items')).toBe('2');
      await wrapper
         .get('[data-field="number_of_items"] [data-action="derived-override"]')
         .trigger('click');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(api.save).toHaveBeenCalledWith({
         id: 'p1',
         amazon_product_type: 'LUGGAGE',
         amazon_schema_version: 'UHqSqmb4FNUk=',
         listing_attributes: { ...unbranded, number_of_items: [{ value: 2 }] }
      });
   });

   it('opens the field named in the route', async () => {
      api.route = { query: { field: 'color' } };
      const wrapper = mountTab();
      await flushPromises();
      const field = wrapper.get('[data-field="color"]').element;
      expect(field.contains(document.activeElement)).toBe(true);
   });

   it('shows the issues of the latest submission of the first Amazon cell', async () => {
      api.cells = [
         { id: 'cell1', country: 'DE', listing_language: null, price: 19.9, currency: 'EUR' }
      ];
      api.submissions = [
         {
            id: 's2',
            issues: [
               { code: '1', message: 'Newest issue', severity: 'ERROR', attributeNames: ['color'] }
            ]
         },
         {
            id: 's1',
            issues: [{ code: '0', message: 'Old issue', severity: 'ERROR', attributeNames: [] }]
         }
      ];
      const wrapper = mountTab();
      await flushPromises();
      expect(wrapper.text()).toContain('Newest issue');
      expect(wrapper.text()).not.toContain('Old issue');
   });

   it('takes the stored values of a product that loads after the tab, and saves them all', async () => {
      const stored = {
         ...(api.product as { listing_attributes: Attributes }).listing_attributes,
         item_name: [
            { value: 'Mop', language_tag: 'en_GB' },
            { value: 'Wischmopp', language_tag: 'de_DE' }
         ]
      };
      const loaded = { ...(api.product as object), listing_attributes: stored };
      api.product = null;
      const wrapper = mountTab();
      await flushPromises();
      expect(wrapper.find('form').exists()).toBe(false);

      productRef.value = loaded;
      await flushPromises();
      expect(inputValue(wrapper, 'item_name')).toBe('Wischmopp');
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();

      await wrapper.get('[data-field="item_name"] input').setValue('Mopp');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(api.save).toHaveBeenCalledWith(
         expect.objectContaining({
            listing_attributes: {
               ...stored,
               item_name: [
                  { value: 'Mop', language_tag: 'en_GB' },
                  { value: 'Mopp', language_tag: 'de_DE' }
               ]
            }
         })
      );
   });

   it('a reset drops JSON text that did not parse', async () => {
      const wrapper = mountTab();
      await flushPromises();
      await wrapper.get('[data-field="item_name"] input').setValue('Mop');
      await wrapper.get('[data-group="offer"]').trigger('click');
      const field = () => wrapper.get('[data-field="purchasable_offer"]');
      await field().get('textarea').setValue('{ nope');
      expect(field().text()).toContain('This is not valid JSON.');

      await wrapper.get('form').trigger('reset');
      await flushPromises();

      expect((field().get('textarea').element as HTMLTextAreaElement).value).toBe('');
      expect(field().text()).not.toContain('This is not valid JSON.');
   });

   it('works in the first cell of the EU country order, or the market a link names (B1)', async () => {
      const cells = [
         { id: 'c-it', country: 'IT', listing_language: null, price: null, currency: null },
         { id: 'c-nl', country: 'NL', listing_language: null, price: null, currency: null },
         { id: 'c-de', country: 'DE', listing_language: null, price: null, currency: null }
      ];
      api.cells = cells;
      let wrapper = mountTab();
      await flushPromises();
      expect(api.submissionsFor!()).toBe('c-de');
      expect(wrapper.getComponent(AmazonAttributeForm).props('languageTag')).toBe('de_DE');
      wrapper.unmount();

      api.route = { query: { market: 'nl', field: 'item_name' } };
      wrapper = mountTab();
      await flushPromises();
      expect(api.submissionsFor!()).toBe('c-nl');
      expect(wrapper.getComponent(AmazonAttributeForm).props('languageTag')).toBe('nl_NL');
      wrapper.unmount();

      api.route = { query: { market: 'NL', lang: 'en_GB' } };
      wrapper = mountTab();
      await flushPromises();
      expect(wrapper.getComponent(AmazonAttributeForm).props('languageTag')).toBe('en_GB');
   });

   it('keeps half-typed JSON when a refetch brings the same values back (A6)', async () => {
      const wrapper = mountTab();
      await flushPromises();
      await wrapper.get('[data-group="offer"]').trigger('click');
      const field = () => wrapper.get('[data-field="purchasable_offer"]');
      await field().get('textarea').setValue('{ nope');

      // A background refetch: a new product object with equal values.
      productRef.value = structuredClone(api.product);
      await flushPromises();
      expect((field().get('textarea').element as HTMLTextAreaElement).value).toBe('{ nope');

      // A real change from elsewhere still replaces the form.
      productRef.value = {
         ...(api.product as object),
         listing_attributes: { ...story, item_name: [{ value: 'Neu', language_tag: 'de_DE' }] }
      };
      await flushPromises();
      expect((field().get('textarea').element as HTMLTextAreaElement).value).toBe('');
   });

   it('keeps the language the user picked when the cells arrive', async () => {
      const wrapper = mountTab();
      await flushPromises();
      const form = wrapper.getComponent(AmazonAttributeForm);
      form.vm.$emit('update:languageTag', 'en_GB');
      await flushPromises();

      cellsRef.value = [
         { id: 'cell1', country: 'FR', listing_language: null, price: null, currency: null }
      ];
      await flushPromises();
      expect(form.props('languageTag')).toBe('en_GB');
   });
});
