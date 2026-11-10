// The generated masked-field list against public.field_class. The comparison needs the local
// database and is skipped without it, unless MASKED_FIELDS_REQUIRE_DB is set (CI's database job,
// `pnpm test:db`), where a missing database fails it. Dependency-free: node builtins only.
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
let unreachable = null;
try {
   database = fetchPairs();
} catch (error) {
   unreachable = error;
}
const required = !!process.env.MASKED_FIELDS_REQUIRE_DB;

test('the committed list matches public.field_class', { skip: !database && !required && 'no local database' }, () => {
   if (!database) throw new Error(`the local database is required: ${unreachable?.message}`);
   assert.ok(database.length > 0, 'field_class lists sensitive fields');
   assert.deepEqual(parseGenerated(readFileSync(OUTPUT, 'utf8')), database);
});
