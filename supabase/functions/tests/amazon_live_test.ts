// Calls the SP-API static sandbox with the self-authorized credentials in supabase/functions/.env.
// Run with `deno task test:live`; without the credentials or --allow-net every test is ignored.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { amazonEnv, type Region, type SpapiCall, spapiClient } from '../_shared/amazon.ts';

const live =
   !!Deno.env.get('AMAZON_SPAPI_LWA_CLIENT_ID') &&
   Deno.permissions.querySync({ name: 'net' }).state === 'granted';

if (!live)
   console.log(
      'amazon_live_test: skipped (no supabase/functions/.env credentials or no --allow-net)'
   );

/**
 * `sandboxRegionOverride` is used for one case only: Amazon serves the VALIDATION_PREVIEW mock
 * (marketplace ATVPDKIKX0DER) from the NA sandbox; the EU sandbox answers it with 403
 * Unauthorized "The marketplaces you provided are not valid for region."
 */
const sandbox = (sandboxRegionOverride?: Region): { spapi: SpapiCall; sellerId: string } => {
   const env = amazonEnv();
   assertEquals(env.env, 'sandbox', 'the live tests run only against the sandbox');
   assert(env.selfRefreshToken, 'AMAZON_SPAPI_REFRESH_TOKEN is required');
   // The static sandbox matches on sku, marketplaceIds, includedData and mode; any seller id passes.
   return {
      spapi: spapiClient(env.selfRefreshToken, env, {}, { sandboxRegionOverride }),
      sellerId: env.sellerId ?? 'SANDBOX_SELLER'
   };
};

type ListingsResponse = {
   sku?: string;
   status?: string;
   submissionId?: string;
   issues?: Array<{ code: string; attributeNames?: string[] }>;
   summaries?: Array<{ status: string[] }>;
};

Deno.test({
   name: 'sandbox: putListingsItem answers the canned ACCEPTED',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const result = await spapi<ListingsResponse>({
         method: 'PUT',
         path: `/listings/2021-08-01/items/${sellerId}/THO-MOP40-2P`,
         query: { marketplaceIds: ['A1PA6795UKMFR9'] },
         body: { productType: 'LUGGAGE', requirements: 'LISTING', attributes: {} }
      });
      assertEquals(result.status, 'ACCEPTED');
      assertEquals(result.submissionId, 'f1dc2914-75dd-11ea-bc55-0242ac130003');
   }
});

Deno.test({
   name: 'sandbox: VALIDATION_PREVIEW of VALIDATION_INVALID returns the condition_type issue',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox('na');
      const result = await spapi<ListingsResponse>({
         method: 'PUT',
         path: `/listings/2021-08-01/items/${sellerId}/VALIDATION_INVALID`,
         query: {
            marketplaceIds: ['ATVPDKIKX0DER'],
            includedData: ['identifiers', 'issues'],
            mode: 'VALIDATION_PREVIEW'
         },
         body: { productType: 'LUGGAGE', requirements: 'LISTING', attributes: {} }
      });
      assertEquals(result.status, 'INVALID');
      assertEquals(result.issues?.[0].attributeNames, ['condition_type']);
   }
});

Deno.test({
   name: 'sandbox: getListingsItem returns GM-ZDPI-9B4E with BUYABLE and issues',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const result = await spapi<ListingsResponse>({
         method: 'GET',
         path: `/listings/2021-08-01/items/${sellerId}/GM-ZDPI-9B4E`,
         query: { marketplaceIds: ['A1PA6795UKMFR9'], includedData: ['summaries', 'issues'] }
      });
      assertEquals(result.sku, 'GM-ZDPI-9B4E');
      assertEquals(result.summaries?.[0].status, ['BUYABLE']);
      const image = result.issues?.find((issue) => issue.code === '18027');
      assert(image, 'the 18027 issue is present');
      assert(!image.attributeNames?.length, 'the 18027 issue has no attributeNames');
   }
});

Deno.test({
   name: 'sandbox: getDefinitionsProductType returns LUGGAGE UHqSqmb4FNUk=',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const result = await spapi<{
         productTypeVersion: { version: string };
         schema: { link: { resource: string } };
      }>({
         method: 'GET',
         path: '/definitions/2020-09-01/productTypes/LUGGAGE',
         query: { marketplaceIds: ['A1PA6795UKMFR9'], sellerId }
      });
      assertEquals(result.productTypeVersion.version, 'UHqSqmb4FNUk=');
      assertEquals(result.schema.link.resource, 'https://schema-url');
   }
});

Deno.test({
   name: 'sandbox: searchDefinitionsProductTypes answers LUGGAGE through amazon-schema',
   ignore: !live,
   fn: async () => {
      const { searchProductTypes } = await import('../amazon-schema/schema.ts');
      const { spapi } = sandbox();
      const productTypes = await searchProductTypes(spapi, 'luggage', 'A1PA6795UKMFR9');
      assert(
         productTypes.some((type) => type.name === 'LUGGAGE' && type.displayName === 'Luggage'),
         `LUGGAGE is listed: ${JSON.stringify(productTypes)}`
      );
   }
});
