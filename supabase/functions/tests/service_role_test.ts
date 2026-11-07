// A lint-style guard: the Amazon functions act with the user's JWT, and the service role stays
// where it is unavoidable (_shared/serviceRole.ts). These checks fail when a handler reaches for a
// full service-role client on a user path, so tenant data cannot silently bypass RLS again.
import { assertEquals } from 'jsr:@std/assert@1';

const ROOT = new URL('../', import.meta.url);

const sources = async (dir = ROOT, prefix = ''): Promise<Map<string, string>> => {
   const files = new Map<string, string>();
   for await (const entry of Deno.readDir(dir)) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory) {
         if (['tests', 'scripts', 'node_modules'].includes(entry.name)) continue;
         for (const [p, text] of await sources(new URL(`${entry.name}/`, dir), `${path}/`))
            files.set(p, text);
      } else if (entry.name.endsWith('.ts') && entry.name !== 'database.types.ts') {
         files.set(path, await Deno.readTextFile(new URL(entry.name, dir)));
      }
   }
   return files;
};

const files = await sources();

/** Who may hold the unlabelled full service-role client, and why. */
const ADMIN_ALLOWED: Record<string, string> = {
   '_shared/supabaseClient.ts': 'defines it',
   '_shared/auth.ts': 'Supabase Auth verifies the bearer token (auth.getUser)',
   '_shared/company.ts':
      'not Amazon: where an account is used, for the user and create-account flows',
   'create-account/index.ts': 'not Amazon: creates the auth user',
   'user/index.ts': 'not Amazon: the Auth admin API (invite, update a user)'
};

/** The files that serve a user: no full service-role client by any name. */
const USER_PATH = (path: string) =>
   path.startsWith('amazon-listing/') ||
   path.startsWith('amazon-auth/') ||
   path === '_shared/listingStatus.ts' ||
   path === '_shared/amazonAccount.ts';

const lines = (text: string) => text.split('\n').map((line, i) => ({ line, n: i + 1 }));

Deno.test('supabaseAdmin is used only where the allow-list says why', () => {
   const offenders = [...files]
      .filter(([path, text]) => /\bsupabaseAdmin\b/.test(text) && !(path in ADMIN_ALLOWED))
      .map(([path]) => path);
   assertEquals(offenders, []);
});

Deno.test(
   'a service client is either the narrow ServiceRole or a system run (poll, schema refresh)',
   () => {
      const offenders = [...files].flatMap(([path, text]) =>
         lines(text)
            .filter(({ line }) => /\bsupabaseService\(/.test(line))
            .filter(({ line }) => !/export const supabaseService/.test(line))
            .filter(
               ({ line }) =>
                  !/serviceRole\(supabaseService\(/.test(line) &&
                  !/role: '(amazon-poll|amazon-schema-refresh)'/.test(line)
            )
            .map(({ n, line }) => `${path}:${n}: ${line.trim()}`)
      );
      assertEquals(offenders, []);
   }
);

Deno.test('the user path holds no admin client', () => {
   const offenders = [...files]
      .filter(([path]) => USER_PATH(path))
      .flatMap(([path, text]) =>
         lines(text)
            .filter(({ line }) => !/^import /.test(line))
            .filter(({ line }) => /\badmin\b/.test(line) || /\bsupabaseService\b(?!\()/.test(line))
            .map(({ n, line }) => `${path}:${n}: ${line.trim()}`)
      );
   assertEquals(offenders, []);
});

Deno.test("amazon-schema's service client serves the scheduled refresh only", () => {
   const text = files.get('amazon-schema/index.ts')!;
   const uses = lines(text).filter(({ line }) => /\bd\.admin\(\)/.test(line));
   assertEquals(uses.length, 1);
   const refreshStart = text.indexOf('const refresh = async');
   const refreshEnd = text.indexOf('\n};\n', refreshStart);
   const at = text.indexOf('d.admin()');
   assertEquals(at > refreshStart && at < refreshEnd, true);
});
