// The development story seed: fills MOESA LTD with a coherent story on top of the small seed.
// Development only; run it after `supabase db reset` (pnpm dev:seed-story from app/).
//
// In order: reads the local keys (supabase status), refuses to run when customer KRN exists
// (before any upload), checks the sample files and the media ids, uploads the media files to the
// local Storage bucket at <tenant id>/<media id>/…, runs supabase/seed_story.sql in one
// transaction, then runs supabase/seed_story.check.sql and fails on any row it returns.
//
// SQL always goes to psql in the database container on stdin, so no host path is mounted and
// the script behaves the same in Git Bash, PowerShell and Linux.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTAINER = 'supabase_db_moesa-panel';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEED_FILES = path.join(ROOT, 'supabase', 'seed_files');
const STORY_SQL = path.join(ROOT, 'supabase', 'seed_story.sql');
const CHECK_SQL = path.join(ROOT, 'supabase', 'seed_story.check.sql');
const MAX_SEED_FILE_BYTES = 500 * 1024;
const BIG_PDF_BYTES = 12 * 1024 * 1024;
export const GENERATED_BIG_PDF = '<generated:12MB>';
const BUCKET = 'media';

// The media files the story's media rows point at. `id` is the media row's fixed UUID (it also
// occurs in seed_story.sql), `file` the source under supabase/seed_files/ (or the generated
// 12 MB PDF), `upload` the published file name, `thumb` an optional thumbnail source. Every file
// goes under MOESA LTD's folder: KRN is a customer of MOESA LTD, not a tenant.
const media = (nn, file, upload, mime, thumb) =>
   Object.freeze({ id: `5eed0009-0000-4000-8000-0000000000${nn}`, file, upload, mime, thumb });
export const MEDIA = Object.freeze([
   media('01', 'photo-1.png', 'mop-primary.png', 'image/png', 'thumb-1.webp'), // THO-MOP40-2P primary image
   media('02', 'photo-2.png', 'mop-gallery.png', 'image/png'), // THO-MOP40-2P gallery, no thumbnail
   media('03', 'photo-3.png', 'production.png', 'image/png', 'thumb-3.webp'), // PO-006 production photo
   media('04', 'photo-2.png', 'damage.png', 'image/png', 'thumb-2.webp'), // SHP-009 damage photo
   media('05', 'sample.pdf', 'pi.pdf', 'application/pdf'), // the file of PO-011's PI
   media('06', 'sample.pdf', 'artwork.pdf', 'application/pdf'), // CR-005 attachment, tech pack, packing list
   media('07', 'sample.mp4', 'demo.mp4', 'video/mp4'), // THO-TIPS-6-50 gallery video
   media('08', 'photo-3.png', 'orphan.png', 'image/png'), // linked nowhere
   media('09', 'photo-1.png', 'catalogue.png', 'image/png', 'thumb-1.webp'), // shared: THO and KRN products
   media('10', 'photo-2.png', 'vase.png', 'image/png', 'thumb-2.webp'), // KRN-VASE-01 primary image
   media('11', GENERATED_BIG_PDF, 'big-catalogue.pdf', 'application/pdf'), // 12 MB: over Trading's 5 MB cap
   media('12', 'sample.pdf', 'certificate.pdf', 'application/pdf'), // shared: CN1's certificate (a supplier's)
]);

// Runs a command in the repo root and returns its stdout; throws with its stderr on failure.
// The supabase CLI may be a .cmd shim on Windows, which Node only starts through a shell.
export function run(cmd, args, opts = {}) {
   const result = spawnSync(cmd, args, {
      cwd: ROOT,
      input: opts.input,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32' && cmd === 'supabase',
   });
   if (result.error) throw new Error(`${cmd} ${args.join(' ')}: ${result.error.message}`);
   if (result.status !== 0) {
      throw new Error(`${cmd} ${args[0] ?? ''} failed (exit ${result.status}):\n${result.stderr.trim()}`);
   }
   return result.stdout;
}

// Runs SQL as postgres in the database container (stdin, unaligned tuples only) and returns
// the output.
export function psql(sql, { singleTransaction = false } = {}) {
   const args = ['exec', '-i', '-e', 'PGCLIENTENCODING=UTF8', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'];
   args.push('-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1');
   // psql applies --single-transaction to -f/-c only, hence "-f -" for stdin.
   if (singleTransaction) args.push('--single-transaction');
   args.push('-f', '-');
   return run('docker', args, { input: sql });
}

// The API URL and service role key from `supabase status -o json` output; CLI 2.x may print a
// line before the JSON.
export function parseStatus(text) {
   const start = text.indexOf('{');
   const end = text.lastIndexOf('}');
   if (start < 0 || end < start) throw new Error(`no JSON in supabase status output:\n${text}`);
   const status = JSON.parse(text.slice(start, end + 1));
   for (const key of ['API_URL', 'SERVICE_ROLE_KEY']) {
      if (!status[key]) throw new Error(`supabase status has no ${key}; is the local stack running?`);
   }
   return { apiUrl: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

export function localKeys() {
   return parseStatus(run('supabase', ['status', '-o', 'json']));
}

// sample.pdf followed by "%" comment lines (after %%EOF) up to exactly 12 MiB: the oversized
// file for the media size cap edge. Generated, never committed.
export function bigPdf() {
   const sample = readFileSync(path.join(SEED_FILES, 'sample.pdf'));
   const padding = Buffer.alloc(BIG_PDF_BYTES - sample.length, '%');
   for (let i = 1023; i < padding.length; i += 1024) padding[i] = 0x0a;
   padding[padding.length - 1] = 0x0a;
   return Buffer.concat([sample, padding]);
}

// psql -At rows ("id|detail…") as "FAIL <id> <detail>" lines.
export function parseCheckRows(output) {
   return output
      .split(/\r?\n/)
      .filter((row) => row.trim() !== '')
      .map((row) => {
         const [id, ...detail] = row.split('|');
         return `FAIL ${id} ${detail.join('|')}`.trimEnd();
      });
}

// The number of checks: the top-level queries, the only lines that start with "SELECT".
export function countChecks(checkSql) {
   return checkSql.match(/^SELECT\b/gm)?.length ?? 0;
}

function assertSeedFiles() {
   for (const name of readdirSync(SEED_FILES)) {
      const { size } = statSync(path.join(SEED_FILES, name));
      if (size >= MAX_SEED_FILE_BYTES) {
         throw new Error(`supabase/seed_files/${name} is ${size} bytes; seed files stay under 500 KB`);
      }
   }
}

function assertMediaIdsIn(storySql) {
   const missing = MEDIA.filter((m) => !storySql.includes(m.id)).map((m) => m.id);
   if (missing.length) throw new Error(`MEDIA ids missing from seed_story.sql: ${missing.join(', ')}`);
}

async function uploadMedia(apiUrl, serviceRoleKey, tenantId) {
   const appRequire = createRequire(path.join(ROOT, 'app', 'package.json'));
   const { createClient } = appRequire('@supabase/supabase-js');
   const storage = createClient(apiUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
   }).storage.from(BUCKET);

   const put = async (objectPath, body, contentType) => {
      const { error } = await storage.upload(objectPath, body, { contentType, upsert: true });
      if (error) throw new Error(`upload ${objectPath}: ${error.message}`);
   };

   for (const m of MEDIA) {
      const body = m.file === GENERATED_BIG_PDF ? bigPdf() : readFileSync(path.join(SEED_FILES, m.file));
      await put(`${tenantId}/${m.id}/${m.upload}`, body, m.mime);
      if (m.thumb) {
         await put(`${tenantId}/${m.id}/thumb/thumb.webp`, readFileSync(path.join(SEED_FILES, m.thumb)), 'image/webp');
      }
   }
}

// The steps are injectable so the test can prove the KRN guard stops the run before any upload.
export async function main({ keys = localKeys, sql = psql, upload = uploadMedia, exit = process.exit } = {}) {
   const { apiUrl, serviceRoleKey } = keys();

   if (Number(sql(`SELECT count(*) FROM public.customer WHERE code = 'KRN'`).trim()) > 0) {
      console.error('seed-story: already loaded (customer KRN exists). Run "supabase db reset" first.');
      return exit(1);
   }

   assertSeedFiles();
   const storySql = readFileSync(STORY_SQL, 'utf8');
   assertMediaIdsIn(storySql);

   const tenantId = sql(`SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD'`).trim();
   if (!tenantId) throw new Error('tenant MOESA LTD not found; is the small seed loaded?');

   await upload(apiUrl, serviceRoleKey, tenantId);
   sql(storySql, { singleTransaction: true });

   const checkSql = readFileSync(CHECK_SQL, 'utf8');
   const failures = parseCheckRows(sql(checkSql));
   if (failures.length) {
      for (const line of failures) console.log(line);
      return exit(1);
   }
   console.log(`seed-story: ok (${countChecks(checkSql)} checks)`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]);
const self = fileURLToPath(import.meta.url);
if (invoked && (process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self)) {
   main().catch((error) => {
      console.error(`seed-story: ${error.message}`);
      process.exit(1);
   });
}
