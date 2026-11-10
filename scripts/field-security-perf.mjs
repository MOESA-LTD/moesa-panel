// The field-security performance budget in SQL (Task 20, spec R10): pipes
// supabase/perf/field_security_perf.sql (with field_security_perf_load.sql inlined at its \ir
// line) to psql in the local database container, as seed-story.mjs does, and prints the table.
// The script runs inside BEGIN … ROLLBACK and raises 'budget: …' when a ratio is over budget, so
// the exit code is the verdict. Local only: it refuses any container but the local stack's.
//
// Run from app/: pnpm perf:fields
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTAINER = 'supabase_db_moesa-panel';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERF_DIR = path.join(ROOT, 'supabase', 'perf');
const INCLUDE = /^\\ir field_security_perf_load\.sql$/m;

const container = process.env.PERF_CONTAINER ?? CONTAINER;
if (container !== CONTAINER) {
   console.error(`refusing to run against ${container}: the perf load is for the local stack (${CONTAINER}) only`);
   process.exit(2);
}

const perf = readFileSync(path.join(PERF_DIR, 'field_security_perf.sql'), 'utf8');
const load = readFileSync(path.join(PERF_DIR, 'field_security_perf_load.sql'), 'utf8');
if (!INCLUDE.test(perf)) throw new Error('field_security_perf.sql has no \\ir field_security_perf_load.sql line');
const sql = perf.replace(INCLUDE, () => load);

const started = Date.now();
const result = spawnSync(
   'docker',
   ['exec', '-i', '-e', 'PGCLIENTENCODING=UTF8', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
   { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
if (result.error) throw result.error;
process.stdout.write(result.stdout);
if (result.stderr.trim()) process.stderr.write(result.stderr);
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(result.status ?? 1);
