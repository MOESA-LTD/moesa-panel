// 046's private.amazon_marketplace_id derives a submission's marketplace inside the database
// (listing_begin_submission); it must name the same EU marketplaces as the functions.
import { assertEquals } from 'jsr:@std/assert@1';
import { MARKETPLACE_IDS } from '../_shared/listingCompleteness.ts';

const migration = await Deno.readTextFile(
   new URL('../../migrations/046_amazon_listing_core.sql', import.meta.url)
);

Deno.test('private.amazon_marketplace_id names the marketplaces of MARKETPLACE_IDS', () => {
   const start = migration.indexOf('FUNCTION private.amazon_marketplace_id');
   const end = migration.indexOf('$$;', start);
   const body = migration.slice(start, end);
   const sql = Object.fromEntries(
      [...body.matchAll(/WHEN '([A-Z]{2})' THEN '([A-Z0-9]+)'/g)].map(([, country, id]) => [
         country,
         id
      ])
   );
   assertEquals(start > 0, true);
   assertEquals(sql, { ...MARKETPLACE_IDS });
});
