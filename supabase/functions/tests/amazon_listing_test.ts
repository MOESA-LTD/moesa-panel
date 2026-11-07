import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { type AmazonEnv, clearTokenCache, type Deps } from '../_shared/amazon.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import type { AmazonSchema, GetDefinitionResponse } from '../_shared/listingCompleteness.ts';
import { toDefinitionRow } from '../_shared/listingCompleteness.ts';
import { withAuthorization } from '../_shared/auth.ts';
import { refreshListingStatus } from '../_shared/listingStatus.ts';
import { serviceRole } from '../_shared/serviceRole.ts';
import { handler, type HandlerDeps } from '../amazon-listing/index.ts';
import {
   buildListingBody,
   type CellContext,
   copyListingImages,
   deriveListingState,
   type ListingBody,
   listingPatch,
   type MarketCellRow,
   mediaRefs,
   parseSubmission,
   type ProductRow,
   publicImageUrl,
   requireLanguageTag,
   skuFor,
   withNewItemAvailability
} from '../amazon-listing/listing.ts';

const fixture: GetDefinitionResponse & { schema: AmazonSchema } = JSON.parse(
   await Deno.readTextFile(
      new URL('../../seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json', import.meta.url)
   )
);
const storyAttributes = JSON.parse(
   await Deno.readTextFile(
      new URL('../../seed_files/amazon/LUGGAGE.attributes.json', import.meta.url)
   )
);

const DE = 'A1PA6795UKMFR9';
const FR = 'A13V1IB3VIYZZH';
const TENANT = '00000000-0000-4000-8000-0000000000a1';
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';
const MEDIA = '5eed0009-0000-4000-8000-000000000001';
const MEDIA_2 = '5eed0009-0000-4000-8000-000000000002';
const PUBLIC_BASE = 'http://127.0.0.1:54321';
const PROD_BASE = 'https://ref.supabase.co';
const VERSION = '2026-11-06T08:00:00.123456+00:00';
const CELL = '00000000-0000-4000-8000-00000000ce01';

// --- Rows ----------------------------------------------------------------------------------------

const product = (over: Partial<ProductRow> = {}): ProductRow =>
   ({
      id: '00000000-0000-4000-8000-00000000ad01',
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      sku: 'THO-MOP40-2P',
      gtin: '4260696025800',
      parent_id: null,
      amazon_product_type: 'LUGGAGE',
      listing_attributes: structuredClone(storyAttributes),
      ...over
   }) as ProductRow;

const cell = (over: Partial<MarketCellRow> = {}): MarketCellRow =>
   ({
      id: '00000000-0000-4000-8000-00000000ce01',
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      product_id: '00000000-0000-4000-8000-00000000ad01',
      platform_id: 'amazon',
      country: 'DE',
      status: 'planned',
      price: 24.9,
      currency: 'EUR',
      platform_sku: null,
      platform_product_id: null,
      listing_state: null,
      listing_language: null,
      listing_match: null,
      fulfillment_channel: 'fbm',
      open_issue: null,
      updated_at: VERSION,
      ...over
   }) as MarketCellRow;

const context = (over: Partial<CellContext> = {}): CellContext => {
   const c = over.cell ?? cell();
   const p = over.product ?? product();
   return {
      cell: c,
      product: p,
      parent: null,
      parentCell: null,
      children: [],
      marketplaceId: DE,
      languageTag: 'de_DE',
      currency: c.currency,
      sku: skuFor(c, p),
      ...over
   };
};

const urls = { [MEDIA]: `${PUBLIC_BASE}/storage/v1/object/public/listing-images/x/mop.png` };

// --- buildListingBody ----------------------------------------------------------------------------

Deno.test(
   'buildListingBody keeps the cell language and marketplace and stamps marketplace_id',
   () => {
      const attributes = {
         ...structuredClone(storyAttributes),
         item_name: [
            { value: 'Wischmopp', language_tag: 'de_DE' },
            { value: 'Serpillière', language_tag: 'fr_FR' }
         ],
         color: [
            { value: 'Weiß', marketplace_id: DE },
            { value: 'Blanc', marketplace_id: FR }
         ]
      };
      const body = buildListingBody(context(), attributes, urls, null);
      assertEquals(body.productType, 'LUGGAGE');
      assertEquals(body.requirements, 'LISTING');
      assertEquals(body.attributes.item_name, [
         { value: 'Wischmopp', language_tag: 'de_DE', marketplace_id: DE }
      ]);
      assertEquals(body.attributes.color, [{ value: 'Weiß', marketplace_id: DE }]);
      assertEquals(body.attributes.condition_type, [{ value: 'new_new', marketplace_id: DE }]);
   }
);

Deno.test('buildListingBody adds the GTIN as ean and the offer from the cell', () => {
   const body = buildListingBody(context(), structuredClone(storyAttributes), urls, null);
   assertEquals(body.attributes.externally_assigned_product_identifier, [
      { type: 'ean', value: '4260696025800', marketplace_id: DE }
   ]);
   assertEquals(body.attributes.purchasable_offer, [
      { currency: 'EUR', our_price: [{ schedule: [{ value_with_tax: 24.9 }] }], marketplace_id: DE }
   ]);
   // The seller's stock is never part of the body (C5): only a new SKU gets an availability.
   assertEquals(body.attributes.fulfillment_availability, undefined);
   const typed = buildListingBody(
      context(),
      {
         ...structuredClone(storyAttributes),
         fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity: 7 }]
      },
      urls,
      null
   );
   assertEquals(typed.attributes.fulfillment_availability, undefined);

   // No price (or no currency): no offer, as serverProvided says (C3).
   const noPrice = buildListingBody(
      context({ cell: cell({ price: null }) }),
      structuredClone(storyAttributes),
      urls,
      null
   );
   assertEquals(noPrice.attributes.purchasable_offer, undefined);
   assertEquals(noPrice.attributes.fulfillment_availability, undefined);
});

Deno.test('a new SKU starts with FBM quantity 0, or FBA without a quantity (C5)', () => {
   const body = buildListingBody(context(), structuredClone(storyAttributes), urls, null);
   assertEquals(withNewItemAvailability(body, context()).attributes.fulfillment_availability, [
      { fulfillment_channel_code: 'DEFAULT', quantity: 0, marketplace_id: DE }
   ]);
   const fba = context({ cell: cell({ fulfillment_channel: 'fba' }) });
   assertEquals(withNewItemAvailability(body, fba).attributes.fulfillment_availability, [
      { fulfillment_channel_code: 'AMAZON_EU', marketplace_id: DE }
   ]);
   // No offer (no price, or a parent): no availability either.
   const noOffer = buildListingBody(
      context({ cell: cell({ price: null }) }),
      structuredClone(storyAttributes),
      urls,
      null
   );
   assertEquals(
      withNewItemAvailability(noOffer, context()).attributes.fulfillment_availability,
      undefined
   );
});

Deno.test(
   'an existing SKU is patched with the attributes the panel owns, never the stock (C5)',
   () => {
      const body = withNewItemAvailability(
         buildListingBody(context(), structuredClone(storyAttributes), urls, null),
         context()
      );
      const patch = listingPatch(body);
      assertEquals(patch.productType, 'LUGGAGE');
      assert(patch.patches.every((p) => p.op === 'replace'));
      assertEquals(
         patch.patches.map((p) => p.path).sort(),
         Object.keys(body.attributes)
            .filter((name) => name !== 'fulfillment_availability')
            .map((name) => `/attributes/${name}`)
            .sort()
      );
      assertEquals(
         patch.patches.find((p) => p.path === '/attributes/purchasable_offer')?.value,
         body.attributes.purchasable_offer
      );
   }
);

// The product card's brand, pack quantity and gross weight (the fixture's derivable attributes).
const carded = (over: Partial<ProductRow> = {}) =>
   product({ brand: 'OKAEI', pack_qty: 2, pack_gross_g: 400, ...over } as Partial<ProductRow>);
const { brand: _brand, ...unbranded } = storyAttributes;

Deno.test('buildListingBody derives the product card attributes the schema has', () => {
   const ctx = context({ product: carded({ unit_net_g: 180 } as Partial<ProductRow>) });
   const body = buildListingBody(ctx, structuredClone(unbranded), urls, null, fixture.schema);
   assertEquals(body.attributes.brand, [
      { value: 'OKAEI', language_tag: 'de_DE', marketplace_id: DE }
   ]);
   assertEquals(body.attributes.number_of_items, [{ value: 2, marketplace_id: DE }]);
   assertEquals(body.attributes.item_package_weight, [
      { value: 400, unit: 'grams', marketplace_id: DE }
   ]);
   // The fixture has no item_weight: the net weight is not sent.
   assertEquals(body.attributes.item_weight, undefined);
   // Without the schema nothing is derived.
   const plain = buildListingBody(ctx, structuredClone(unbranded), urls, null);
   assertEquals(plain.attributes.brand, undefined);
});

Deno.test('buildListingBody sends the user value over the derived one', () => {
   const attributes = {
      ...structuredClone(storyAttributes),
      item_package_weight: [{ value: 0.42, unit: 'kilograms' }]
   };
   const body = buildListingBody(
      context({ product: carded() }),
      attributes,
      urls,
      null,
      fixture.schema
   );
   assertEquals(body.attributes.brand, [
      { value: 'OKAEI', language_tag: 'de_DE', marketplace_id: DE }
   ]);
   assertEquals(body.attributes.item_package_weight, [
      { value: 0.42, unit: 'kilograms', marketplace_id: DE }
   ]);
   // A matched ASIN sends an offer only: nothing derived.
   const offer = buildListingBody(
      context({ product: carded() }),
      attributes,
      urls,
      'B07N4M94X4',
      fixture.schema
   );
   assertEquals(offer.attributes.brand, undefined);
});

Deno.test('buildListingBody replaces media references with public URLs', () => {
   const body = buildListingBody(context(), structuredClone(storyAttributes), urls, null);
   assertEquals(body.attributes.main_product_image_locator, [
      { media_location: urls[MEDIA], marketplace_id: DE }
   ]);
});

Deno.test('buildListingBody refuses a media reference without a copied image', () => {
   const error = assertThrows(
      () => buildListingBody(context(), structuredClone(storyAttributes), {}, null),
      HttpError
   );
   assertEquals(error.status, 422);
   assertEquals(error.message, 'listing_image_missing');
   assertEquals(error.details, ['main_product_image_locator']);
});

Deno.test('buildListingBody makes a parent without GTIN and a child that points at it', () => {
   const parent = product({
      id: '00000000-0000-4000-8000-00000000ad02',
      sku: 'THO-MOP-PARENT',
      gtin: '4260696025999',
      listing_attributes: {
         ...structuredClone(storyAttributes),
         variation_theme: [{ value: 'SIZE' }],
         merchant_suggested_asin: [{ value: 'B000000000' }]
      }
   });
   const child = product({ parent_id: '00000000-0000-4000-8000-00000000ad02' });
   const parentCell = cell({
      id: '00000000-0000-4000-8000-00000000ce02',
      product_id: '00000000-0000-4000-8000-00000000ad02',
      price: 19.9,
      platform_sku: 'PARENT-DE'
   });

   const parentBody = buildListingBody(
      context({ cell: parentCell, product: parent, children: [child], sku: 'PARENT-DE' }),
      parent.listing_attributes as Record<string, unknown[]>,
      urls,
      null
   );
   assertEquals(parentBody.attributes.externally_assigned_product_identifier, undefined);
   assertEquals(parentBody.attributes.merchant_suggested_asin, undefined);
   assertEquals(parentBody.attributes.parentage_level, [{ value: 'parent', marketplace_id: DE }]);
   assertEquals(parentBody.attributes.variation_theme, [{ value: 'SIZE', marketplace_id: DE }]);
   assertEquals(parentBody.attributes.purchasable_offer, undefined);
   assertEquals(parentBody.attributes.fulfillment_availability, undefined);

   const childBody = buildListingBody(
      context({ product: child, parent, parentCell }),
      structuredClone(storyAttributes),
      urls,
      null
   );
   assertEquals(childBody.attributes.parentage_level, [{ value: 'child', marketplace_id: DE }]);
   assertEquals(childBody.attributes.child_parent_sku_relationship, [
      { child_relationship_type: 'variation', parent_sku: 'PARENT-DE', marketplace_id: DE }
   ]);
   assertEquals(childBody.attributes.variation_theme, [{ value: 'SIZE', marketplace_id: DE }]);
   assertEquals(childBody.attributes.externally_assigned_product_identifier, [
      { type: 'ean', value: '4260696025800', marketplace_id: DE }
   ]);
});

Deno.test('buildListingBody sends an offer only for a matched ASIN', () => {
   const body = buildListingBody(context(), structuredClone(storyAttributes), urls, 'B07N4M94X4');
   assertEquals(body.requirements, 'LISTING_OFFER_ONLY');
   assertEquals(Object.keys(body.attributes).sort(), [
      'condition_type',
      'merchant_suggested_asin',
      'purchasable_offer'
   ]);
   assertEquals(body.attributes.merchant_suggested_asin, [
      { value: 'B07N4M94X4', marketplace_id: DE }
   ]);
   // An offer-only body sends no image, so a missing copy does not block it.
   buildListingBody(context(), structuredClone(storyAttributes), {}, 'B07N4M94X4');
});

// --- Language, SKU, URLs -------------------------------------------------------------------------

Deno.test('the listing language is the cell language, else the default; none is refused', () => {
   assertEquals(requireLanguageTag('DE', null), 'de_DE');
   assertEquals(requireLanguageTag('BE', null), 'fr_BE');
   assertEquals(requireLanguageTag('BE', 'nl_BE'), 'nl_BE');
   const error = assertThrows(() => requireLanguageTag('XX', null), HttpError);
   assertEquals([error.status, error.message], [422, 'listing_language_missing']);
});

Deno.test('skuFor prefers the cell SKU', () => {
   assertEquals(skuFor(cell({ platform_sku: 'THO-MOP40-2P-DE' }), product()), 'THO-MOP40-2P-DE');
   assertEquals(skuFor(cell({ platform_sku: '  ' }), product()), 'THO-MOP40-2P');
   assertEquals(skuFor(null, product()), 'THO-MOP40-2P');
});

Deno.test('refuses non-public image URLs in production', () => {
   const path = `${TENANT}/${MEDIA}/mop primary.png`;
   for (const base of ['http://127.0.0.1:54321', 'https://localhost:54321', 'https://kong:8000']) {
      const error = assertThrows(() => publicImageUrl(base, path, 'production'), HttpError);
      assertEquals([error.status, error.message], [422, 'listing_image_url_not_public']);
   }
   assertEquals(
      publicImageUrl('http://127.0.0.1:54321', path, 'sandbox'),
      `http://127.0.0.1:54321/storage/v1/object/public/listing-images/${TENANT}/${MEDIA}/mop%20primary.png`
   );
   assertEquals(
      publicImageUrl('https://abc.supabase.co/', path, 'production'),
      `https://abc.supabase.co/storage/v1/object/public/listing-images/${TENANT}/${MEDIA}/mop%20primary.png`
   );
});

Deno.test('mediaRefs lists each media id with the attributes that use it', () => {
   const refs = mediaRefs({
      main_product_image_locator: [{ media_location: `media:${MEDIA}` }],
      other_product_image_locator_1: [{ media_location: `media:${MEDIA}` }],
      swatch_product_image_locator: [{ media_location: 'https://example.com/a.png' }],
      item_name: [{ value: 'media:not-a-reference' }]
   });
   assertEquals(
      [...refs.entries()],
      [[MEDIA, ['main_product_image_locator', 'other_product_image_locator_1']]]
   );
});

// --- Amazon answers ------------------------------------------------------------------------------

/** The static sandbox's getListingsItem answer (summaries and issues as captured, trimmed). */
const SANDBOX_ITEM = {
   sku: 'GM-ZDPI-9B4E',
   summaries: [
      { marketplaceId: 'ATVPDKIKX0DER', asin: 'B071VG5N9D', status: ['BUYABLE'] },
      { marketplaceId: 'A2EUQ1WTGCTBG2', asin: 'B071VG5N9D', status: [] }
   ],
   issues: [
      {
         code: '90220',
         message: "'size' is required but not supplied.",
         severity: 'ERROR',
         attributeNames: ['size'],
         categories: ['MISSING_ATTRIBUTE', 'LISTING'],
         marketplaceIds: ['ATVPDKIKX0DER']
      },
      {
         code: '18027',
         message:
            'We believe the main image has text, logo, graphic, or watermark that is not permitted for this product type.',
         severity: 'ERROR',
         categories: ['INVALID_IMAGE', 'LISTING'],
         marketplaceIds: ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2']
      }
   ]
};

const SANDBOX_ACCEPTED = {
   sku: 'GM-ZDPI-9B4E',
   status: 'ACCEPTED',
   submissionId: 'f1dc2914-75dd-11ea-bc55-0242ac130003',
   issues: []
};

const SANDBOX_INVALID = {
   sku: 'VALIDATION_INVALID',
   status: 'INVALID',
   submissionId: 'a1c562c2-1695-11ee-be56-0242ac120002',
   issues: [
      {
         code: '90220',
         message: "'condition_type' is required but not supplied.",
         severity: 'ERROR',
         attributeNames: ['condition_type'],
         categories: ['MISSING_ATTRIBUTE', 'LISTING']
      }
   ]
};

Deno.test('parseSubmission reads the canned ACCEPTED and INVALID answers', () => {
   assertEquals(parseSubmission(SANDBOX_ACCEPTED), {
      status: 'accepted',
      submissionId: 'f1dc2914-75dd-11ea-bc55-0242ac130003',
      issues: []
   });
   const invalid = parseSubmission(SANDBOX_INVALID);
   assertEquals(invalid.status, 'invalid');
   assertEquals(invalid.issues[0].attributeNames, ['condition_type']);
   assertEquals(invalid.issues[0].severity, 'ERROR');
});

Deno.test('deriveListingState keeps issues without attributeNames', () => {
   const derived = deriveListingState(SANDBOX_ITEM, DE, true);
   assertEquals(derived.state, 'issues');
   assertEquals(derived.issues.length, 2);
   const image = derived.issues.find((issue) => issue.code === '18027');
   assert(image);
   assertEquals(image.attributeNames, []);
   assertEquals(image.categories, ['INVALID_IMAGE', 'LISTING']);
   // In production the US-only issues do not belong to DE.
   assertEquals(deriveListingState(SANDBOX_ITEM, DE, false).issues, []);
});

Deno.test('deriveListingState is live for BUYABLE without errors', () => {
   assertEquals(
      deriveListingState(
         {
            summaries: [
               { marketplaceId: 'A1PA6795UKMFR9', asin: 'B071VG5N9D', status: ['BUYABLE'] }
            ]
         },
         DE,
         false
      ),
      { state: 'live', asin: 'B071VG5N9D', issues: [] }
   );
   const warning = deriveListingState(
      {
         summaries: [{ marketplaceId: DE, asin: 'B071VG5N9D', status: ['DISCOVERABLE'] }],
         issues: [{ code: '1', message: 'm', severity: 'WARNING' }]
      },
      DE,
      false
   );
   assertEquals(warning.state, 'live');
   assertEquals(warning.issues.length, 1);
});

Deno.test(
   'deriveListingState is submitted when the marketplace has no summary yet (production)',
   () => {
      assertEquals(deriveListingState({ summaries: SANDBOX_ITEM.summaries }, DE, false), {
         state: 'submitted',
         asin: null,
         issues: []
      });
      assertEquals(deriveListingState({}, DE, false).state, 'submitted');
      // The sandbox reads its first summary, whatever marketplace it names.
      assertEquals(
         deriveListingState({ summaries: SANDBOX_ITEM.summaries }, DE, true).state,
         'live'
      );
   }
);

// --- Fakes ---------------------------------------------------------------------------------------

type Row = Record<string, unknown>;
type State = {
   tables: Record<string, Row[]>;
   rpcs: Array<{ name: string; args: Record<string, unknown>; client: string }>;
   inserts: Array<{ table: string; row: Row; client: string }>;
   updates: Array<{ table: string; patch: Row; client: string }>;
   storage: Record<string, Map<string, Blob>>;
   uploads: Array<{ bucket: string; path: string; contentType?: string }>;
   downloads: Array<{ bucket: string; path: string }>;
};

let ids = 0;

const newState = (tables: Record<string, Row[]>): State => ({
   tables: { listing_submission: [], ...tables },
   rpcs: [],
   inserts: [],
   updates: [],
   storage: { media: new Map(), 'listing-images': new Map() },
   uploads: [],
   downloads: []
});

const cellRow = (state: State, id: string) =>
   state.tables.market_cell.find((row) => row.id === id) as Row;

const latestOf = (state: State, cellId: string) =>
   state.tables.listing_submission
      .filter((row) => row.cell_id === cellId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

let versions = 0;

/** The 046 RPCs, reduced to what the function relies on. */
const rpc = (
   state: State,
   name: string,
   args: Record<string, unknown>,
   client: string
): { data: unknown; error: unknown } => {
   if (name === 'listing_begin_submission') {
      const target = cellRow(state, args.p_cell_id as string);
      const latest = latestOf(state, target.id as string);
      if (
         args.p_kind !== 'delete' &&
         latest &&
         latest.kind !== 'delete' &&
         ['accepted', 'processing'].includes(latest.status as string)
      )
         return { data: null, error: { code: 'P0001', message: 'listing_in_progress' } };
      const row: Row = {
         id: `s-${++ids}`,
         tenant_id: target.tenant_id,
         cell_id: target.id,
         kind: args.p_kind,
         sku: args.p_sku,
         marketplace_id: args.p_marketplace_id,
         payload: args.p_payload,
         status: 'processing',
         issues: [],
         amazon_submission_id: null,
         // auth.uid(): the caller of the user's client, none for the service role.
         created_by: client === 'user' ? 'user-1' : null,
         created_at: new Date(Date.parse('2026-11-06T10:00:00Z') + ids * 1000).toISOString()
      };
      state.tables.listing_submission.push(row);
      state.inserts.push({ table: 'listing_submission', row, client });
      if (args.p_kind !== 'delete') target.listing_state = 'submitted';
      return { data: { ...row }, error: null };
   }
   if (name === 'listing_apply_submission') {
      const submission = state.tables.listing_submission.find(
         (row) => row.id === args.p_submission_id
      )!;
      submission.status = args.p_status;
      submission.issues = args.p_issues;
      submission.amazon_submission_id =
         args.p_amazon_submission_id ?? submission.amazon_submission_id;
      const target = cellRow(state, submission.cell_id as string);
      // An older submission settles itself only (046: the latest decides the cell).
      if (latestOf(state, target.id as string) !== submission)
         return { data: { ...target }, error: null };
      target.listing_state = args.p_listing_state;
      // Issues win (046 fix round 1): the status walks only without issues.
      if (
         (args.p_status === 'accepted' || args.p_listing_state === 'live') &&
         args.p_listing_state !== 'issues'
      )
         target.status = 'uploaded';
      return { data: { ...target }, error: null };
   }
   if (name === 'listing_settle_removal') {
      const submission = state.tables.listing_submission.find(
         (row) => row.id === args.p_submission_id
      )!;
      if (submission.kind !== 'delete')
         return { data: null, error: { code: '22023', message: 'not a removal' } };
      submission.status = args.p_status;
      submission.issues = args.p_issues;
      submission.amazon_submission_id =
         args.p_amazon_submission_id ?? submission.amazon_submission_id;
      return { data: { ...submission }, error: null };
   }
   if (name === 'listing_set_state') {
      const target = cellRow(state, args.p_cell_id as string);
      // Written only over the version the caller read (046).
      if (args.p_expected_updated_at && args.p_expected_updated_at !== target.updated_at)
         return { data: { ...target }, error: null };
      target.listing_state = args.p_listing_state;
      if (args.p_listing_match) target.listing_match = args.p_listing_match;
      if (
         args.p_listing_state !== 'issues' &&
         String(target.open_issue ?? '').startsWith('Amazon: ')
      )
         target.open_issue = null;
      target.updated_at = `2026-11-06T11:00:00.${String(++versions).padStart(6, '0')}+00:00`;
      return { data: { ...target }, error: null };
   }
   if (name === 'listing_parent_cell') {
      const child = cellRow(state, args.p_cell_id as string);
      const childProduct = state.tables.product.find((row) => row.id === child.product_id)!;
      if (!childProduct.parent_id) return { data: null, error: null };
      let parentCell = state.tables.market_cell.find(
         (row) => row.product_id === childProduct.parent_id && row.country === child.country
      );
      if (!parentCell) {
         parentCell = {
            ...cell({
               id: '00000000-0000-4000-8000-00000000ce02',
               product_id: childProduct.parent_id as string,
               price: null,
               currency: null
            }),
            status: 'candidate'
         };
         state.tables.market_cell.push(parentCell);
      }
      return { data: parentCell.id, error: null };
   }
   if (name === 'amazon_account_token') return { data: 'Atzr|prod', error: null };
   return { data: null, error: null };
};

type Filter = (row: Row) => boolean;

/** A chainable PostgREST fake over `state.tables`: eq / in / order / limit / single / insert / update. */
const fakeDb = (state: State, client: string) => {
   const from = (table: string) => {
      const filters: Filter[] = [];
      let mode: 'select' | 'insert' | 'update' = 'select';
      let payload: Row | Row[] | undefined;
      let order: { column: string; ascending: boolean } | undefined;
      let limit: number | undefined;
      let single: 'single' | 'maybe' | undefined;

      const run = () => {
         const rows = (state.tables[table] ??= []);
         // C9: a user never writes a submission directly (046 revokes it; the RPCs write it).
         if (client === 'user' && table === 'listing_submission' && mode !== 'select')
            return { data: null, error: { code: '42501', message: 'permission denied' } };
         if (mode === 'insert') {
            const inserted = (Array.isArray(payload) ? payload : [payload!]).map((row) => ({
               id: `s-${++ids}`,
               status: 'processing',
               issues: [],
               amazon_submission_id: null,
               created_at: new Date(Date.parse('2026-11-06T10:00:00Z') + ids * 1000).toISOString(),
               ...row
            }));
            for (const row of inserted) state.inserts.push({ table, row, client });
            rows.push(...inserted);
            return { data: single ? inserted[0] : inserted, error: null };
         }
         let found = rows.filter((row) => filters.every((f) => f(row)));
         if (mode === 'update') {
            for (const row of found) Object.assign(row, payload);
            state.updates.push({ table, patch: payload as Row, client });
         }
         if (order) {
            const { column, ascending } = order;
            found = [...found].sort(
               (a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1)
            );
         }
         if (limit !== undefined) found = found.slice(0, limit);
         if (single === 'maybe') return { data: found[0] ?? null, error: null };
         if (single === 'single')
            return found[0]
               ? { data: found[0], error: null }
               : { data: null, error: { code: 'PGRST116' } };
         return { data: found, error: null };
      };

      const builder: Record<string, unknown> = {
         select: () => builder,
         insert: (row: Row | Row[]) => ((mode = 'insert'), (payload = row), builder),
         update: (patch: Row) => ((mode = 'update'), (payload = patch), builder),
         eq: (column: string, value: unknown) => (
            filters.push((row) => row[column] === value), builder
         ),
         in: (column: string, values: unknown[]) => (
            filters.push((row) => values.includes(row[column])), builder
         ),
         order: (column: string, opts?: { ascending?: boolean }) => (
            (order = { column, ascending: opts?.ascending ?? true }), builder
         ),
         limit: (n: number) => ((limit = n), builder),
         single: () => ((single = 'single'), builder),
         maybeSingle: () => ((single = 'maybe'), builder),
         then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve().then(run).then(resolve, reject)
      };
      return builder;
   };

   const storage = {
      from: (bucket: string) => ({
         list: (dir: string, opts?: { search?: string }) => {
            const names = [...(state.storage[bucket]?.keys() ?? [])]
               .filter((path) => path.startsWith(`${dir}/`))
               .map((path) => path.slice(dir.length + 1))
               .filter((name) => !opts?.search || name === opts.search);
            return Promise.resolve({ data: names.map((name) => ({ name })), error: null });
         },
         download: (path: string) => {
            state.downloads.push({ bucket, path });
            const blob = state.storage[bucket]?.get(path);
            return Promise.resolve(
               blob
                  ? { data: blob, error: null }
                  : { data: null, error: new Error('Object not found') }
            );
         },
         upload: (path: string, blob: Blob, opts?: { contentType?: string }) => {
            state.uploads.push({ bucket, path, contentType: opts?.contentType });
            state.storage[bucket].set(path, blob);
            return Promise.resolve({ data: { path }, error: null });
         }
      })
   };

   return {
      from,
      storage,
      rpc: (name: string, args: Record<string, unknown>) => {
         state.rpcs.push({ name, args, client });
         return Promise.resolve(rpc(state, name, args, client));
      }
   } as unknown as SupabaseClient<Database>;
};

const ENV: AmazonEnv = {
   env: 'sandbox',
   region: 'eu',
   clientId: 'amzn1.application-oa2-client.test',
   clientSecret: 'shh',
   selfRefreshToken: 'Atzr|self',
   sellerId: 'A2SELLER'
};

type Call = { method: string; url: string; body?: unknown };

/** LWA answers a token; SP-API calls are answered by `answer` (method + URL). */
const fakeAmazon = (answer: (call: Call) => Response) => {
   const calls: Call[] = [];
   const deps: Partial<Deps> = {
      fetch: (input, init) => {
         const url = String(input);
         if (url === 'https://api.amazon.com/auth/o2/token')
            return Promise.resolve(Response.json({ access_token: 'Atza|t', expires_in: 3600 }));
         const call = {
            method: init?.method ?? 'GET',
            url,
            body: init?.body ? JSON.parse(String(init.body)) : undefined
         };
         calls.push(call);
         return Promise.resolve(answer(call));
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
      sleep: () => Promise.resolve()
   };
   return { deps, calls };
};

const definitionRow = () => ({
   ...toDefinitionRow(fixture, undefined, 'en_GB'),
   fetched_at: '2026-11-06T00:00:00Z'
});

const story = (): State =>
   newState({
      market_cell: [cell()],
      product: [product()],
      // The fixture under its own key (en_GB) and under DE's production key (de_DE).
      amazon_product_type_definition: [definitionRow(), { ...definitionRow(), locale: 'de_DE' }],
      customer_platform_account: [
         {
            id: 'acc-1',
            tenant_id: TENANT,
            customer_id: CUSTOMER,
            platform_id: 'amazon',
            api_connection: 'connected',
            seller_id: 'A2SELLER'
         }
      ],
      media: [
         {
            id: MEDIA,
            tenant_id: TENANT,
            storage_path: `${TENANT}/${MEDIA}/mop-primary.png`,
            file_name: 'mop-primary.png',
            mime_type: 'image/png'
         }
      ]
   });

const withMediaObject = (state: State) => {
   state.storage.media.set(
      `${TENANT}/${MEDIA}/mop-primary.png`,
      new Blob(['png'], { type: 'image/png' })
   );
   return state;
};

const deps = (
   state: State,
   amazon: Partial<Deps>,
   overrides: Partial<HandlerDeps> = {}
): Partial<HandlerDeps> => ({
   amazon,
   env: () => ENV,
   db: () => fakeDb(state, 'user'),
   service: () => serviceRole(fakeDb(state, 'service')),
   authorize: (_req, _required, run) => run({ tenantId: TENANT, userId: 'user-1' }),
   publicUrl: () => PUBLIC_BASE,
   ...overrides
});

const post = (body: unknown, authorization = 'Bearer user-jwt') =>
   new Request('http://localhost/amazon-listing', {
      method: 'POST',
      headers: { Authorization: authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body)
   });

const PUT_ACCEPTED = () => Response.json(SANDBOX_ACCEPTED);

// --- Images --------------------------------------------------------------------------------------

Deno.test('copyListingImages copies a new image once and gives its public URL', async () => {
   const state = withMediaObject(story());
   const db = fakeDb(state, 'user');
   const storage = fakeDb(state, 'service').storage;
   const refs = new Map([[MEDIA, ['main_product_image_locator']]]);
   const first = await copyListingImages(db, storage, TENANT, refs, PUBLIC_BASE, 'sandbox');
   assertEquals(first, {
      [MEDIA]: `${PUBLIC_BASE}/storage/v1/object/public/listing-images/${TENANT}/${MEDIA}/mop-primary.png`
   });
   assertEquals(state.downloads, [{ bucket: 'media', path: `${TENANT}/${MEDIA}/mop-primary.png` }]);
   assertEquals(state.uploads, [
      {
         bucket: 'listing-images',
         path: `${TENANT}/${MEDIA}/mop-primary.png`,
         contentType: 'image/png'
      }
   ]);

   // The object already exists: no second download or upload.
   await copyListingImages(db, storage, TENANT, refs, PUBLIC_BASE, 'sandbox');
   assertEquals(state.downloads.length, 1);
   assertEquals(state.uploads.length, 1);
});

Deno.test(
   'copyListingImages refuses missing media and non-images with the attribute names',
   async () => {
      const state = withMediaObject(story());
      state.tables.media.push({
         id: MEDIA_2,
         tenant_id: TENANT,
         storage_path: `${TENANT}/${MEDIA_2}/spec.pdf`,
         file_name: 'spec.pdf',
         mime_type: 'application/pdf'
      });
      const refs = new Map([
         [MEDIA, ['main_product_image_locator']],
         [MEDIA_2, ['other_product_image_locator_1']],
         ['5eed0009-0000-4000-8000-00000000dead', ['swatch_product_image_locator']]
      ]);
      const error = await assertRejects(
         () =>
            copyListingImages(
               fakeDb(state, 'user'),
               fakeDb(state, 'service').storage,
               TENANT,
               refs,
               PUBLIC_BASE,
               'sandbox'
            ),
         HttpError
      );
      assertEquals([error.status, error.message], [422, 'listing_image_missing']);
      assertEquals(error.details, [
         'other_product_image_locator_1',
         'swatch_product_image_locator'
      ]);
      assertEquals(state.uploads, []);

      // A media row whose object is gone from storage is missing too.
      const gone = story();
      const goneError = await assertRejects(
         () =>
            copyListingImages(
               fakeDb(gone, 'user'),
               fakeDb(gone, 'service').storage,
               TENANT,
               new Map([[MEDIA, ['main_product_image_locator']]]),
               PUBLIC_BASE,
               'sandbox'
            ),
         HttpError
      );
      assertEquals(goneError.details, ['main_product_image_locator']);
   }
);

// --- Handler -------------------------------------------------------------------------------------

Deno.test(
   'publish begins the submission as the caller, puts the body and applies accepted',
   async () => {
      clearTokenCache();
      const state = withMediaObject(story());
      const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
      let required: unknown;
      const res = await handler(
         post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(state, amazon, {
            authorize: (_req, r, run) => (
               (required = r), run({ tenantId: TENANT, userId: 'user-1' })
            )
         })
      );
      assertEquals(res.status, 200);
      assertEquals(required, [['insert', 'listing_submission']]);
      const body = await res.json();
      assertEquals(body.cell.listing_state, 'submitted');
      assertEquals(body.submission.status, 'accepted');
      assertEquals(body.submission.amazon_submission_id, 'f1dc2914-75dd-11ea-bc55-0242ac130003');

      assertEquals(state.inserts.length, 1);
      const insert = state.inserts[0];
      // The submission is written by 046's RPC as the caller (C9: never directly), its author.
      assertEquals(insert.client, 'user');
      assertEquals(insert.row.created_by, 'user-1');
      assertEquals(insert.row.kind, 'create');
      assertEquals(insert.row.sku, 'THO-MOP40-2P');
      assertEquals(insert.row.marketplace_id, DE);
      assertEquals(insert.row.tenant_id, TENANT);

      assertEquals(calls.length, 1);
      assertEquals(calls[0].method, 'PUT');
      assert(
         calls[0].url.startsWith(
            'https://sandbox.sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/A2SELLER/THO-MOP40-2P?'
         )
      );
      assert(calls[0].url.includes('marketplaceIds=A1PA6795UKMFR9'));
      assertEquals(calls[0].body, insert.row.payload);
      const sent = calls[0].body as { attributes: Record<string, Array<Record<string, unknown>>> };
      // A first publish creates the SKU: FBM starts at 0.
      assertEquals(sent.attributes.fulfillment_availability, [
         { fulfillment_channel_code: 'DEFAULT', quantity: 0, marketplace_id: DE }
      ]);
      assertEquals(
         sent.attributes.main_product_image_locator[0].media_location,
         `${PUBLIC_BASE}/storage/v1/object/public/listing-images/${TENANT}/${MEDIA}/mop-primary.png`
      );

      const apply = state.rpcs.find((r) => r.name === 'listing_apply_submission')!;
      assertEquals(apply.client, 'user');
      assertEquals(apply.args.p_status, 'accepted');
      assertEquals(apply.args.p_listing_state, 'submitted');
   }
);

Deno.test(
   'publish of an accepted answer with errors leaves the cell in issues (issues win)',
   async () => {
      clearTokenCache();
      const state = withMediaObject(story());
      const { deps: amazon } = fakeAmazon(() =>
         Response.json({
            ...SANDBOX_ACCEPTED,
            issues: [{ code: '18027', message: 'image', severity: 'ERROR' }]
         })
      );
      const res = await handler(
         post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(state, amazon)
      );
      assertEquals(res.status, 200);
      const apply = state.rpcs.find((r) => r.name === 'listing_apply_submission')!;
      assertEquals([apply.args.p_status, apply.args.p_listing_state], ['accepted', 'issues']);
      assertEquals(apply.args.p_issues, [
         { code: '18027', message: 'image', severity: 'ERROR', attributeNames: [] }
      ]);
      // The RPC fake keeps 046's rule: issues never walk the business status.
      assertEquals(cellRow(state, '00000000-0000-4000-8000-00000000ce01').status, 'planned');
   }
);

Deno.test(
   'publish refuses an incomplete cell and an unconnected account before any write',
   async () => {
      clearTokenCache();
      const incomplete = withMediaObject(story());
      (incomplete.tables.product[0].listing_attributes as Record<string, unknown>).brand = [];
      const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
      const res = await handler(
         post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(incomplete, amazon)
      );
      assertEquals(res.status, 422);
      const body = await res.json();
      assertEquals(body.message, 'listing_incomplete');
      assertEquals(body.details, [
         { attribute: 'brand', group: 'product_identity', reason: 'required' }
      ]);

      const unconnected = withMediaObject(story());
      unconnected.tables.customer_platform_account[0].api_connection = 'none';
      const res2 = await handler(
         post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(unconnected, amazon)
      );
      assertEquals(res2.status, 409);
      assertEquals((await res2.json()).message, 'amazon_not_connected');

      assertEquals([...incomplete.inserts, ...unconnected.inserts], []);
      assertEquals(calls, []);
   }
);

Deno.test('publish refuses a missing image before the insert', async () => {
   clearTokenCache();
   const state = story(); // the media row exists, its object does not
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 422);
   assertEquals(await res.json(), {
      message: 'listing_image_missing',
      details: ['main_product_image_locator']
   });
   assertEquals(state.inserts, []);
   assertEquals(calls, []);
});

Deno.test('publish refuses a local image base in production before the insert', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon, {
         env: () => ({ ...ENV, env: 'production', selfRefreshToken: undefined })
      })
   );
   assertEquals(res.status, 422);
   assertEquals((await res.json()).message, 'listing_image_url_not_public');
   assertEquals(state.inserts, []);
   assertEquals(state.uploads, []);
   assertEquals(calls, []);
});

Deno.test('publish marks the submission failed when Amazon throws after the insert', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   const seen: unknown[] = [];
   const { deps: amazon } = fakeAmazon(() => {
      // C4: the submission and the submitted cell exist before Amazon is called.
      seen.push([cellRow(state, CELL).listing_state, state.tables.listing_submission.length]);
      return new Response('{}', { status: 429 });
   });
   const res = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 429);
   assertEquals((await res.json()).message, 'amazon_throttled');
   assertEquals(state.inserts.length, 1);
   const apply = state.rpcs.filter((r) => r.name === 'listing_apply_submission');
   assertEquals(apply.length, 1);
   assertEquals(apply[0].args.p_submission_id, state.inserts[0].row.id);
   assertEquals(apply[0].args.p_status, 'failed');
   assertEquals(apply[0].args.p_listing_state, 'issues');
   assertEquals(apply[0].args.p_issues, [
      {
         code: 'amazon_throttled',
         message: 'amazon_throttled',
         severity: 'ERROR',
         attributeNames: []
      }
   ]);
   assert(seen.length > 0);
   assert(seen.every((entry) => (entry as unknown[])[0] === 'submitted'));
});

Deno.test('publish of a child creates the parent cell and publishes the parent first', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   state.tables.product[0].parent_id = '00000000-0000-4000-8000-00000000ad02';
   state.tables.product.push(
      product({
         id: '00000000-0000-4000-8000-00000000ad02',
         sku: 'THO-MOP40',
         gtin: null,
         listing_attributes: {
            ...structuredClone(storyAttributes),
            variation_theme: [{ value: 'SIZE' }]
         }
      })
   );
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 200);
   assertEquals((await res.json()).cell.id, '00000000-0000-4000-8000-00000000ce01');

   assert(
      state.rpcs.some(
         (r) =>
            r.name === 'listing_parent_cell' &&
            r.args.p_cell_id === '00000000-0000-4000-8000-00000000ce01'
      )
   );
   assertEquals(
      state.inserts.map((i) => i.row.cell_id),
      ['00000000-0000-4000-8000-00000000ce02', '00000000-0000-4000-8000-00000000ce01']
   );
   assertEquals(
      calls.map((c) => new URL(c.url).pathname.split('/').pop()),
      ['THO-MOP40', 'THO-MOP40-2P']
   );
   const [parentBody, childBody] = calls.map(
      (c) => c.body as { attributes: Record<string, Array<Record<string, unknown>>> }
   );
   assertEquals(parentBody.attributes.parentage_level[0].value, 'parent');
   assertEquals(parentBody.attributes.externally_assigned_product_identifier, undefined);
   assertEquals(childBody.attributes.child_parent_sku_relationship[0].parent_sku, 'THO-MOP40');
   assertEquals(childBody.attributes.variation_theme[0].value, 'SIZE');

   // A second publish while the child's own create is in flight is refused (C2, C13).
   const before = [calls.length, state.inserts.length];
   const again = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals([again.status, (await again.json()).message], [409, 'listing_in_progress']);
   assertEquals([calls.length, state.inserts.length], before);
});

Deno.test('publish is an update once the cell has a done submission', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   state.tables.listing_submission.push({
      id: 's-old',
      tenant_id: TENANT,
      cell_id: '00000000-0000-4000-8000-00000000ce01',
      kind: 'create',
      status: 'done',
      created_at: '2026-11-01T00:00:00Z'
   });
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'publish', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 200);
   assertEquals(state.inserts[0].row.kind, 'update');
   // An update patches the panel's attributes and never sends a quantity (C5).
   assertEquals(
      calls.map((c) => c.method),
      ['PATCH']
   );
   const sent = calls[0].body as { patches: Array<{ path: string }> };
   assertEquals(calls[0].body, state.inserts[0].row.payload);
   assert(sent.patches.length > 0);
   assertFalse(JSON.stringify(sent).includes('fulfillment_availability'));
   assertFalse(JSON.stringify(sent).includes('quantity'));
});

Deno.test(
   'production asks Amazon whether the SKU exists: new is PUT, existing is PATCH (C5)',
   async () => {
      const prod = {
         env: () => ({ ...ENV, env: 'production' as const, selfRefreshToken: undefined }),
         publicUrl: () => PROD_BASE
      };
      for (const exists of [false, true]) {
         clearTokenCache();
         const state = withMediaObject(story());
         const { deps: amazon, calls } = fakeAmazon((call) =>
            call.method === 'GET'
               ? exists
                  ? Response.json({ sku: 'THO-MOP40-2P', summaries: [] })
                  : Response.json(
                       { errors: [{ code: 'NOT_FOUND', message: 'nf' }] },
                       { status: 404 }
                    )
               : PUT_ACCEPTED()
         );
         const res = await handler(
            post({ action: 'publish', cell_id: CELL }),
            deps(state, amazon, prod)
         );
         assertEquals(res.status, 200);
         assertEquals(
            calls.map((c) => c.method),
            ['GET', exists ? 'PATCH' : 'PUT']
         );
         assertEquals(state.inserts[0].row.kind, exists ? 'update' : 'create');
         const sent = JSON.stringify(calls[1].body);
         assertEquals(sent.includes('"quantity":0'), !exists);
         assertEquals(sent.includes('fulfillment_availability'), !exists);
      }

      // A matched ASIN the seller may already sell: an existing SKU keeps its stock too.
      clearTokenCache();
      const matched = withMediaObject(story());
      cellRow(matched, CELL).listing_match = { asin: 'B07N4M94X4', restricted: false, reasons: [] };
      const { deps: amazon, calls } = fakeAmazon((call) =>
         call.method === 'GET' ? Response.json({ sku: 'THO-MOP40-2P' }) : PUT_ACCEPTED()
      );
      await handler(post({ action: 'publish', cell_id: CELL }), deps(matched, amazon, prod));
      assertEquals(
         calls.map((c) => c.method),
         ['GET', 'PATCH']
      );
      assertFalse(JSON.stringify(calls[1].body).includes('quantity'));
   }
);

Deno.test('publish is refused while the latest submission is in flight (C2, C13)', async () => {
   for (const status of ['accepted', 'processing']) {
      clearTokenCache();
      const state = withMediaObject(story());
      state.tables.listing_submission.push({
         id: 's-flight',
         tenant_id: TENANT,
         cell_id: CELL,
         kind: 'create',
         status,
         created_at: '2026-11-06T09:00:00Z'
      });
      const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
      const res = await handler(post({ action: 'publish', cell_id: CELL }), deps(state, amazon));
      assertEquals([res.status, (await res.json()).message], [409, 'listing_in_progress']);
      assertEquals([state.inserts, calls], [[], []]);
   }

   // A second publish that starts between the check and the row lock is refused by the RPC.
   clearTokenCache();
   const state = withMediaObject(story());
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const raced = await handler(
      post({ action: 'publish', cell_id: CELL }),
      deps(state, amazon, {
         db: () => {
            const db = fakeDb(state, 'user');
            const rpcOf = db.rpc.bind(db);
            return Object.assign(db, {
               rpc: (name: string, args: Record<string, unknown>) =>
                  name === 'listing_begin_submission'
                     ? Promise.resolve({
                          data: null,
                          error: { code: 'P0001', message: 'listing_in_progress' }
                       })
                     : rpcOf(name as never, args as never)
            }) as typeof db;
         }
      })
   );
   assertEquals([raced.status, (await raced.json()).message], [409, 'listing_in_progress']);
   assertEquals(calls, []);
});

Deno.test('validate previews on the sandbox NA host and writes nothing', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_INVALID));
   const res = await handler(
      post({ action: 'validate', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 200);
   const body = await res.json();
   assertEquals(body.status, 'INVALID');
   assertEquals(body.issues[0].attributeNames, ['condition_type']);
   const url = new URL(calls[0].url);
   assertEquals(url.host, 'sandbox.sellingpartnerapi-na.amazon.com');
   assertEquals(url.searchParams.get('mode'), 'VALIDATION_PREVIEW');
   assertEquals(url.searchParams.get('includedData'), 'identifiers,issues');
   assertEquals(url.searchParams.get('marketplaceIds'), 'ATVPDKIKX0DER');
   assertEquals([state.inserts, state.rpcs], [[], []]);
});

Deno.test(
   'check writes ready with a new-product match in sandbox and keeps a journey state',
   async () => {
      clearTokenCache();
      const state = withMediaObject(story());
      const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
      let required: unknown;
      const res = await handler(
         post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(state, amazon, {
            authorize: (_req, r, run) => (
               (required = r), run({ tenantId: TENANT, userId: 'user-1' })
            )
         })
      );
      assertEquals(required, [['insert', 'listing_submission']]);
      assertEquals(await res.json(), {
         missing: [],
         match: {
            asin: null,
            restricted: false,
            reasons: [],
            checked_at: '2026-11-06T10:00:00.000Z'
         },
         state: 'ready'
      });
      assertEquals(calls, []); // the static sandbox has no EAN catalogue answer
      const set = state.rpcs.find((r) => r.name === 'listing_set_state')!;
      assertEquals(set.args.p_listing_state, 'ready');
      assertEquals((set.args.p_listing_match as Record<string, unknown>).asin, null);
      // Written only over the version read (C2).
      assertEquals(set.args.p_expected_updated_at, VERSION);

      cellRow(state, '00000000-0000-4000-8000-00000000ce01').listing_state = 'submitted';
      const again = await handler(
         post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
         deps(state, amazon)
      );
      assertEquals((await again.json()).state, 'submitted');
   }
);

Deno.test('check matches the GTIN and reads restrictions in production', async () => {
   clearTokenCache();
   const state = story();
   const { deps: amazon, calls } = fakeAmazon((call) =>
      call.url.includes('/catalog/2022-04-01/items')
         ? Response.json({ numberOfResults: 1, items: [{ asin: 'B07N4M94X4' }] })
         : Response.json({
              restrictions: [
                 {
                    marketplaceId: DE,
                    conditionType: 'new_new',
                    reasons: [{ message: 'Approval required.' }]
                 },
                 {
                    marketplaceId: 'ATVPDKIKX0DER',
                    conditionType: 'new_new',
                    reasons: [{ message: 'US only' }]
                 }
              ]
           })
   );
   const res = await handler(
      post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon, {
         env: () => ({ ...ENV, env: 'production', selfRefreshToken: undefined })
      })
   );
   assertEquals(await res.json(), {
      missing: [],
      match: {
         asin: 'B07N4M94X4',
         restricted: true,
         reasons: ['Approval required.'],
         checked_at: '2026-11-06T10:00:00.000Z'
      },
      state: 'ready'
   });
   const catalog = new URL(calls[0].url);
   assertEquals(catalog.searchParams.get('identifiers'), '4260696025800');
   assertEquals(catalog.searchParams.get('identifiersType'), 'EAN');
   assertEquals(catalog.searchParams.get('includedData'), 'summaries');
   const restrictions = new URL(calls[1].url);
   assertEquals(restrictions.pathname, '/listings/2021-08-01/restrictions');
   assertEquals(restrictions.searchParams.get('conditionType'), 'new_new');
   assertEquals(restrictions.searchParams.get('sellerId'), 'A2SELLER');
});

Deno.test('check counts the attributes derived from the product card as filled', async () => {
   const state = story();
   state.tables.customer_platform_account[0].api_connection = 'revoked';
   state.tables.product[0] = carded({ listing_attributes: structuredClone(unbranded) });
   const { deps: amazon } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals((await res.json()).missing, []);

   // Without the brand on the card it is missing again.
   state.tables.product[0] = product({ listing_attributes: structuredClone(unbranded) });
   const again = await handler(
      post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(
      (await again.json()).missing.map((m: { attribute: string }) => m.attribute),
      ['brand']
   );
});

Deno.test('validate sends the derived attributes under the user values', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   state.tables.product[0] = carded({ listing_attributes: structuredClone(unbranded) });
   const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_INVALID));
   await handler(
      post({ action: 'validate', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   const sent = (calls[0].body as ListingBody).attributes;
   assertEquals(sent.brand, [{ value: 'OKAEI', language_tag: 'de_DE', marketplace_id: DE }]);
   assertEquals(sent.number_of_items, [{ value: 2, marketplace_id: DE }]);
});

Deno.test('check treats a cell without a connected account as draft', async () => {
   const state = story();
   state.tables.customer_platform_account[0].api_connection = 'revoked';
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'check', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(await res.json(), { missing: [], match: null, state: 'draft' });
   assertEquals(calls, []);
});

Deno.test('a check over a cell published meanwhile reports the stored state (C2)', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   // A publish lands while Amazon is asked: the cell moves on and its version changes.
   const { deps: amazon } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'check', cell_id: CELL }),
      deps(state, amazon, {
         db: () => {
            const db = fakeDb(state, 'user');
            const rpcOf = db.rpc.bind(db);
            return Object.assign(db, {
               rpc: (name: string, args: Record<string, unknown>) => {
                  if (name === 'listing_set_state') {
                     Object.assign(cellRow(state, CELL), {
                        listing_state: 'submitted',
                        updated_at: '2026-11-06T10:30:00.000001+00:00'
                     });
                  }
                  return rpcOf(name as never, args as never);
               }
            }) as typeof db;
         }
      })
   );
   assertEquals((await res.json()).state, 'submitted');
   assertEquals(cellRow(state, CELL).listing_state, 'submitted');
});

const submitted = (state: State, status = 'accepted', id = 's-1') => {
   cellRow(state, CELL).listing_state = 'submitted';
   state.tables.listing_submission.push({
      id,
      tenant_id: TENANT,
      cell_id: CELL,
      kind: 'create',
      sku: 'THO-MOP40-2P',
      marketplace_id: DE,
      status,
      issues: [],
      created_at: '2026-11-06T09:00:00Z'
   });
   return state;
};

Deno.test('status applies the sandbox item to the latest submission (user route)', async () => {
   clearTokenCache();
   const state = submitted(story());
   const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
   const res = await handler(post({ action: 'status', cell_id: CELL }), deps(state, amazon));
   assertEquals(res.status, 200);
   const body = await res.json();
   assertEquals(body.cell.listing_state, 'issues');
   assertEquals(body.submission.status, 'done');
   const url = new URL(calls[0].url);
   assertEquals(url.pathname, '/listings/2021-08-01/items/A2SELLER/THO-MOP40-2P');
   assertEquals(url.searchParams.get('includedData'), 'summaries,issues');
   const apply = state.rpcs.find((r) => r.name === 'listing_apply_submission')!;
   assertEquals([apply.args.p_status, apply.args.p_listing_state], ['done', 'issues']);
});

Deno.test('a service-key status call has no separate path: it goes through authorize', async () => {
   const state = submitted(story());
   const { deps: amazon } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
   let authorized = 0;
   const res = await handler(
      post({ action: 'status', cell_id: CELL }, 'Bearer service-key'),
      deps(state, amazon, {
         authorize: () => {
            authorized += 1;
            return Promise.reject(new HttpError(401, 'unauthorized'));
         }
      })
   );
   assertEquals([authorized, res.status], [1, 401]);
   assertEquals(state.rpcs, []);
});

// --- refreshListingStatus (_shared/listingStatus.ts, imported by amazon-poll) --------------------

Deno.test('refreshListingStatus never brings back a removed listing (C2, review #8)', async () => {
   clearTokenCache();
   const state = submitted(story(), 'done');
   state.tables.listing_submission.push({
      id: 's-delete',
      tenant_id: TENANT,
      cell_id: CELL,
      kind: 'delete',
      sku: 'THO-MOP40-2P',
      marketplace_id: DE,
      status: 'done',
      issues: [],
      created_at: '2026-11-06T09:30:00Z'
   });
   cellRow(state, CELL).listing_state = 'draft';
   const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
   const result = await refreshListingStatus(statusDeps(state, amazon), {
      tenantId: TENANT,
      cellId: CELL
   });
   assertEquals(result.submission.id, 's-delete');
   assertEquals(result.cell.listing_state, 'draft');
   assertEquals([calls, state.rpcs], [[], []]);
});

Deno.test(
   'a done listing Amazon no longer knows is removed, not processing again (C2)',
   async () => {
      clearTokenCache();
      const state = submitted(story(), 'done');
      cellRow(state, CELL).listing_state = 'issues';
      const { deps: amazon } = fakeAmazon(() =>
         Response.json({ errors: [{ code: 'NOT_FOUND', message: 'nf' }] }, { status: 404 })
      );
      const result = await refreshListingStatus(statusDeps(state, amazon), {
         tenantId: TENANT,
         cellId: CELL
      });
      assertEquals(result.submission.status, 'done');
      assertEquals(result.cell.listing_state, 'draft');
      assertEquals(
         state.rpcs.map((r) => r.name),
         ['listing_set_state']
      );

      // Amazon knows it but reports neither live nor issues: a done submission stays as it is.
      clearTokenCache();
      const quiet = submitted(story(), 'done');
      cellRow(quiet, CELL).listing_state = 'live';
      const { deps: answer } = fakeAmazon(() => Response.json({ summaries: [], issues: [] }));
      const kept = await refreshListingStatus(statusDeps(quiet, answer), {
         tenantId: TENANT,
         cellId: CELL
      });
      assertEquals([kept.submission.status, kept.cell.listing_state], ['done', 'live']);
      assertEquals(quiet.rpcs, []);
   }
);

Deno.test('the poll skips a done submission without calling Amazon (C6)', async () => {
   clearTokenCache();
   const state = submitted(story(), 'done');
   const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
   const result = await refreshListingStatus(
      statusDeps(state, amazon),
      { tenantId: TENANT, cellId: CELL },
      { skipDone: true }
   );
   assertEquals([result.submission.status, result.cell.listing_state], ['done', 'submitted']);
   assertEquals([calls, state.rpcs], [[], []]);
});

const statusDeps = (state: State, amazon: Partial<Deps>) => ({
   db: fakeDb(state, 'user'),
   service: serviceRole(fakeDb(state, 'service')),
   env: ENV,
   amazon
});

Deno.test('refreshListingStatus by submission applies a live summary with its ASIN', async () => {
   clearTokenCache();
   const state = submitted(story());
   const { deps: amazon } = fakeAmazon(() =>
      Response.json({
         summaries: [{ marketplaceId: DE, asin: 'B071VG5N9D', status: ['BUYABLE'] }],
         issues: []
      })
   );
   const result = await refreshListingStatus(statusDeps(state, amazon), {
      tenantId: TENANT,
      submissionId: 's-1'
   });
   assertEquals(result.cell.listing_state, 'live');
   assertEquals(result.submission.status, 'done');
   const apply = state.rpcs.find((r) => r.name === 'listing_apply_submission')!;
   assertEquals(apply.args.p_asin, 'B071VG5N9D');
   assertEquals(apply.client, 'user');
});

Deno.test('refreshListingStatus keeps an unknown SKU processing', async () => {
   clearTokenCache();
   const state = submitted(story());
   const { deps: amazon } = fakeAmazon(() =>
      Response.json({ errors: [{ code: 'NOT_FOUND', message: 'not found' }] }, { status: 404 })
   );
   const result = await refreshListingStatus(statusDeps(state, amazon), {
      tenantId: TENANT,
      cellId: CELL
   });
   assertEquals(result.submission.status, 'processing');
   assertEquals(result.cell.listing_state, 'submitted');
});

Deno.test(
   'refreshListingStatus leaves an invalid submission alone and scopes by tenant',
   async () => {
      const state = submitted(story(), 'invalid');
      const { deps: amazon, calls } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
      const result = await refreshListingStatus(statusDeps(state, amazon), {
         tenantId: TENANT,
         cellId: CELL
      });
      assertEquals(result.submission.status, 'invalid');
      assertEquals([calls, state.rpcs], [[], []]);

      const other = '00000000-0000-4000-8000-0000000000a2';
      const byCell = await assertRejects(
         () => refreshListingStatus(statusDeps(state, amazon), { tenantId: other, cellId: CELL }),
         HttpError
      );
      assertEquals([byCell.status, byCell.message], [404, 'listing_cell_not_found']);
      const bySubmission = await assertRejects(
         () =>
            refreshListingStatus(statusDeps(state, amazon), {
               tenantId: other,
               submissionId: 's-1'
            }),
         HttpError
      );
      assertEquals(
         [bySubmission.status, bySubmission.message],
         [404, 'listing_submission_not_found']
      );
   }
);

Deno.test('status needs insert on listing_submission: it spends the grant (C10)', async () => {
   const state = story();
   const { deps: amazon } = fakeAmazon(() => Response.json(SANDBOX_ITEM));
   let required: unknown;
   const res = await handler(
      post({ action: 'status', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon, {
         authorize: (_req, r, run) => ((required = r), run({ tenantId: TENANT, userId: 'user-1' }))
      })
   );
   assertEquals(required, [['insert', 'listing_submission']]);
   assertEquals(res.status, 404);
   assertEquals((await res.json()).message, 'listing_submission_not_found');
});

Deno.test('delete sends a delete submission and puts the cell back to draft', async () => {
   clearTokenCache();
   const state = story();
   cellRow(state, '00000000-0000-4000-8000-00000000ce01').listing_state = 'live';
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({ action: 'delete', cell_id: '00000000-0000-4000-8000-00000000ce01' }),
      deps(state, amazon)
   );
   assertEquals(res.status, 200);
   assertEquals(calls[0].method, 'DELETE');
   assertEquals(state.inserts[0].row.kind, 'delete');
   assertEquals(state.inserts[0].client, 'user');
   assertEquals(state.tables.listing_submission[0].status, 'done');
   // The removal is settled by 046's RPC as the user (a user never updates the row directly).
   const settle = state.rpcs.find((r) => r.name === 'listing_settle_removal')!;
   assertEquals([settle.client, settle.args.p_status], ['user', 'done']);
   assertEquals(state.updates, []);
   const set = state.rpcs.find((r) => r.name === 'listing_set_state')!;
   assertEquals([set.args.p_listing_state, set.args.p_listing_match], ['draft', null]);
   // A removal from issues clears the Amazon open issue (C18; 046 does it in listing_set_state).
   const fromIssues = story();
   Object.assign(cellRow(fromIssues, CELL), {
      listing_state: 'issues',
      open_issue: "Amazon: 'size' is required but not supplied."
   });
   const { deps: again } = fakeAmazon(() => PUT_ACCEPTED());
   await handler(post({ action: 'delete', cell_id: CELL }), deps(fromIssues, again));
   assertEquals(
      [cellRow(fromIssues, CELL).listing_state, cellRow(fromIssues, CELL).open_issue],
      ['draft', null]
   );
   // The business status is not walked by a delete.
   assertEquals(
      state.rpcs.some((r) => r.name === 'listing_apply_submission'),
      false
   );
});

Deno.test('publish_bulk reports products without a cell as skipped_no_cell', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   state.tables.product.push(
      product({ id: '00000000-0000-4000-8000-00000000ad03', sku: 'THO-OTHER' })
   );
   const { deps: amazon } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(
      post({
         action: 'publish_bulk',
         product_ids: [
            '00000000-0000-4000-8000-00000000ad01',
            '00000000-0000-4000-8000-00000000ad03'
         ],
         country: 'DE'
      }),
      deps(state, amazon)
   );
   assertEquals(res.status, 200);
   assertEquals(await res.json(), {
      results: [
         {
            product_id: '00000000-0000-4000-8000-00000000ad01',
            cell_id: '00000000-0000-4000-8000-00000000ce01',
            result: 'submitted'
         },
         {
            product_id: '00000000-0000-4000-8000-00000000ad03',
            cell_id: null,
            result: 'skipped_no_cell'
         }
      ],
      remaining: []
   });
});

Deno.test('publish_bulk reports incomplete and failed cells and goes on', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   state.tables.product.push(
      product({
         id: '00000000-0000-4000-8000-00000000ad04',
         sku: 'THO-TWO',
         listing_attributes: {}
      })
   );
   state.tables.market_cell.push(
      cell({
         id: '00000000-0000-4000-8000-00000000ce03',
         product_id: '00000000-0000-4000-8000-00000000ad04'
      })
   );
   const { deps: amazon } = fakeAmazon(() => Response.json(SANDBOX_INVALID));
   const res = await handler(
      post({
         action: 'publish_bulk',
         product_ids: [
            '00000000-0000-4000-8000-00000000ad04',
            '00000000-0000-4000-8000-00000000ad01'
         ],
         country: 'de'
      }),
      deps(state, amazon)
   );
   assertEquals(await res.json(), {
      results: [
         {
            product_id: '00000000-0000-4000-8000-00000000ad04',
            cell_id: '00000000-0000-4000-8000-00000000ce03',
            result: 'skipped_incomplete',
            code: 'listing_incomplete'
         },
         {
            product_id: '00000000-0000-4000-8000-00000000ad01',
            cell_id: '00000000-0000-4000-8000-00000000ce01',
            result: 'invalid'
         }
      ],
      remaining: []
   });
});

Deno.test('a child publish does not send a parent that Amazon is still processing', async () => {
   clearTokenCache();
   const state = withMediaObject(story());
   const PARENT = '00000000-0000-4000-8000-00000000ad02';
   const PARENT_CELL = '00000000-0000-4000-8000-00000000ce02';
   state.tables.product[0].parent_id = PARENT;
   state.tables.product.push(
      product({
         id: PARENT,
         sku: 'THO-MOP40',
         gtin: null,
         listing_attributes: {
            ...structuredClone(storyAttributes),
            variation_theme: [{ value: 'SIZE' }]
         }
      })
   );
   state.tables.market_cell.push(cell({ id: PARENT_CELL, product_id: PARENT, price: null }));
   // The parent's create was polled to processing by the status action.
   state.tables.listing_submission.push({
      id: 's-parent',
      tenant_id: TENANT,
      cell_id: PARENT_CELL,
      kind: 'create',
      status: 'processing',
      created_at: '2026-11-06T09:00:00Z'
   });
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(post({ action: 'publish', cell_id: CELL }), deps(state, amazon));
   assertEquals(res.status, 200);
   assertEquals(
      state.inserts.map((i) => i.row.cell_id),
      [CELL]
   );
   assertEquals(calls.length, 1);
});

Deno.test('delete withdraws a cell whose product type and language were cleared', async () => {
   clearTokenCache();
   const state = story();
   state.tables.product[0].amazon_product_type = null;
   cellRow(state, CELL).listing_language = 'xx_XX';
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const res = await handler(post({ action: 'delete', cell_id: CELL }), deps(state, amazon));
   assertEquals(res.status, 200);
   assertEquals(calls[0].method, 'DELETE');
   assertEquals(state.inserts[0].row.sku, 'THO-MOP40-2P');
   assertEquals(state.inserts[0].row.marketplace_id, DE);
});

Deno.test("another tenant's cell is not found", async () => {
   const state = withMediaObject(story());
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const other = deps(state, amazon, {
      authorize: (_req, _r, run) =>
         run({ tenantId: '00000000-0000-4000-8000-0000000000a2', userId: 'user-2' })
   });
   for (const action of ['check', 'validate', 'publish', 'delete', 'status']) {
      const res = await handler(post({ action, cell_id: CELL }), other);
      assertEquals(
         [action, res.status, (await res.json()).message],
         [action, 404, 'listing_cell_not_found']
      );
   }
   assertEquals([state.inserts, state.rpcs, calls], [[], [], []]);
});

Deno.test('a refused authorize stops the action', async () => {
   const state = withMediaObject(story());
   const { deps: amazon, calls } = fakeAmazon(() => PUT_ACCEPTED());
   const refused = await handler(
      post({ action: 'publish', cell_id: CELL }),
      deps(state, amazon, {
         authorize: () => Promise.reject(new HttpError(403, 'forbidden'))
      })
   );
   assertEquals([refused.status, (await refused.json()).message], [403, 'forbidden']);

   // The real withAuthorization: no JWT is 401 before any database access.
   const noJwt = await handler(
      new Request('http://localhost/amazon-listing', {
         method: 'POST',
         body: JSON.stringify({ action: 'publish', cell_id: CELL })
      }),
      deps(state, amazon, { authorize: withAuthorization })
   );
   assertEquals([noJwt.status, (await noJwt.json()).message], [401, 'unauthorized']);
   assertEquals([state.inserts, state.rpcs, state.uploads, calls], [[], [], [], []]);
});

Deno.test('publish_bulk logs only the code and message of an unexpected error', async () => {
   const state = withMediaObject(story());
   const { deps: amazon } = fakeAmazon(() => PUT_ACCEPTED());
   const logged: unknown[][] = [];
   const original = console.error;
   console.error = (...args: unknown[]) => void logged.push(args);
   try {
      const res = await handler(
         post({
            action: 'publish_bulk',
            product_ids: ['00000000-0000-4000-8000-00000000ad01'],
            country: 'DE'
         }),
         deps(state, amazon, {
            db: () => {
               const db = fakeDb(state, 'user');
               const rpcOf = db.rpc.bind(db);
               return Object.assign(db, {
                  rpc: (name: string, args: Record<string, unknown>) => {
                     if (name === 'listing_begin_submission')
                        throw Object.assign(new Error('boom'), { detail: 'raw object field' });
                     return rpcOf(name as never, args as never);
                  }
               }) as typeof db;
            }
         })
      );
      assertEquals((await res.json()).results[0], {
         product_id: '00000000-0000-4000-8000-00000000ad01',
         cell_id: CELL,
         result: 'error',
         code: 'internal_error'
      });
   } finally {
      console.error = original;
   }
   assertEquals(logged, [['amazon-listing bulk publish failed: internal_error boom']]);
});

Deno.test(
   'publish_bulk takes 10 products at most and stops starting after its budget (C4)',
   async () => {
      const ids11 = Array.from(
         { length: 11 },
         (_, i) => `00000000-0000-4000-8000-0000000a${String(i).padStart(4, '0')}`
      );
      const tooMany = await handler(
         post({ action: 'publish_bulk', product_ids: ids11, country: 'DE' }),
         deps(story(), {})
      );
      assertEquals(tooMany.status, 422);

      clearTokenCache();
      const state = withMediaObject(story());
      const { deps: amazon } = fakeAmazon(() => PUT_ACCEPTED());
      let clock = Date.parse('2026-11-06T10:00:00Z');
      const ids = ['00000000-0000-4000-8000-00000000ad01', ...ids11.slice(0, 3)];
      const res = await handler(
         post({ action: 'publish_bulk', product_ids: ids, country: 'DE' }),
         deps(state, {
            ...amazon,
            // Each reading moves the clock on: the first product uses up the budget.
            now: () => (clock += 31_000)
         })
      );
      const body = await res.json();
      assertEquals(body.results.length, 1);
      assertEquals(body.results[0].result, 'submitted');
      assertEquals(body.remaining, ids.slice(1));
   }
);

Deno.test('an unknown action is refused', async () => {
   const res = await handler(post({ action: 'nope' }), deps(story(), {}));
   assertEquals(res.status, 422);
   assertEquals((await res.json()).message, 'invalid_request');
});

Deno.test(
   'the service role, made for the caller, only reads the token and marks a revoked grant',
   async () => {
      clearTokenCache();
      const state = story();
      const serviceFor: string[] = [];
      const amazon: Partial<Deps> = {
         fetch: () => Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 })),
         now: () => Date.parse('2026-11-06T10:00:00Z'),
         sleep: () => Promise.resolve()
      };
      const res = await handler(
         post({ action: 'check', cell_id: CELL }),
         deps(state, amazon, {
            env: () => ({ ...ENV, env: 'production', selfRefreshToken: undefined }),
            service: (userId) => (serviceFor.push(userId), serviceRole(fakeDb(state, 'service')))
         })
      );
      assertEquals(res.status, 409);
      assertEquals((await res.json()).message, 'amazon_connection_revoked');
      assertEquals(serviceFor, ['user-1']);
      assertEquals(
         state.rpcs.filter((r) => r.client === 'service').map((r) => [r.name, r.args.p_state]),
         [
            ['amazon_account_token', undefined],
            ['amazon_account_disconnect', 'revoked']
         ]
      );
      assert(state.rpcs.filter((r) => r.client !== 'service').every((r) => r.client === 'user'));
      assertEquals(state.updates, []);
   }
);

Deno.test(
   'a delete Amazon refuses settles the removal failed, sending every RPC argument',
   async () => {
      clearTokenCache();
      const state = story();
      cellRow(state, CELL).listing_state = 'live';
      const { deps: amazon } = fakeAmazon(() =>
         Response.json({ errors: [{ code: 'InternalFailure', message: 'down' }] }, { status: 400 })
      );
      const res = await handler(post({ action: 'delete', cell_id: CELL }), deps(state, amazon));
      assert(res.status >= 400);
      const settle = state.rpcs.find((r) => r.name === 'listing_settle_removal')!;
      assertEquals(settle.client, 'user');
      assertEquals(settle.args.p_status, 'failed');
      // PostgREST resolves the function by its argument names: a missing key is no such function.
      assertEquals(Object.hasOwn(settle.args, 'p_amazon_submission_id'), true);
      assertEquals(settle.args.p_amazon_submission_id, null);
   }
);
