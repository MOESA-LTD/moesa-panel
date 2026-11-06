// The development story seed: fills MOESA LTD with a coherent story on top of the small seed.
// Development only; run it after `supabase db reset` (pnpm dev:seed-story from app/).
//
// In order: reads the local keys (supabase status), refuses to run when customer KRN exists
// (before any upload), checks the sample files and the media ids, uploads the media files to the
// local Storage bucket at <tenant id>/<media id>/…, runs supabase/seed_story.sql in one
// transaction, then runs supabase/seed_story.check.sql (with story.today set to the date the story
// began, so a run across midnight UTC stays consistent) and fails on any row it returns.
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

// Defence in depth: the service role key never goes anywhere but the local stack.
export function assertLocalApiUrl(apiUrl) {
   let host;
   try {
      host = new URL(apiUrl).hostname;
   } catch {
      throw new Error(`API URL is not a URL: ${apiUrl}`);
   }
   if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`refusing to run against ${apiUrl}: the story seed is for the local stack only`);
   }
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

// Where a request made from the database container reaches the Edge Functions (Kong on the
// Docker network; verified with a pg_net probe in M22 task 2).
export const EDGE_FUNCTION_URL = 'http://supabase_kong_moesa-panel:8000/functions/v1';

// The two Vault secrets the pg_cron jobs of migration 047 read (edge_function_url, edge_service_key):
// any old secret is deleted, then created. The key is dollar-quoted and never printed.
export function edgeSecretsSql(serviceRoleKey) {
   if (!serviceRoleKey || serviceRoleKey.includes('$k$')) throw new Error('unusable service role key');
   return `DELETE FROM vault.secrets WHERE name IN ('edge_function_url', 'edge_service_key');
SELECT vault.create_secret('${EDGE_FUNCTION_URL}', 'edge_function_url', 'Edge Functions base URL for pg_cron');
SELECT vault.create_secret($k$${serviceRoleKey}$k$, 'edge_service_key', 'Service key for pg_cron calls');
`;
}

// The values of a KEY=VALUE env file (comments and blank lines skipped, optional quotes removed);
// {} when the file does not exist.
export function readEnvFile(file) {
   let text;
   try {
      text = readFileSync(file, 'utf8');
   } catch {
      return {};
   }
   const values = {};
   for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
   }
   return values;
}

// The statements step 11 reads its Amazon data from: the R3 fixture (definition and the mop's
// attributes) and the seller id, as session settings the story SQL picks up with current_setting.
// The seller id is the Edge Functions' AMAZON_SPAPI_SELLER_ID, else a sandbox placeholder; no
// token is stored, because the sandbox uses the self-authorized one.
export function amazonStoryPrelude(root, env) {
   const dir = path.join(root, 'supabase', 'seed_files', 'amazon');
   const read = (name) => {
      const text = readFileSync(path.join(dir, name), 'utf8');
      JSON.parse(text);
      if (text.includes('$fx$')) throw new Error(`${name} contains the quote tag $fx$`);
      return text;
   };
   const sellerId = env.AMAZON_SPAPI_SELLER_ID?.trim() || 'SANDBOX-SELLER';
   if (!/^[A-Za-z0-9_-]+$/.test(sellerId)) throw new Error('AMAZON_SPAPI_SELLER_ID is not a usable seller id');
   return `SELECT set_config('story.amazon_definition', $fx$${read('LUGGAGE.A1PA6795UKMFR9.en_GB.json')}$fx$, FALSE);
SELECT set_config('story.amazon_attributes', $fx$${read('LUGGAGE.attributes.json')}$fx$, FALSE);
SELECT set_config('story.amazon_seller_id', '${sellerId}', FALSE);
`;
}

// The steps are injectable so the test can prove the KRN guard stops the run before any upload.
export async function main({ keys = localKeys, sql = psql, upload = uploadMedia, exit = process.exit } = {}) {
   const { apiUrl, serviceRoleKey } = keys();
   assertLocalApiUrl(apiUrl);

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
   // The story's "today" is the database date before its transaction begins; the check reads it
   // (story.today), so a run that crosses 00:00 UTC does not fail the date checks.
   const storyDate = sql('SELECT current_date').trim();
   if (!/^\d{4}-\d{2}-\d{2}$/.test(storyDate)) throw new Error(`unexpected database date: ${storyDate}`);
   const env = readEnvFile(path.join(ROOT, 'supabase', 'functions', '.env'));
   sql(amazonStoryPrelude(ROOT, env) + storySql, { singleTransaction: true });
   // After the story and before its check, which asserts both secrets exist.
   sql(edgeSecretsSql(serviceRoleKey), { singleTransaction: true });

   const checkSql = readFileSync(CHECK_SQL, 'utf8');
   const failures = parseCheckRows(sql(`SET story.today = '${storyDate}';\n${checkSql}`));
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
