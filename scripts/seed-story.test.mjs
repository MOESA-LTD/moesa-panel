// Unit tests of the pure parts of seed-story.mjs: node --test scripts/seed-story.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { assertLocalApiUrl, bigPdf, countChecks, GENERATED_BIG_PDF, main, MEDIA, parseCheckRows, parseStatus, ROOT, run } from './seed-story.mjs';

test('bigPdf is sample.pdf padded with comment lines to exactly 12 MiB', () => {
   const sample = readFileSync(path.join(ROOT, 'supabase', 'seed_files', 'sample.pdf'));
   const pdf = bigPdf();
   assert.equal(pdf.length, 12 * 1024 * 1024);
   assert.ok(pdf.subarray(0, sample.length).equals(sample));
   assert.ok(sample.toString('latin1').trimEnd().endsWith('%%EOF'));
   const padding = pdf.subarray(sample.length).toString('latin1');
   assert.ok(padding.endsWith('\n'));
   for (const line of padding.slice(0, -1).split('\n')) assert.match(line, /^%+$/);
});

test('parseStatus reads the keys after a line the CLI prints before the JSON', () => {
   const text = 'Stopped services: [x]\n{"API_URL": "http://127.0.0.1:54321", "SERVICE_ROLE_KEY": "srk"}\n';
   assert.deepEqual(parseStatus(text), { apiUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'srk' });
   assert.throws(() => parseStatus('{"API_URL": "x"}'), /SERVICE_ROLE_KEY/);
});

test('run returns stdout and throws with stderr on a non-zero exit', () => {
   assert.equal(run('node', ['-e', 'process.stdout.write("hi")']), 'hi');
   assert.throws(() => run('node', ['-e', 'console.error("boom"); process.exit(3)']), /exit 3[\s\S]*boom/);
   assert.equal(run('node', ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'piped' }), 'piped');
});

test('check rows become FAIL lines; checks are counted by their leading SELECT', () => {
   assert.deepEqual(parseCheckRows('a.b|x|y\r\nm19.unlinked\n\n'), ['FAIL a.b x|y', 'FAIL m19.unlinked']);
   assert.equal(countChecks('BEGIN;\n  SELECT 1;\nSELECT 1;\nSELECT 2 FROM t\n  WHERE x;\n'), 2);
});

test('MEDIA lists the step 09 files: unique ids, existing sources, one generated 12 MB PDF', () => {
   assert.equal(MEDIA.length, 12);
   for (const m of MEDIA) {
      assert.match(m.id, /^5eed0009-0000-4000-8000-0000000000\d\d$/);
      assert.ok(m.file && m.upload && m.mime);
      assert.doesNotMatch(m.upload, /\//);
      if (m.file !== GENERATED_BIG_PDF) assert.ok(existsSync(path.join(ROOT, 'supabase', 'seed_files', m.file)), m.file);
      if (m.thumb) assert.ok(existsSync(path.join(ROOT, 'supabase', 'seed_files', m.thumb)), m.thumb);
   }
   assert.equal(new Set(MEDIA.map((m) => m.id)).size, MEDIA.length);
   assert.deepEqual(MEDIA.filter((m) => m.file === GENERATED_BIG_PDF).map((m) => m.id), ['5eed0009-0000-4000-8000-000000000011']);
   const storySql = readFileSync(path.join(ROOT, 'supabase', 'seed_story.sql'), 'utf8');
   for (const m of MEDIA) assert.ok(storySql.includes(m.id), `${m.id} missing from seed_story.sql`);
});

test('the KRN guard stops the run before any upload or story SQL', async () => {
   assert.ok(MEDIA.length > 0, 'the guard is only meaningful with files to upload');
   const queries = [];
   let uploads = 0;
   const exited = [];
   const original = console.error;
   console.error = () => {};
   try {
      await main({
         keys: () => ({ apiUrl: 'http://127.0.0.1:1', serviceRoleKey: 'unused' }),
         sql: (text) => {
            queries.push(text);
            return '1\n';
         },
         upload: async () => {
            uploads += 1;
         },
         exit: (code) => {
            exited.push(code);
         },
      });
   } finally {
      console.error = original;
   }
   assert.deepEqual(exited, [1]);
   assert.equal(uploads, 0);
   assert.equal(queries.length, 1);
   assert.match(queries[0], /code = 'KRN'/);
});

test('the check runs with the story date the database had before the story began', async () => {
   const calls = [];
   const logs = [];
   const original = console.log;
   console.log = (line) => logs.push(line);
   try {
      await main({
         keys: () => ({ apiUrl: 'http://127.0.0.1:1', serviceRoleKey: 'unused' }),
         sql: (text, opts) => {
            calls.push({ text, opts });
            if (text.startsWith('SELECT count(*) FROM public.customer')) return '0\n';
            if (text.startsWith('SELECT id FROM public.tenant')) return 'tenant-id\n';
            if (text === 'SELECT current_date') return '2026-11-06\n';
            return '';
         },
         upload: async () => {},
         exit: (code) => {
            throw new Error(`exit ${code}`);
         },
      });
   } finally {
      console.log = original;
   }
   const story = calls.findIndex((c) => c.opts?.singleTransaction);
   assert.ok(calls.findIndex((c) => c.text === 'SELECT current_date') < story, 'date read before the story');
   assert.match(calls.at(-1).text, /^SET story\.today = '2026-11-06';\n/);
   assert.ok(calls.indexOf(calls.at(-1)) > story);
   assert.match(logs.join('\n'), /ok \(\d+ checks\)/);
});

test('the check SQL derives every date from pg_temp.today(), never current_date directly', () => {
   const sql = readFileSync(path.join(ROOT, 'supabase', 'seed_story.check.sql'), 'utf8');
   const uses = sql.split(/\r?\n/).filter((l) => /current_date/.test(l) && !l.trimStart().startsWith('--'));
   assert.equal(uses.length, 1, uses.join('\n'));
   assert.match(uses[0], /coalesce\(nullif\(current_setting\('story\.today'/);
});

test('the guide.page check lists every business page of GUIDE_PAGES (app/src/constants/guide.ts)', () => {
   const guide = readFileSync(path.join(ROOT, 'app', 'src', 'constants', 'guide.ts'), 'utf8');
   const list = guide.match(/export const GUIDE_PAGES = \[([\s\S]*?)\] as const/)?.[1];
   assert.ok(list, 'GUIDE_PAGES not found in guide.ts');
   const pages = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((page) => page !== 'dashboard');
   assert.ok(pages.length > 0);

   const sql = readFileSync(path.join(ROOT, 'supabase', 'seed_story.check.sql'), 'utf8');
   const check = sql.match(/^SELECT 'guide\.page'[\s\S]*?\) v \(p, tbl\)/m)?.[0];
   assert.ok(check, "the 'guide.page' check not found in seed_story.check.sql");
   const checked = [...check.matchAll(/\('([a-z_]+)', '[a-z_]+'\)/g)].map((m) => m[1]);

   // A new guide page fails here until the check lists it (and the story gives it rows).
   assert.deepEqual([...checked].sort(), [...pages].sort());
});

test('a non-local API URL is refused before any query or upload', async () => {
   let touched = 0;
   const touch = () => {
      touched += 1;
      return '0';
   };
   for (const apiUrl of ['https://abc.supabase.co', 'http://127.0.0.1.evil.com:54321', 'nonsense']) {
      await assert.rejects(
         main({ keys: () => ({ apiUrl, serviceRoleKey: 'k' }), sql: touch, upload: touch, exit: touch }),
         /refusing|not a URL/,
      );
   }
   assert.equal(touched, 0);
   assert.doesNotThrow(() => assertLocalApiUrl('http://127.0.0.1:54321'));
   assert.doesNotThrow(() => assertLocalApiUrl('http://localhost:54321'));
});
