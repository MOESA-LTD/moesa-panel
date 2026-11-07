// Product Type Definitions API (2020-09-01): search, definition and the schema download behind its
// pre-signed link. Rows follow `listingCompleteness.toDefinitionRow`, the cache table's shape.
import { AmazonError, type Deps, type SpapiCall } from '../_shared/amazon.ts';
import { crypto, encodeBase64 } from '../_shared/deps.ts';
import {
   type DefinitionRow,
   type GetDefinitionResponse,
   toDefinitionRow
} from '../_shared/listingCompleteness.ts';

export { type DefinitionRow, toDefinitionRow };

const DEFINITIONS = '/definitions/2020-09-01/productTypes';

export type DefinitionKey = { marketplaceId: string; productType: string; locale: string };

const hex = (bytes: Uint8Array) =>
   Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Downloads a schema document from its pre-signed link (no Amazon token goes with it) and checks
 * its MD5 against `checksum`, as hex or as Base64 (the form Amazon documents). A mismatch is
 * AmazonError('amazon_schema_checksum', 502); an unreachable link 'amazon_unavailable'.
 */
export async function downloadSchema(
   link: { resource: string },
   checksum: string,
   deps?: Partial<Deps>
): Promise<unknown> {
   const fetcher = deps?.fetch ?? fetch;
   // Built from response.arrayBuffer(), so the backing buffer is a plain ArrayBuffer; newer Deno
   // type libraries require that for crypto.subtle.digest.
   let bytes: Uint8Array<ArrayBuffer>;
   try {
      const response = await fetcher(link.resource, { method: 'GET' });
      if (!response.ok) {
         await response.body?.cancel();
         throw new AmazonError('amazon_unavailable', 502);
      }
      bytes = new Uint8Array(await response.arrayBuffer());
   } catch (error) {
      if (error instanceof AmazonError) throw error;
      throw new AmazonError('amazon_unavailable', 502);
   }

   const digest = new Uint8Array(await crypto.subtle.digest('MD5', bytes));
   const expected = checksum.trim();
   if (expected.toLowerCase() !== hex(digest) && expected !== encodeBase64(digest))
      throw new AmazonError('amazon_schema_checksum', 502);

   try {
      return JSON.parse(new TextDecoder().decode(bytes));
   } catch {
      throw new AmazonError('amazon_schema_invalid', 502);
   }
}

/**
 * The cached row for `key`. In sandbox any row of the product type serves (R3: the fixture is the
 * only schema there and stands in for every marketplace and locale); in production only the exact key.
 */
export function pickDefinition(
   rows: DefinitionRow[],
   key: DefinitionKey,
   sandbox: boolean
): DefinitionRow | null {
   const exact = rows.find(
      (row) =>
         row.marketplace_id === key.marketplaceId &&
         row.product_type === key.productType &&
         row.locale === key.locale
   );
   if (exact) return exact;
   if (!sandbox) return null;
   return rows.find((row) => row.product_type === key.productType) ?? null;
}

/** searchDefinitionsProductTypes: the product types matching `keywords` in one marketplace. */
export async function searchProductTypes(
   call: SpapiCall,
   keywords: string,
   marketplaceId: string
): Promise<{ name: string; displayName: string }[]> {
   const result = await call<{ productTypes?: Array<{ name: string; displayName?: string }> }>({
      method: 'GET',
      path: DEFINITIONS,
      query: { keywords, marketplaceIds: marketplaceId }
   });
   return (result?.productTypes ?? []).map(({ name, displayName }) => ({
      name,
      displayName: displayName ?? name
   }));
}

/** The row is stored under the key it was asked for, whatever marketplace the answer names first. */
const withKey = (row: DefinitionRow, key: DefinitionKey): DefinitionRow => ({
   ...row,
   marketplace_id: key.marketplaceId,
   product_type: key.productType,
   locale: key.locale
});

/** getDefinitionsProductType (LISTING requirements) and its downloaded, checked schema, as a row. */
export async function fetchDefinition(
   call: SpapiCall,
   key: DefinitionKey & { sellerId: string },
   deps?: Partial<Deps>
): Promise<DefinitionRow> {
   const meta = await call<GetDefinitionResponse>({
      method: 'GET',
      path: `${DEFINITIONS}/${encodeURIComponent(key.productType)}`,
      query: {
         marketplaceIds: key.marketplaceId,
         sellerId: key.sellerId,
         requirements: 'LISTING',
         locale: key.locale
      }
   });
   const link = 'link' in meta.schema ? meta.schema : undefined;
   if (!link) return withKey(toDefinitionRow(meta, undefined, key.locale), key);
   const schema = await downloadSchema(link.link, link.checksum, deps);
   return withKey(toDefinitionRow(meta, schema, key.locale), key);
}
