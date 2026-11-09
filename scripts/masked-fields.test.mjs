// The generated masked-field list against public.field_class. The comparison needs the local
// database and is skipped without it; `pnpm test:db` runs it right after the reset.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fetchPairs, OUTPUT, parseGenerated, parseRows, render } from './masked-fields.mjs';

test('renders the pairs by table and reads them back', () => {
   const pairs = parseRows('product|notes\nproduct|purchase_price\nuser|email\n');
   assert.deepEqual(parseGenerated(render(pairs)), pairs);
   assert.match(render(pairs), /product: \['notes', 'purchase_price'\]/);
});

let database = null;
try {
   database = fetchPairs();
} catch {
   // No local database: nothing to compare against.
}

test('the committed list matches public.field_class', { skip: !database && 'no local database' }, () => {
   assert.ok(database.length > 0, 'field_class lists sensitive fields');
   assert.deepEqual(parseGenerated(readFileSync(OUTPUT, 'utf8')), database);
});
