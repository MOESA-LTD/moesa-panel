import '../setup/mockMain';
import type { AmazonIssue, Definition } from '@/api/amazon';
import AmazonAttributeForm from '@/components/service-components/amazon-form/AmazonAttributeForm.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import Amazon from '@/views/pages/ops/product/tabs/Amazon.vue';
import type { Attributes } from '@edge-shared/listingCompleteness';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

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
   property_groups: fixture.propertyGroups,
   fetched_at: '2026-11-06T00:00:00Z'
};

const MEDIA_ID = '5eed0009-0000-4000-8000-000000000001';

const api = vi.hoisted(() => ({
   product: null as unknown,
   save: vi.fn(),
   cells: [] as unknown[],
   submissions: [] as unknown[],
   definition: null as unknown,
   route: { query: {} as Record<string, string> }
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
vi.mock('@/api/product', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/product')>()),
   productResource: {
      useOne: () => ({ data: ref(api.product) }),
      useSave: () => ({ mutateAsync: api.save, isPending: ref(false) })
   }
}));
vi.mock('@/api/amazon', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/amazon')>()),
   useProductAmazonCells: () => ({ data: ref(api.cells) }),
   useProductTypeSearch: () => ({ data: ref([]), isFetching: ref(false) }),
   useDefinition: () => ({ data: ref(api.definition), isFetching: ref(false), error: ref(null) }),
   useListingSubmissions: () => ({ data: ref(api.submissions) })
}));

const plugins = [i18NPlugin, PrimeVue, ToastService];

type FormProps = {
   modelValue?: Attributes;
   languageTag?: string;
   provided?: string[];
   issues?: AmazonIssue[];
};

const mountForm = (props: FormProps = {}) =>
   mount(AmazonAttributeForm, {
      attachTo: document.body,
      props: {
         definition,
         modelValue: {},
         languageTag: 'de_DE',
         provided: [],
         ...props
      },
      global: { plugins }
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
         provided: ['externally_assigned_product_identifier']
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
         provided: ['externally_assigned_product_identifier']
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

   it('is read-only without the right to edit', () => {
      const wrapper = mount(AmazonAttributeForm, {
         props: {
            definition,
            modelValue: {},
            languageTag: 'de_DE',
            provided: [],
            readonly: true
         },
         global: { plugins }
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

   const mountTab = () =>
      mount(Amazon, { attachTo: document.body, props: { id: 'p1' }, global: { plugins } });

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
});
