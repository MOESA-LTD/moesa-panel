import '../setup/mockMain';
import type { Definition, ListingSubmissionRow } from '@/api/amazon';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import AmazonAttributeField from '@/components/service-components/amazon-form/AmazonAttributeField.vue';
import AmazonAttributeForm from '@/components/service-components/amazon-form/AmazonAttributeForm.vue';
import { ROUTE_DIALOG } from '@/components/layout/route-dialog/context';
import CellAmazonDrawer from '@/views/pages/ops/market/CellAmazonDrawer.vue';
import { toPropertyGroups, type Attributes } from '@edge-shared/listingCompleteness';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { enableAutoUnmount, flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AutoComplete from 'primevue/autocomplete';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, toValue, type MaybeRefOrGetter } from 'vue';

// The Amazon drawer of a market cell: connection, completeness for the cell's marketplace,
// marketplace fields, catalogue match, history and the actions, all on the API module's hooks.
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

const api = vi.hoisted(() => ({
   publish: vi.fn(),
   validate: vi.fn(),
   remove: vi.fn(),
   saveCell: vi.fn(),
   refetchCheck: vi.fn(),
   refreshStatus: vi.fn(),
   saveProduct: vi.fn(),
   closeGuards: [] as (() => boolean | Promise<boolean>)[],
   toast: vi.fn(),
   confirm: vi.fn(),
   checkTarget: null as null | (() => string | null),
   definitionArgs: [] as (() => unknown)[],
   accountsFilter: null as null | (() => unknown)
}));

const cellRef = ref<Record<string, unknown> | null>(null);
const productRef = ref<Record<string, unknown> | null>(null);
const accountsRef = ref<Record<string, unknown>[] | undefined>([]);
const isParentRef = ref<boolean | undefined>(false);
const submissionsRef = ref<ListingSubmissionRow[]>([]);
const checkRef = ref<unknown>(undefined);
const checkUpdatedRef = ref(0);
const checkingRef = ref(false);

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
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
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: api.confirm }) }));
vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({ currentTenant: { id: 't1' }, canIn: () => true })
}));
vi.mock('@/api/marketMatrix', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/marketMatrix')>()),
   marketCellResource: {
      useOne: () => ({ data: cellRef }),
      useSave: () => ({ mutateAsync: api.saveCell, isPending: ref(false) })
   }
}));
vi.mock('@/api/product', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/product')>()),
   productResource: {
      useOne: () => ({ data: productRef }),
      useSave: () => ({ mutateAsync: api.saveProduct, isPending: ref(false) })
   }
}));
vi.mock('@/api/amazon', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/amazon')>()),
   useAmazonAccounts: (filter: MaybeRefOrGetter<unknown>) => {
      api.accountsFilter = () => toValue(filter);
      return { data: accountsRef };
   },
   useProductIsParent: () => ({ data: isParentRef }),
   useDefinition: (args: MaybeRefOrGetter<unknown>) => {
      api.definitionArgs.push(() => toValue(args));
      return { data: ref(definition), error: ref(null), isFetching: ref(false) };
   },
   useProductTypeSearch: () => ({
      data: ref([{ name: 'MOP', displayName: 'Mop' }]),
      isFetching: ref(false)
   }),
   useCellCheck: (cellId: MaybeRefOrGetter<string | null>) => {
      api.checkTarget = () => toValue(cellId);
      return {
         data: checkRef,
         dataUpdatedAt: checkUpdatedRef,
         error: ref(null),
         isFetching: checkingRef,
         refetch: api.refetchCheck
      };
   },
   useListingSubmissions: () => ({ data: submissionsRef }),
   usePublishCell: () => ({ mutateAsync: api.publish, isPending: ref(false) }),
   useValidateCell: () => ({ mutateAsync: api.validate, isPending: ref(false) }),
   useDeleteListing: () => ({ mutateAsync: api.remove, isPending: ref(false) }),
   useRefreshCellStatus: () => ({ mutateAsync: api.refreshStatus, isPending: ref(false) })
}));

const NOW = new Date().toISOString();

const CELL = {
   id: 'c1',
   customer_id: 'k1',
   product_id: 'p1',
   platform_id: 'amazon',
   country: 'DE',
   status: 'preparing',
   listing_state: 'ready',
   listing_checked_at: NOW,
   listing_match: { asin: null, restricted: false, reasons: [], checked_at: NOW },
   listing_language: null,
   fulfillment_channel: 'fbm',
   price: 19.9,
   currency: 'EUR',
   stock_source: 'platform',
   product: { sku: 'THO-MOP40-2P', display_name: 'Mop' },
   project: null,
   platform: { display_name: 'Amazon', countries: ['DE'], product_id_label: 'ASIN' }
};

const PRODUCT = {
   id: 'p1',
   customer_id: 'k1',
   tenant_id: 't1',
   gtin: '4260696025909',
   amazon_product_type: 'LUGGAGE',
   amazon_schema_version: definition.version,
   listing_attributes: story
};

const ACCOUNT = {
   id: 'a1',
   customer_id: 'k1',
   platform_id: 'amazon',
   api_connection: 'connected',
   authorized_at: NOW,
   seller_id: 'A2SELLER'
};

const submission = (extra: Partial<ListingSubmissionRow> = {}): ListingSubmissionRow => ({
   id: 's1',
   tenant_id: 't1',
   cell_id: 'c1',
   kind: 'create',
   sku: 'THO-MOP40-2P',
   marketplace_id: 'A1PA6795UKMFR9',
   payload: {},
   amazon_submission_id: 'sub-1',
   status: 'processing',
   issues: [],
   created_by: null,
   created_at: '2026-11-06T10:00:00Z',
   updated_at: '2026-11-06T10:00:00Z',
   ...extra
});

const mountDrawer = async ({ attach = false } = {}) => {
   const wrapper = mount(CellAmazonDrawer, {
      // Attached when a test checks the focus.
      attachTo: attach ? document.body : undefined,
      props: { cellId: 'c1' },
      global: {
         plugins: [
            i18NPlugin,
            PrimeVue,
            [VueQueryPlugin, { queryClient: new QueryClient() }],
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ],
         directives: { tooltip: Tooltip },
         stubs: { RouterLink: RouterLinkStub },
         // The cell's route dialog: the drawer guards its close against unsaved Amazon fields.
         provide: {
            [ROUTE_DIALOG as symbol]: {
               addCloseGuard: (guard: () => boolean | Promise<boolean>) => {
                  api.closeGuards.push(guard);
                  return () => api.closeGuards.splice(api.closeGuards.indexOf(guard), 1);
               },
               close: async () => {}
            }
         }
      }
   });
   await flushPromises();
   return wrapper;
};

type Wrapper = Awaited<ReturnType<typeof mountDrawer>>;
const action = (wrapper: Wrapper, name: string) => wrapper.find(`[data-action="${name}"]`);
const isDisabled = (wrapper: Wrapper, name: string) =>
   action(wrapper, name).attributes('disabled') !== undefined;
const links = (wrapper: Wrapper) =>
   wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'));

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   ability.update([{ action: 'manage', subject: 'all' }]);
   cellRef.value = { ...CELL };
   productRef.value = { ...PRODUCT };
   accountsRef.value = [{ ...ACCOUNT }];
   isParentRef.value = false;
   submissionsRef.value = [];
   checkRef.value = undefined;
   checkUpdatedRef.value = 0;
   checkingRef.value = false;
   api.refreshStatus.mockReset();
   api.confirm.mockReset();
   api.saveProduct.mockReset();
   api.saveProduct.mockImplementation(async (row: object) => ({ ...productRef.value, ...row }));
   api.closeGuards = [];
   api.definitionArgs = [];
   document.body.innerHTML = '';
});

describe('CellAmazonDrawer', () => {
   it('shows the missing required fields for the cell marketplace as fields of the Amazon form', async () => {
      const attributes: Attributes = { ...story };
      delete attributes.condition_type;
      productRef.value = { ...PRODUCT, listing_attributes: attributes };
      const wrapper = await mountDrawer();

      const missing = wrapper.get('[data-missing="condition_type"]');
      expect(missing.text()).toContain('Item Condition');
      const field = missing.getComponent(AmazonAttributeField);
      expect(field.props()).toMatchObject({
         name: 'condition_type',
         languageTag: 'de_DE',
         badge: 'required',
         readonly: false
      });
      // Nothing edited yet: nothing to save.
      expect(isDisabled(wrapper, 'save-attributes')).toBe(true);
      expect(isDisabled(wrapper, 'reset-attributes')).toBe(true);
      // The GTIN and the price provide the identifier and the offer: not listed.
      expect(wrapper.find('[data-missing="externally_assigned_product_identifier"]').exists()).toBe(
         false
      );
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(wrapper.get('[data-blocked]').text()).toBe(en.ops.amazon.cell.publish_blocked.missing);
   });

   it('reads completeness in the cell listing language', async () => {
      // The story's values are German; an English listing misses the language-tagged ones.
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      expect(wrapper.find('[data-missing="item_name"]').exists()).toBe(true);

      cellRef.value = { ...CELL };
      const german = await mountDrawer();
      expect(german.find('[data-missing]').exists()).toBe(false);
      expect(german.text()).toContain(en.ops.amazon.cell.missing_none);
   });

   it('does not list an attribute the product card provides as missing', async () => {
      const unbranded: Attributes = { ...story };
      delete unbranded.brand;
      productRef.value = { ...PRODUCT, listing_attributes: unbranded };
      const plain = await mountDrawer();
      expect(plain.find('[data-missing="brand"]').exists()).toBe(true);

      productRef.value = { ...PRODUCT, brand: 'OKAEI', listing_attributes: unbranded };
      const carded = await mountDrawer();
      expect(carded.find('[data-missing]').exists()).toBe(false);
      expect(carded.text()).toContain(en.ops.amazon.cell.missing_none);
      expect(isDisabled(carded, 'publish')).toBe(false);
   });

   it('counts the identifier and the offer of a variation parent as provided (R7)', async () => {
      // A parent: no GTIN, no price; its children carry them.
      productRef.value = { ...PRODUCT, gtin: null };
      cellRef.value = { ...CELL, price: null, currency: null };
      const child = await mountDrawer();
      for (const field of ['externally_assigned_product_identifier', 'purchasable_offer'])
         expect(child.find(`[data-missing="${field}"]`).exists()).toBe(
            field.startsWith('external')
         );

      isParentRef.value = true;
      const parent = await mountDrawer();
      expect(parent.find('[data-missing]').exists()).toBe(false);
      expect(isDisabled(parent, 'publish')).toBe(false);

      // Not known yet: no list and no publish.
      isParentRef.value = undefined;
      const loading = await mountDrawer();
      expect(loading.find('[data-missing]').exists()).toBe(false);
      expect(loading.text()).not.toContain(en.ops.amazon.cell.missing_none);
      expect(isDisabled(loading, 'publish')).toBe(true);
   });

   it('gives no connection verdict while the accounts load', async () => {
      accountsRef.value = undefined;
      cellRef.value = { ...CELL, listing_state: 'live' };
      const wrapper = await mountDrawer();
      expect(wrapper.get('[data-state]').attributes('data-state')).toBe('live');
      expect(wrapper.find('[data-api-connection]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain(en.ops.amazon.cell.not_connected);
      expect(wrapper.find('[data-blocked]').exists()).toBe(false);
      expect(isDisabled(wrapper, 'publish')).toBe(true);
   });

   it('shows the stored state when the accounts may not be read', async () => {
      ability.update([
         { action: 'manage', subject: 'market_cell' },
         { action: 'create', subject: 'listing_submission' },
         { action: 'select', subject: 'product' }
      ]);
      accountsRef.value = [];
      cellRef.value = { ...CELL, listing_state: 'live' };
      const wrapper = await mountDrawer();
      expect(api.accountsFilter!()).toBeNull();
      expect(wrapper.get('[data-state]').attributes('data-state')).toBe('live');
      expect(wrapper.text()).not.toContain(en.ops.amazon.cell.not_connected);
      // The function decides on the connection.
      expect(isDisabled(wrapper, 'publish')).toBe(false);
   });

   it('names a submission kind or status it does not know as unknown', async () => {
      submissionsRef.value = [
         submission({
            kind: 'retract',
            status: 'archived'
         } as unknown as Partial<ListingSubmissionRow>)
      ];
      const wrapper = await mountDrawer();
      const entry = wrapper.get('[data-submission="s1"]');
      expect(entry.text()).toContain(en.ops.amazon.submission.kind.unknown);
      expect(entry.text()).toContain(en.ops.amazon.submission.status.unknown);
   });

   it('Publish is disabled until connected and ready', async () => {
      // N2: the stored state is live, but the account is not connected: shown as draft.
      cellRef.value = { ...CELL, listing_state: 'live' };
      accountsRef.value = [{ ...ACCOUNT, api_connection: 'none' }];
      let wrapper = await mountDrawer();
      expect(wrapper.get('[data-state]').attributes('data-state')).toBe('draft');
      expect(wrapper.get('[data-api-connection]').text()).toBe(en.ops.amazon.api_connection.none);
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(wrapper.get('[data-blocked]').text()).toBe(
         en.ops.amazon.cell.publish_blocked.not_connected
      );
      expect(links(wrapper)).toContainEqual({
         name: 'ops-customer-manage-platforms',
         params: { id: 'k1' }
      });

      // Connected, but not checked ready yet.
      cellRef.value = { ...CELL, listing_state: 'draft' };
      accountsRef.value = [{ ...ACCOUNT }];
      wrapper = await mountDrawer();
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(wrapper.get('[data-blocked]').text()).toBe(
         en.ops.amazon.cell.publish_blocked.unchecked
      );

      // Waiting for Amazon.
      cellRef.value = { ...CELL, listing_state: 'submitted' };
      wrapper = await mountDrawer();
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(wrapper.get('[data-blocked]').text()).toBe(
         en.ops.amazon.cell.publish_blocked.submitted
      );

      for (const state of ['ready', 'live', 'issues']) {
         cellRef.value = { ...CELL, listing_state: state };
         wrapper = await mountDrawer();
         expect(isDisabled(wrapper, 'publish')).toBe(false);
         expect(wrapper.find('[data-blocked]').exists()).toBe(false);
      }
   });

   it('Publish calls amazon-listing publish and shows submitted', async () => {
      api.publish.mockResolvedValue({
         cell: { ...CELL, listing_state: 'submitted' },
         submission: submission()
      });
      const wrapper = await mountDrawer();
      expect(action(wrapper, 'publish').text()).toBe(en.ops.amazon.cell.publish);

      await action(wrapper, 'publish').trigger('click');
      await flushPromises();

      expect(api.publish).toHaveBeenCalledWith('c1');
      expect(wrapper.get('[data-state]').attributes('data-state')).toBe('submitted');
      expect(wrapper.get('[data-state]').text()).toBe(en.ops.amazon.state.submitted);
      expect(wrapper.get('[data-published]').text()).toContain(
         en.ops.amazon.submission.status.processing
      );
   });

   it('shows a refused publish with its error text', async () => {
      const { AmazonApiError } = await import('@/api/amazon');
      api.publish.mockRejectedValue(new AmazonApiError('amazon_not_connected'));
      const wrapper = await mountDrawer();
      await action(wrapper, 'publish').trigger('click');
      await flushPromises();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ severity: 'error', detail: en.errors.amazon_not_connected })
      );
   });

   it('shows Update on Amazon after a done submission', async () => {
      submissionsRef.value = [
         submission({ id: 's2', kind: 'update', status: 'processing' }),
         submission({ status: 'done' })
      ];
      cellRef.value = { ...CELL, listing_state: 'live' };
      const wrapper = await mountDrawer();
      expect(action(wrapper, 'publish').text()).toBe(en.ops.amazon.cell.update);
      expect(action(wrapper, 'delete').exists()).toBe(true);

      // A done delete takes the listing away again: back to Publish.
      submissionsRef.value = [submission({ id: 's3', kind: 'delete', status: 'done' })];
      const removed = await mountDrawer();
      expect(action(removed, 'publish').text()).toBe(en.ops.amazon.cell.publish);
      expect(action(removed, 'delete').exists()).toBe(false);
   });

   it('Remove from Amazon asks first', async () => {
      submissionsRef.value = [submission({ status: 'done' })];
      cellRef.value = { ...CELL, listing_state: 'live' };
      api.remove.mockResolvedValue({
         cell: { ...CELL, listing_state: 'submitted' },
         submission: submission({ id: 's9', kind: 'delete' })
      });
      const wrapper = await mountDrawer();
      await action(wrapper, 'delete').trigger('click');
      expect(api.remove).not.toHaveBeenCalled();
      const request = api.confirm.mock.calls[0]![0] as { message: string; accept: () => unknown };
      expect(request.message).toBe(en.ops.amazon.cell.delete_confirm);
      await request.accept();
      await flushPromises();
      expect(api.remove).toHaveBeenCalledWith('c1');
   });

   it('shows the history with Amazon messages verbatim and field titles from the schema', async () => {
      const message = "'condition_type' is required but not supplied.";
      submissionsRef.value = [
         submission({
            status: 'invalid',
            issues: [
               { code: '90220', message, severity: 'ERROR', attributeNames: ['condition_type'] }
            ]
         })
      ];
      cellRef.value = { ...CELL, listing_state: 'issues' };
      const wrapper = await mountDrawer();

      const entry = wrapper.get('[data-submission="s1"]');
      expect(entry.text()).toContain(en.ops.amazon.submission.kind.create);
      expect(entry.text()).toContain(en.ops.amazon.submission.status.invalid);
      const issue = entry.get('[data-issue]');
      expect(issue.get('[data-issue-field]').text()).toBe('Item Condition');
      expect(issue.text()).toContain(message);
      expect(issue.text()).toContain('90220');
      expect(issue.get('[data-action="issue-fix"]').text()).toBe(en.ops.amazon.cell.issue_fix);
      expect(issue.findComponent(RouterLinkStub).exists()).toBe(false);
   });

   it('Fix on an issue opens its field inline, also one that is not missing', async () => {
      submissionsRef.value = [
         submission({
            status: 'invalid',
            issues: [
               {
                  code: '90003',
                  message: 'Colour is not valid.',
                  severity: 'ERROR',
                  attributeNames: ['color[marketplace_id=A1PA6795UKMFR9]']
               }
            ]
         })
      ];
      cellRef.value = { ...CELL, listing_state: 'issues' };
      const wrapper = await mountDrawer();
      expect(wrapper.find('[data-inline-field="color"]').exists()).toBe(false);

      await wrapper.get('[data-action="issue-fix"]').trigger('click');
      await flushPromises();
      const field = wrapper.get('[data-inline-field="color"]').getComponent(AmazonAttributeField);
      expect(field.props()).toMatchObject({ name: 'color', languageTag: 'de_DE' });
      // Not a missing required field.
      expect(wrapper.find('[data-missing="color"]').exists()).toBe(false);
   });

   it('lists an issue without attributeNames under General', async () => {
      const message =
         'The image URL could not be downloaded. Please make sure it is publicly accessible.';
      submissionsRef.value = [
         submission({
            status: 'done',
            issues: [{ code: '18027', message, severity: 'ERROR', attributeNames: [] }]
         })
      ];
      const wrapper = await mountDrawer();
      const issue = wrapper.get('[data-issue]');
      expect(issue.get('[data-issue-field]').text()).toBe(en.ops.amazon.cell.issue_general);
      expect(issue.text()).toContain(message);
      expect(issue.findComponent(RouterLinkStub).exists()).toBe(false);
   });

   it('Validate with Amazon runs only on click', async () => {
      api.validate.mockResolvedValue({
         status: 'INVALID',
         issues: [
            {
               code: '8541',
               message: 'Bad bullet.',
               severity: 'WARNING',
               attributeNames: ['bullet_point']
            }
         ]
      });
      const wrapper = await mountDrawer();
      expect(api.validate).not.toHaveBeenCalled();

      await action(wrapper, 'validate').trigger('click');
      await flushPromises();
      expect(api.validate).toHaveBeenCalledWith('c1');
      const result = wrapper.get('[data-validated]');
      expect(result.text()).toContain(en.ops.amazon.cell.validated.INVALID);
      expect(result.text()).toContain('Bad bullet.');
      expect(result.text()).toContain('Bullet Point');
   });

   it('checks on open only when the last check is older than an hour, and on Check', async () => {
      await mountDrawer();
      expect(api.checkTarget!()).toBeNull();

      cellRef.value = {
         ...CELL,
         listing_state: 'draft',
         listing_checked_at: '2026-01-01T00:00:00Z'
      };
      const stale = await mountDrawer();
      expect(api.checkTarget!()).toBe('c1');

      // A check result shows the match and takes over the state.
      checkRef.value = {
         missing: [],
         match: { asin: 'B0MATCH', restricted: true, reasons: ['APPROVAL_REQUIRED'] },
         state: 'ready'
      };
      checkUpdatedRef.value = Date.now();
      await flushPromises();
      // The state the check wrote shows before the cell is read again.
      expect(stale.get('[data-state]').attributes('data-state')).toBe('ready');
      expect(stale.text()).toContain(en.ops.amazon.cell.match.found.replace('{asin}', 'B0MATCH'));
      expect(stale.text()).toContain(
         en.ops.amazon.cell.restriction.restricted.replace('{reasons}', 'APPROVAL_REQUIRED')
      );

      cellRef.value = { ...CELL };
      checkRef.value = undefined;
      const fresh = await mountDrawer();
      await action(fresh, 'check').trigger('click');
      expect(api.checkTarget!()).toBe('c1');
   });

   it('links all fields of the Amazon tab, in the cell market and language, in a new tab (B1)', async () => {
      cellRef.value = { ...CELL, country: 'NL', listing_language: null };
      const attributes: Attributes = { ...story };
      delete attributes.condition_type;
      productRef.value = { ...PRODUCT, listing_attributes: attributes };
      const wrapper = await mountDrawer();
      const link = wrapper.get('[data-open-all]');
      expect(link.text()).toBe(en.ops.amazon.cell.open_all);
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toBe('noopener');
      expect(link.getComponent(RouterLinkStub).props('to')).toEqual({
         name: 'ops-product-manage-amazon',
         params: { id: 'p1' },
         query: { market: 'NL', lang: 'nl_NL' }
      });
   });

   it('saves the inline fields onto the saved attributes, and the filled field leaves the list', async () => {
      // An English listing misses the item name (the story's is German).
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      expect(
         wrapper.get('[data-missing="item_name"]').getComponent(AmazonAttributeField).props()
      ).toMatchObject({ languageTag: 'en_GB' });

      await wrapper.get('[data-missing="item_name"] input').setValue('Mop');
      expect(isDisabled(wrapper, 'save-attributes')).toBe(false);
      // Unsaved Amazon fields hold the publish back.
      expect(isDisabled(wrapper, 'publish')).toBe(true);

      // Saved elsewhere meanwhile: another attribute changed; it is kept.
      const bullets = [{ value: 'Neu', language_tag: 'de_DE' }];
      productRef.value = { ...PRODUCT, listing_attributes: { ...story, bullet_point: bullets } };
      await flushPromises();

      await action(wrapper, 'save-attributes').trigger('click');
      await flushPromises();
      expect(api.saveProduct).toHaveBeenCalledTimes(1);
      expect(api.saveProduct).toHaveBeenCalledWith({
         id: 'p1',
         listing_attributes: {
            ...story,
            bullet_point: bullets,
            item_name: [...story.item_name!, { value: 'Mop', language_tag: 'en_GB' }]
         }
      });
      expect(wrapper.find('[data-missing="item_name"]').exists()).toBe(false);
      expect(isDisabled(wrapper, 'save-attributes')).toBe(true);
   });

   it('shows the inline fields read-only, without Save, without the right to edit the product', async () => {
      ability.update([
         { action: 'manage', subject: 'all' },
         { action: 'update', subject: 'product', inverted: true }
      ]);
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      const field = wrapper.get('[data-missing="item_name"]');
      expect(field.getComponent(AmazonAttributeField).props('readonly')).toBe(true);
      expect(field.get('input').attributes('disabled')).toBeDefined();
      expect(action(wrapper, 'save-attributes').exists()).toBe(false);
      expect(action(wrapper, 'reset-attributes').exists()).toBe(false);
      expect(wrapper.get('[data-attributes-readonly]').text()).toBe(
         en.errors.insufficient_permission
      );
   });

   it('asks before closing with unsaved inline fields', async () => {
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      const allowClose = (wrapper.vm as unknown as { allowClose: () => Promise<boolean> })
         .allowClose;
      // Nothing edited: it closes without asking, the cell dialog too.
      expect(await allowClose()).toBe(true);
      expect(await api.closeGuards[0]!()).toBe(true);
      expect(api.confirm).not.toHaveBeenCalled();

      await wrapper.get('[data-missing="item_name"] input').setValue('Mop');
      const closing = allowClose();
      expect(api.confirm).toHaveBeenCalledTimes(1);
      api.confirm.mock.calls[0]![0].reject();
      expect(await closing).toBe(false);

      // The cell dialog's close asks as well.
      const dialog = api.closeGuards[0]!();
      expect(api.confirm).toHaveBeenCalledTimes(2);
      api.confirm.mock.calls[1]![0].accept();
      expect(await dialog).toBe(true);

      // Reset drops the edits: nothing to ask about.
      await action(wrapper, 'reset-attributes').trigger('click');
      expect(await allowClose()).toBe(true);
   });

   it('shows the check date of the match, and only "not checked" without one (B2)', async () => {
      // The state was written (listing_checked_at) but no catalogue check ran.
      cellRef.value = { ...CELL, listing_match: null, listing_checked_at: NOW };
      let wrapper = await mountDrawer();
      expect(wrapper.text()).toContain(en.ops.amazon.cell.match.none);
      expect(wrapper.find('[data-checked-at]').exists()).toBe(false);

      cellRef.value = {
         ...CELL,
         listing_checked_at: '2026-11-06T12:00:00Z',
         listing_match: {
            asin: null,
            restricted: false,
            reasons: [],
            checked_at: '2026-11-05T08:30:00Z'
         }
      };
      wrapper = await mountDrawer();
      expect(wrapper.text()).not.toContain(en.ops.amazon.cell.match.none);
      expect(wrapper.get('[data-checked-at]').text()).toContain('2026-11-05');
   });

   it('holds Publish, Remove and Validate while a check runs (C2)', async () => {
      cellRef.value = { ...CELL, listing_state: 'live' };
      submissionsRef.value = [submission({ status: 'done' })];
      checkingRef.value = true;
      const wrapper = await mountDrawer();
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(isDisabled(wrapper, 'delete')).toBe(true);
      expect(isDisabled(wrapper, 'validate')).toBe(true);

      checkingRef.value = false;
      await flushPromises();
      expect(isDisabled(wrapper, 'publish')).toBe(false);
      expect(isDisabled(wrapper, 'delete')).toBe(false);
   });

   it('Refresh status asks Amazon for a submitted or issues cell and shows the answer (C3)', async () => {
      cellRef.value = { ...CELL, listing_state: 'ready' };
      submissionsRef.value = [submission({ status: 'processing' })];
      let wrapper = await mountDrawer();
      expect(action(wrapper, 'refresh-status').exists()).toBe(false);

      for (const state of ['submitted', 'issues']) {
         cellRef.value = { ...CELL, listing_state: state };
         wrapper = await mountDrawer();
         expect(action(wrapper, 'refresh-status').exists()).toBe(true);
      }

      cellRef.value = { ...CELL, listing_state: 'submitted' };
      api.refreshStatus.mockResolvedValue({
         cell: { ...CELL, listing_state: 'live' },
         submission: submission({ status: 'done' })
      });
      wrapper = await mountDrawer();
      await action(wrapper, 'refresh-status').trigger('click');
      await flushPromises();
      expect(api.refreshStatus).toHaveBeenCalledWith('c1');
      expect(wrapper.get('[data-state]').attributes('data-state')).toBe('live');

      // A refused refresh says why.
      api.refreshStatus.mockRejectedValue(new Error('amazon_throttled'));
      cellRef.value = { ...CELL, listing_state: 'submitted' };
      wrapper = await mountDrawer();
      await action(wrapper, 'refresh-status').trigger('click');
      await flushPromises();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ detail: en.errors.amazon_throttled })
      );
   });

   it('shows the stored match: a new product', async () => {
      const wrapper = await mountDrawer();
      expect(wrapper.text()).toContain(en.ops.amazon.cell.match.new);
      expect(wrapper.text()).toContain(en.ops.amazon.cell.restriction.none);
   });

   it('saves the marketplace fields through the cell', async () => {
      api.saveCell.mockResolvedValue({ ...CELL, fulfillment_channel: 'fba' });
      const wrapper = await mountDrawer();
      const save = wrapper.get('[data-action="save-fields"]');
      expect(save.attributes('disabled')).toBeDefined();

      const { default: Select } = await import('primevue/select');
      const channel = wrapper
         .findAllComponents(Select)
         .find((select) => select.attributes('data-field') === 'fulfillment_channel')!;
      channel.vm.$emit('update:modelValue', 'fba');
      await flushPromises();
      expect(save.attributes('disabled')).toBeUndefined();
      // Unsaved fields hold the publish back.
      expect(isDisabled(wrapper, 'publish')).toBe(true);

      await save.trigger('click');
      await flushPromises();
      expect(api.saveCell).toHaveBeenCalledWith({
         id: 'c1',
         price: 19.9,
         currency: 'EUR',
         listing_language: null,
         fulfillment_channel: 'fba',
         stock_source: 'platform'
      });
   });

   it('renders the currency as a select, prefilled from the cell country when empty', async () => {
      const { default: Select } = await import('primevue/select');
      const currencySelect = (wrapper: Wrapper) =>
         wrapper
            .findAllComponents(Select)
            .find((select) => select.props('options')?.includes('USD'))!;

      expect(currencySelect(await mountDrawer()).props('modelValue')).toBe('EUR');

      cellRef.value = { ...CELL, country: 'PL', currency: null };
      expect(currencySelect(await mountDrawer()).props('modelValue')).toBe('PLN');

      cellRef.value = { ...CELL, country: 'GB', currency: 'USD' };
      expect(currencySelect(await mountDrawer()).props('modelValue')).toBe('USD');
   });

   it('offers no Amazon action without the right to submit', async () => {
      ability.update([
         { action: 'select', subject: 'market_cell' },
         { action: 'select', subject: 'listing_submission' }
      ]);
      const wrapper = await mountDrawer();
      for (const name of ['check', 'validate', 'publish', 'delete'])
         expect(action(wrapper, name).exists()).toBe(false);
      expect(api.checkTarget!()).toBeNull();
   });
});

// The drawer's second tab edits the product's whole Amazon content with the product tab's form;
// both tabs edit one state of the product's attributes.
describe('CellAmazonDrawer content tab', () => {
   const tab = (wrapper: Wrapper, name: string) => wrapper.get(`[data-tab="${name}"]`);
   const showTab = async (wrapper: Wrapper, name: string) => {
      await tab(wrapper, name).trigger('click');
      await flushPromises();
   };
   const content = (wrapper: Wrapper) => wrapper.get('[data-tab-panel="content"]');
   const contentInput = (wrapper: Wrapper, name: string) =>
      content(wrapper).get(`[data-field="${name}"] input`);
   const inlineInput = (wrapper: Wrapper, name: string) =>
      wrapper.get(`[data-inline-field="${name}"] input`);
   const valueOf = (input: { element: Element }) => (input.element as HTMLInputElement).value;
   const withEnglishName = [...story.item_name!, { value: 'Mop', language_tag: 'en_GB' }];
   const saveContent = (wrapper: Wrapper) => content(wrapper).find('[data-action="save-content"]');

   it('opens on the listing tab; the content tab shows the form for the cell marketplace and language', async () => {
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      expect(tab(wrapper, 'listing').text()).toBe(en.ops.amazon.cell.tabs.listing);
      expect(tab(wrapper, 'content').text()).toBe(en.ops.amazon.cell.tabs.content);
      expect(tab(wrapper, 'listing').attributes('aria-selected')).toBe('true');
      expect(wrapper.find('[data-section="completeness"]').exists()).toBe(true);
      // The content form is built when its tab is first shown.
      expect(wrapper.findComponent(AmazonAttributeForm).exists()).toBe(false);

      await showTab(wrapper, 'content');
      expect(wrapper.emitted('update:tab')!.at(-1)).toEqual(['content']);
      const form = content(wrapper).getComponent(AmazonAttributeForm);
      expect(form.props()).toMatchObject({ languageTag: 'en_GB', definition, readonly: false });
      expect(api.definitionArgs.map((args) => args())).toContainEqual({
         productType: 'LUGGAGE',
         country: 'DE',
         locale: 'en_GB',
         customerId: 'k1'
      });
      expect(content(wrapper).getComponent(AutoComplete).props('modelValue')).toBe('LUGGAGE');
      expect(content(wrapper).get('[data-content-notice]').text()).toBe(
         en.ops.amazon.cell.content_notice.replace('{language}', 'en_GB')
      );
   });

   it('edits one state: an edit in either tab shows in the other', async () => {
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      await showTab(wrapper, 'content');

      await contentInput(wrapper, 'item_name').setValue('Mop');
      await showTab(wrapper, 'listing');
      expect(valueOf(inlineInput(wrapper, 'item_name'))).toBe('Mop');

      await inlineInput(wrapper, 'item_name').setValue('Mops');
      await showTab(wrapper, 'content');
      expect(valueOf(contentInput(wrapper, 'item_name'))).toBe('Mops');
   });

   it('saves the merged attributes once from either tab, and completeness counts them at once', async () => {
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      let wrapper = await mountDrawer();
      await showTab(wrapper, 'content');
      await contentInput(wrapper, 'item_name').setValue('Mop');
      await showTab(wrapper, 'listing');
      await action(wrapper, 'save-attributes').trigger('click');
      await flushPromises();
      expect(api.saveProduct).toHaveBeenCalledTimes(1);
      expect(api.saveProduct).toHaveBeenCalledWith({
         id: 'p1',
         listing_attributes: { ...story, item_name: withEnglishName }
      });
      expect(wrapper.find('[data-missing="item_name"]').exists()).toBe(false);
      wrapper.unmount();

      api.saveProduct.mockClear();
      wrapper = await mountDrawer();
      await inlineInput(wrapper, 'item_name').setValue('Mop');
      await showTab(wrapper, 'content');
      expect(saveContent(wrapper).attributes('disabled')).toBeUndefined();
      await saveContent(wrapper).trigger('click');
      await flushPromises();
      expect(api.saveProduct).toHaveBeenCalledTimes(1);
      expect(api.saveProduct).toHaveBeenCalledWith({
         id: 'p1',
         listing_attributes: { ...story, item_name: withEnglishName }
      });
      expect(saveContent(wrapper).attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-missing="item_name"]').exists()).toBe(false);
   });

   it('holds Publish back over an unsaved content edit and asks once on close', async () => {
      const wrapper = await mountDrawer();
      await showTab(wrapper, 'content');
      await contentInput(wrapper, 'item_name').setValue('Mop');
      expect(isDisabled(wrapper, 'publish')).toBe(true);
      expect(wrapper.get('[data-blocked]').text()).toBe(
         en.ops.amazon.cell.publish_blocked.unsaved_attributes
      );

      const allowClose = (wrapper.vm as unknown as { allowClose: () => Promise<boolean> })
         .allowClose;
      const closing = allowClose();
      expect(api.confirm).toHaveBeenCalledTimes(1);
      api.confirm.mock.calls[0]![0].reject();
      expect(await closing).toBe(false);
   });

   it('"Open in the Content tab" shows the field there, from a missing field and from an issue', async () => {
      cellRef.value = { ...CELL, listing_language: 'en_GB', listing_state: 'issues' };
      submissionsRef.value = [
         submission({
            status: 'invalid',
            issues: [
               {
                  code: '90003',
                  message: 'Colour is not valid.',
                  severity: 'ERROR',
                  attributeNames: ['color[marketplace_id=A1PA6795UKMFR9]']
               }
            ]
         })
      ];
      const wrapper = await mountDrawer({ attach: true });
      const fieldLink = wrapper.get(
         '[data-inline-field="item_name"] [data-action="open-in-content"]'
      );
      expect(fieldLink.text()).toBe(en.ops.amazon.cell.open_in_content);
      await fieldLink.trigger('click');
      await flushPromises();
      expect(tab(wrapper, 'content').attributes('aria-selected')).toBe('true');
      expect(
         content(wrapper).get('[data-field="item_name"]').element.contains(document.activeElement)
      ).toBe(true);

      await showTab(wrapper, 'listing');
      await wrapper
         .get('[data-section="history"] [data-issue] [data-action="open-in-content"]')
         .trigger('click');
      await flushPromises();
      expect(tab(wrapper, 'content').attributes('aria-selected')).toBe('true');
      expect(
         content(wrapper).get('[data-group="product_details"]').attributes('aria-current')
      ).toBe('true');
      expect(
         content(wrapper).get('[data-field="color"]').element.contains(document.activeElement)
      ).toBe(true);
   });

   it('shows the content read-only, the product type too, without the right to edit the product', async () => {
      ability.update([
         { action: 'manage', subject: 'all' },
         { action: 'update', subject: 'product', inverted: true }
      ]);
      const wrapper = await mountDrawer();
      await showTab(wrapper, 'content');
      expect(content(wrapper).getComponent(AmazonAttributeForm).props('readonly')).toBe(true);
      expect(content(wrapper).getComponent(AutoComplete).props('disabled')).toBe(true);
      expect(saveContent(wrapper).exists()).toBe(false);
      expect(content(wrapper).get('[data-content-readonly]').text()).toBe(
         en.errors.insufficient_permission
      );
   });

   it('takes the values and the type of a product that loads after the drawer, and saves them all', async () => {
      productRef.value = null;
      cellRef.value = { ...CELL, listing_language: 'en_GB' };
      const wrapper = await mountDrawer();
      await showTab(wrapper, 'content');
      expect(saveContent(wrapper).exists()).toBe(false);

      productRef.value = { ...PRODUCT };
      await flushPromises();
      expect(content(wrapper).getComponent(AutoComplete).props('modelValue')).toBe('LUGGAGE');
      expect(content(wrapper).getComponent(AmazonAttributeForm).props('modelValue')).toEqual(story);
      // Nothing edited: a save cannot write the late values over with an empty form.
      expect(saveContent(wrapper).attributes('disabled')).toBeDefined();

      await contentInput(wrapper, 'item_name').setValue('Mop');
      await saveContent(wrapper).trigger('click');
      await flushPromises();
      expect(api.saveProduct).toHaveBeenCalledWith({
         id: 'p1',
         listing_attributes: { ...story, item_name: withEnglishName }
      });
   });

   it('changes the product type with the right to edit the product, and saves it with its schema version', async () => {
      const wrapper = await mountDrawer();
      await showTab(wrapper, 'content');
      content(wrapper)
         .getComponent(AutoComplete)
         .vm.$emit('option-select', { value: { name: 'MOP', label: 'Mop (MOP)' } });
      await flushPromises();
      expect(wrapper.get('[data-blocked]').text()).toBe(
         en.ops.amazon.cell.publish_blocked.unsaved_attributes
      );

      await saveContent(wrapper).trigger('click');
      await flushPromises();
      expect(api.saveProduct).toHaveBeenCalledTimes(1);
      expect(api.saveProduct).toHaveBeenCalledWith({
         id: 'p1',
         amazon_product_type: 'MOP',
         amazon_schema_version: definition.version,
         listing_attributes: story
      });
   });
});
