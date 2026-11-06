// Unit tests of the pure parts of seed-story.mjs: node --test scripts/seed-story.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bigPdf, countChecks, MEDIA, parseCheckRows, parseStatus, ROOT, run } from './seed-story.mjs';

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

test('MEDIA ids are story-step UUIDs and upload names are unique per id', () => {
   for (const m of MEDIA) {
      assert.match(m.id, /^5eed00\d\d-0000-4000-8000-0000000000\d\d$/);
      assert.ok(m.file && m.upload && m.mime);
   }
   assert.equal(new Set(MEDIA.map((m) => m.id)).size, MEDIA.length);
});
