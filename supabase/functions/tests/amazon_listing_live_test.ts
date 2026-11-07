// amazon-listing against the SP-API static sandbox (supabase/functions/.env). Run with
// `deno task test:live`; without the credentials or --allow-net every test is ignored.
// The canned answers match on these parameters: keep them verbatim.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { amazonEnv, type Region, type SpapiCall, spapiClient } from '../_shared/amazon.ts';
import {
   deleteListingsItem,
   deriveListingState,
   getListingsItem,
   type ListingBody,
   listingPatch,
   listingRestrictions,
   parseSubmission,
   patchListingsItem,
   putListingsItem
} from '../amazon-listing/listing.ts';

const live =
   !!Deno.env.get('AMAZON_SPAPI_LWA_CLIENT_ID') &&
   Deno.permissions.querySync({ name: 'net' }).state === 'granted';

if (!live)
   console.log(
      'amazon_listing_live_test: skipped (no supabase/functions/.env credentials or no --allow-net)'
   );

const DE = 'A1PA6795UKMFR9';

const sandbox = (sandboxRegionOverride?: Region): { spapi: SpapiCall; sellerId: string } => {
   const env = amazonEnv();
   assertEquals(env.env, 'sandbox', 'the live tests run only against the sandbox');
   assert(env.selfRefreshToken, 'AMAZON_SPAPI_REFRESH_TOKEN is required');
   return {
      spapi: spapiClient(env.selfRefreshToken, env, {}, { sandboxRegionOverride }),
      sellerId: env.sellerId ?? 'SANDBOX_SELLER'
   };
};

const body: ListingBody = {
   productType: 'LUGGAGE',
   requirements: 'LISTING',
   attributes: { condition_type: [{ value: 'new_new', marketplace_id: DE }] }
};

Deno.test({
   name: 'sandbox: amazon-listing publish body is ACCEPTED',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const parsed = parseSubmission(
         await putListingsItem(spapi, sellerId, 'THO-MOP40-2P', DE, body)
      );
      assertEquals(parsed.status, 'accepted');
      assertEquals(parsed.submissionId, 'f1dc2914-75dd-11ea-bc55-0242ac130003');
   }
});

Deno.test({
   name: 'sandbox: amazon-listing update (PATCH of the panel attributes) is ACCEPTED',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const parsed = parseSubmission(
         await patchListingsItem(spapi, sellerId, 'THO-MOP40-2P', DE, listingPatch(body))
      );
      assertEquals(parsed.status, 'accepted');
   }
});

Deno.test({
   name: 'sandbox: amazon-listing validate of VALIDATION_INVALID (NA host) is INVALID on condition_type',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox('na');
      const parsed = parseSubmission(
         await putListingsItem(
            spapi,
            sellerId,
            'VALIDATION_INVALID',
            'ATVPDKIKX0DER',
            body,
            'VALIDATION_PREVIEW'
         )
      );
      assertEquals(parsed.status, 'invalid');
      assertEquals(parsed.issues[0].attributeNames, ['condition_type']);
   }
});

Deno.test({
   name: 'sandbox: amazon-listing status derives issues and keeps 18027 without attributeNames',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const derived = deriveListingState(
         await getListingsItem(spapi, sellerId, 'THO-MOP40-2P', DE),
         DE,
         true
      );
      assertEquals(derived.state, 'issues');
      assertEquals(derived.asin, 'B071VG5N9D');
      assertEquals(derived.issues.find((issue) => issue.code === '18027')?.attributeNames, []);
   }
});

Deno.test({
   name: 'sandbox: amazon-listing delete is ACCEPTED',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const parsed = parseSubmission(await deleteListingsItem(spapi, sellerId, 'THO-MOP40-2P', DE));
      assertEquals(parsed.status, 'accepted');
   }
});

Deno.test({
   name: 'sandbox: amazon-listing restrictions of B0000ASIN1 are restricted',
   ignore: !live,
   fn: async () => {
      const { spapi, sellerId } = sandbox();
      const result = await listingRestrictions(spapi, 'B0000ASIN1', sellerId, DE, true);
      assertEquals(result.restricted, true);
      assertEquals(result.reasons, ['You cannot list the product in this condition.']);
   }
});
