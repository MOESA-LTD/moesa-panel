// The pure parts of amazon-listing: the Listings Items body, Amazon's answers, the listing state
// derived from getListingsItem, the public image URLs and the copy into the listing-images bucket.
import { AmazonError, type AmazonEnv, type SpapiCall } from '../_shared/amazon.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import {
   type AmazonSchema,
   type Attributes,
   languageTag,
   providedAttributes,
   serverProvided,
   withProvided
} from '../_shared/listingCompleteness.ts';
import { type AmazonIssue, listingItemPath, toIssue } from '../_shared/listingStatus.ts';

export { serverProvided };
// The issue shape, the derived state and the GET live in _shared/listingStatus.ts (amazon-poll
// imports them from there); they are re-exported for this function's callers and tests.
export {
   type AmazonIssue,
   deriveListingState,
   getListingsItem,
   hasError,
   type ItemSummary,
   LISTINGS_ITEMS,
   toIssue
} from '../_shared/listingStatus.ts';

export type { ListingSubmissionRow, MarketCellRow } from '../_shared/listingStatus.ts';
import type { MarketCellRow } from '../_shared/listingStatus.ts';
export type ProductRow = Database['public']['Tables']['product']['Row'];

export type CellContext = {
   cell: MarketCellRow;
   product: ProductRow;
   /** The product's parent (R7), when it has one. */
   parent: ProductRow | null;
   /** The parent's cell in the same platform and country, when it exists. */
   parentCell: MarketCellRow | null;
   /** The product's children: a product with children is an Amazon parent. */
   children: ProductRow[];
   marketplaceId: string;
   languageTag: string;
   /** The cell's currency; the offer is sent only with a price and a currency (C3). */
   currency: string | null;
   sku: string;
};

export const LISTINGS_RESTRICTIONS = '/listings/2021-08-01/restrictions';
export const CATALOG_ITEMS = '/catalog/2022-04-01/items';
export const LISTING_IMAGES_BUCKET = 'listing-images';
const MEDIA_BUCKET = 'media';
const COPIED_TYPES = new Set(['image/png', 'image/jpeg']);

/** A reference to a media library item in an attribute's `media_location`. */
export const MEDIA_REF = /^media:([0-9a-f-]{36})$/;

const isBlank = (value: unknown) =>
   value == null || (typeof value === 'string' && value.trim() === '');

/** The cell's SKU on the platform, else the product SKU. */
export function skuFor(
   cell: Pick<MarketCellRow, 'platform_sku'> | null,
   product: Pick<ProductRow, 'sku'>
): string {
   const own = cell?.platform_sku;
   return isBlank(own) ? product.sku : (own as string).trim();
}

/** D5: the cell's listing language, else the marketplace default; none is refused, never guessed. */
export function requireLanguageTag(country: string, listingLanguage: string | null): string {
   const tag = languageTag(country, listingLanguage);
   if (!tag) throw new HttpError(422, 'listing_language_missing');
   return tag;
}

type Entry = Record<string, unknown>;
const isEntry = (value: unknown): value is Entry =>
   typeof value === 'object' && value !== null && !Array.isArray(value);

/** Each referenced media id with the attributes that reference it, in attribute order. */
export function mediaRefs(attributes: Attributes): Map<string, string[]> {
   const refs = new Map<string, string[]>();
   for (const [name, entries] of Object.entries(attributes)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
         const id =
            isEntry(entry) && typeof entry.media_location === 'string'
               ? MEDIA_REF.exec(entry.media_location)?.[1]
               : undefined;
         if (!id) continue;
         const names = refs.get(id) ?? [];
         if (!names.includes(name)) names.push(name);
         refs.set(id, names);
      }
   }
   return refs;
}

/** The entries of one attribute for this marketplace and language, stamped with the marketplace. */
const forMarketplace = (entries: unknown, ctx: CellContext): Entry[] =>
   (Array.isArray(entries) ? entries : [])
      .filter(isEntry)
      .filter((entry) => entry.marketplace_id == null || entry.marketplace_id === ctx.marketplaceId)
      .filter((entry) => entry.language_tag == null || entry.language_tag === ctx.languageTag)
      .map((entry) => ({ ...entry, marketplace_id: ctx.marketplaceId }));

/** Replaces `media:<id>` locations with the copied image's public URL. */
const withImageUrls = (attributes: Record<string, Entry[]>, imageUrls: Record<string, string>) => {
   const missing: string[] = [];
   const out: Record<string, Entry[]> = {};
   for (const [name, entries] of Object.entries(attributes)) {
      out[name] = entries.map((entry) => {
         const id =
            typeof entry.media_location === 'string'
               ? MEDIA_REF.exec(entry.media_location)?.[1]
               : undefined;
         if (!id) return entry;
         const url = imageUrls[id];
         if (!url) {
            if (!missing.includes(name)) missing.push(name);
            return entry;
         }
         return { ...entry, media_location: url };
      });
   }
   if (missing.length) throw new HttpError(422, 'listing_image_missing', missing);
   return out;
};

export type ListingBody = {
   productType: string;
   requirements: 'LISTING' | 'LISTING_OFFER_ONLY';
   attributes: Record<string, Entry[]>;
};

/** The cell's provided attributes: the server's and those derived from the product card. */
export const providedFor = (ctx: CellContext, schema: AmazonSchema | null) =>
   providedAttributes(ctx.product, ctx.cell, schema, {
      marketplaceId: ctx.marketplaceId,
      languageTag: ctx.languageTag,
      isParent: ctx.children.length > 0
   });

/**
 * The listing body of a cell. The product's attributes, with the ones derived from the product
 * card under them (the user's value wins; only the attributes `schema` has), are narrowed to the
 * cell's marketplace and language; the server adds the GTIN, the offer (with a price and a
 * currency), the variation attributes (R7) and the public image URLs. A matched ASIN sends an
 * offer only. It carries no fulfillment_availability: a create adds it (withNewItemAvailability),
 * an update never does.
 */
export function buildListingBody(
   ctx: CellContext,
   attributes: Attributes,
   imageUrls: Record<string, string>,
   matchedAsin: string | null,
   schema: AmazonSchema | null = null
): ListingBody {
   const productType = ctx.product.amazon_product_type;
   if (!productType) throw new HttpError(422, 'listing_product_type_missing');
   const marketplace_id = ctx.marketplaceId;

   const merged = withProvided(attributes, providedFor(ctx, schema), ctx);
   const attrs: Record<string, Entry[]> = {};
   for (const [name, entries] of Object.entries(merged)) {
      const kept = forMarketplace(entries, ctx);
      if (kept.length) attrs[name] = kept;
   }

   const provided = serverProvided(ctx.product, ctx.cell);
   const isParent = ctx.children.length > 0;

   if (!isParent && !isBlank(ctx.product.gtin) && !attrs.externally_assigned_product_identifier) {
      attrs.externally_assigned_product_identifier = [
         { type: 'ean', value: (ctx.product.gtin as string).trim(), marketplace_id }
      ];
   }

   // A variation parent is not buyable: it carries no offer (R7). The seller's stock
   // (fulfillment_availability) is never sent here: see withNewItemAvailability.
   delete attrs.fulfillment_availability;
   if (!isParent && provided.includes('purchasable_offer')) {
      attrs.purchasable_offer = [
         {
            currency: ctx.currency,
            our_price: [{ schedule: [{ value_with_tax: Number(ctx.cell.price) }] }],
            marketplace_id
         }
      ];
   }

   if (isParent) {
      delete attrs.externally_assigned_product_identifier;
      delete attrs.merchant_suggested_asin;
      attrs.parentage_level = [{ value: 'parent', marketplace_id }];
   } else if (ctx.parent) {
      attrs.parentage_level = [{ value: 'child', marketplace_id }];
      attrs.child_parent_sku_relationship = [
         {
            child_relationship_type: 'variation',
            parent_sku: skuFor(ctx.parentCell, ctx.parent),
            marketplace_id
         }
      ];
      const theme = forMarketplace(
         (ctx.parent.listing_attributes as Attributes | null)?.variation_theme,
         ctx
      );
      if (theme.length) attrs.variation_theme = theme;
   }

   if (matchedAsin) {
      const offerOnly: Record<string, Entry[]> = {
         merchant_suggested_asin: [{ value: matchedAsin, marketplace_id }]
      };
      for (const name of ['condition_type', 'purchasable_offer']) {
         if (attrs[name]) offerOnly[name] = attrs[name];
      }
      return { productType, requirements: 'LISTING_OFFER_ONLY', attributes: offerOnly };
   }

   return { productType, requirements: 'LISTING', attributes: withImageUrls(attrs, imageUrls) };
}

/**
 * The availability a NEW SKU is created with (a putListingsItem create only): FBM starts at
 * quantity 0 (stock sync is a v1 non-goal), FBA names Amazon's channel and sends no quantity.
 * Without an offer (a parent, or no price) nothing is added. An existing SKU never gets it, so the
 * stock the seller keeps in Seller Central is never overwritten.
 */
export function withNewItemAvailability(body: ListingBody, ctx: CellContext): ListingBody {
   if (!body.attributes.purchasable_offer) return body;
   const marketplace_id = ctx.marketplaceId;
   const availability =
      ctx.cell.fulfillment_channel === 'fba'
         ? { fulfillment_channel_code: 'AMAZON_EU', marketplace_id }
         : { fulfillment_channel_code: 'DEFAULT', quantity: 0, marketplace_id };
   return {
      ...body,
      attributes: { ...body.attributes, fulfillment_availability: [availability] }
   };
}

/** A patchListingsItem body: the product type and JSON patches. */
export type ListingPatch = {
   productType: string;
   patches: Array<{ op: 'replace'; path: string; value: Entry[] }>;
};

/**
 * The patchListingsItem body of an existing SKU: a `replace` of each attribute the panel owns (all
 * the body carries, never fulfillment_availability), so Amazon keeps everything else, the seller's
 * stock included.
 */
export function listingPatch(body: ListingBody): ListingPatch {
   return {
      productType: body.productType,
      patches: Object.entries(body.attributes)
         .filter(([name]) => name !== 'fulfillment_availability')
         .map(([name, value]) => ({ op: 'replace', path: `/attributes/${name}`, value }))
   };
}

// --- Amazon's answers ----------------------------------------------------------------------------

/** putListingsItem / deleteListingsItem: Amazon answers ACCEPTED or INVALID. */
export function parseSubmission(resp: {
   status: string;
   submissionId: string;
   issues?: unknown[];
}): { status: 'accepted' | 'invalid'; submissionId: string; issues: AmazonIssue[] } {
   return {
      status: resp.status === 'ACCEPTED' ? 'accepted' : 'invalid',
      submissionId: resp.submissionId,
      issues: (resp.issues ?? []).map(toIssue)
   };
}

// --- Calls ---------------------------------------------------------------------------------------

type SubmissionResponse = { status: string; submissionId: string; issues?: unknown[] };

const itemPath = listingItemPath;

/** putListingsItem: a full replace of the listing (or, with `mode`, a VALIDATION_PREVIEW). */
export function putListingsItem(
   call: SpapiCall,
   sellerId: string,
   sku: string,
   marketplaceId: string,
   body: ListingBody,
   mode?: 'VALIDATION_PREVIEW'
): Promise<SubmissionResponse> {
   return call<SubmissionResponse>({
      method: 'PUT',
      path: itemPath(sellerId, sku),
      query: mode
         ? { marketplaceIds: marketplaceId, includedData: ['identifiers', 'issues'], mode }
         : { marketplaceIds: marketplaceId, includedData: ['issues'] },
      body
   });
}

/** patchListingsItem: replaces the attributes the patch names, nothing else. */
export function patchListingsItem(
   call: SpapiCall,
   sellerId: string,
   sku: string,
   marketplaceId: string,
   body: ListingPatch
): Promise<SubmissionResponse> {
   return call<SubmissionResponse>({
      method: 'PATCH',
      path: itemPath(sellerId, sku),
      query: { marketplaceIds: marketplaceId, includedData: ['issues'] },
      body
   });
}

/** Whether Amazon has the SKU in the marketplace (getListingsItem; its 404 means no). */
export async function listingExists(
   call: SpapiCall,
   sellerId: string,
   sku: string,
   marketplaceId: string
): Promise<boolean> {
   try {
      await call({
         method: 'GET',
         path: itemPath(sellerId, sku),
         query: { marketplaceIds: marketplaceId, includedData: ['summaries'] }
      });
      return true;
   } catch (error) {
      if (error instanceof AmazonError && error.code === 'amazon_not_found') return false;
      throw error;
   }
}

export function deleteListingsItem(
   call: SpapiCall,
   sellerId: string,
   sku: string,
   marketplaceId: string
): Promise<SubmissionResponse> {
   return call<SubmissionResponse>({
      method: 'DELETE',
      path: itemPath(sellerId, sku),
      query: { marketplaceIds: marketplaceId }
   });
}

/** searchCatalogItems by EAN: the first matching ASIN, else null. */
export async function catalogAsin(
   call: SpapiCall,
   gtin: string,
   marketplaceId: string
): Promise<string | null> {
   const result = await call<{ items?: Array<{ asin?: string }> }>({
      method: 'GET',
      path: CATALOG_ITEMS,
      query: {
         identifiers: gtin,
         identifiersType: 'EAN',
         marketplaceIds: marketplaceId,
         includedData: 'summaries'
      }
   });
   return result?.items?.find((item) => typeof item.asin === 'string')?.asin ?? null;
}

/** getListingsRestrictions for a new item: restricted when the marketplace (sandbox: any) has one. */
export async function listingRestrictions(
   call: SpapiCall,
   asin: string,
   sellerId: string,
   marketplaceId: string,
   sandbox: boolean
): Promise<{ restricted: boolean; reasons: string[] }> {
   const result = await call<{
      restrictions?: Array<{ marketplaceId?: string; reasons?: Array<{ message?: string }> }>;
   }>({
      method: 'GET',
      path: LISTINGS_RESTRICTIONS,
      query: { asin, sellerId, marketplaceIds: marketplaceId, conditionType: 'new_new' }
   });
   const restrictions = (result?.restrictions ?? []).filter(
      (entry) => sandbox || entry.marketplaceId === marketplaceId
   );
   return {
      restricted: restrictions.length > 0,
      reasons: restrictions.flatMap((entry) =>
         (entry.reasons ?? []).flatMap((reason) => (reason.message ? [reason.message] : []))
      )
   };
}

// --- Images (R5) ---------------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'kong']);

/**
 * The public URL of an object in listing-images. In production Amazon must be able to fetch it,
 * so the base must be https and not a local host (else 422 listing_image_url_not_public).
 */
export function publicImageUrl(base: string, path: string, env: AmazonEnv['env']): string {
   let url: URL;
   try {
      url = new URL(base);
   } catch {
      throw new HttpError(422, 'listing_image_url_not_public');
   }
   if (env === 'production' && (url.protocol !== 'https:' || LOCAL_HOSTS.has(url.hostname)))
      throw new HttpError(422, 'listing_image_url_not_public');
   const encoded = path.split('/').map(encodeURIComponent).join('/');
   return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${encoded}`;
}

/**
 * Copies the referenced media objects (PNG and JPEG only) from the private `media` bucket into
 * the public listing-images bucket under the same `<tenant>/<media id>/<file>` path, skipping
 * objects already there, and returns their public URLs by media id. A reference without a
 * copyable image refuses the whole set: 422 listing_image_missing, details = attribute names.
 * `db` is the service-role client.
 */
export async function copyListingImages(
   db: SupabaseClient<Database>,
   tenantId: string,
   refs: Map<string, string[]>,
   publicBase: string,
   env: AmazonEnv['env']
): Promise<Record<string, string>> {
   if (refs.size === 0) return {};
   // Checked before any copy: a non-public base fails the same way for every image.
   publicImageUrl(publicBase, 'probe', env);

   const { data: media, error } = await db
      .from('media')
      .select('id, storage_path, file_name, mime_type')
      .eq('tenant_id', tenantId)
      .in('id', [...refs.keys()]);
   if (error) throw error;

   const byId = new Map((media ?? []).map((row) => [row.id, row]));
   const missingIds = [...refs.keys()].filter((id) => {
      const row = byId.get(id);
      return !row || !COPIED_TYPES.has(row.mime_type);
   });
   const refuse = (ids: string[]) => {
      const names = [...new Set(ids.flatMap((id) => refs.get(id) ?? []))];
      return new HttpError(422, 'listing_image_missing', names);
   };
   if (missingIds.length) throw refuse(missingIds);

   const target = db.storage.from(LISTING_IMAGES_BUCKET);
   const urls: Record<string, string> = {};
   const gone: string[] = [];
   for (const id of refs.keys()) {
      const row = byId.get(id)!;
      const path = row.storage_path;
      const slash = path.lastIndexOf('/');
      const { data: existing, error: listError } = await target.list(path.slice(0, slash), {
         search: path.slice(slash + 1)
      });
      if (listError) throw listError;
      if (!existing?.some((object) => object.name === path.slice(slash + 1))) {
         const { data: blob, error: downloadError } = await db.storage
            .from(MEDIA_BUCKET)
            .download(path);
         if (downloadError || !blob) {
            gone.push(id);
            continue;
         }
         const { error: uploadError } = await target.upload(path, blob, {
            contentType: row.mime_type,
            upsert: false
         });
         // A concurrent copy of the same object is as good as ours.
         if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw uploadError;
      }
      urls[id] = publicImageUrl(publicBase, path, env);
   }
   if (gone.length) throw refuse(gone);
   return urls;
}
