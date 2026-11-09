import { assert, assertEquals } from 'jsr:@std/assert@1';
import { errorResponse } from '../_shared/http.ts';
import { createUser, getUser, updateUser, USER_COLUMNS } from '../user/index.ts';
import { authorizedRequest, CALLER, jsonResponse, stubFetch, TENANT } from './helpers.ts';

const OTHER = '00000000-0000-4000-8000-0000000000bb';

type Seen = { method: string; path: string; search: string; profile: string | null; body: string };

/** Answers what the user function reads and writes; `canWrite` is public.can_write_user_field. */
const backend = (opts: { canWrite?: boolean; existingUser?: boolean } = {}) => {
   const seen: Seen[] = [];
   const restore = stubFetch(async (url, init) => {
      const method = init?.method ?? 'GET';
      seen.push({
         method,
         path: url.pathname,
         search: url.search,
         profile:
            new Headers(init?.headers).get('Accept-Profile') ??
            new Headers(init?.headers).get('Content-Profile'),
         body: init?.body ? String(init.body) : ''
      });
      switch (url.pathname) {
         case '/rest/v1/tenant_user':
            if (method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '*/1' } });
            return jsonResponse([{ tenant_id: TENANT }]);
         case '/rest/v1/tenant_owner':
         case '/rest/v1/tenant':
            return jsonResponse([]);
         case '/rest/v1/rpc/is_super_admin':
            return jsonResponse(false);
         case '/rest/v1/rpc/can_write_user_field':
            return jsonResponse(opts.canWrite ?? false);
         case '/rest/v1/user':
            // The lookup by e-mail (createUser) finds nobody unless asked to; getUser reads one row.
            if (url.searchParams.has('email'))
               return jsonResponse(opts.existingUser ? [{ id: OTHER, email: 'a@b.de' }] : []);
            return jsonResponse([
               { id: OTHER, email: null, phone: null, user_metadata: null, created_at: 'x' }
            ]);
         case '/auth/v1/invite':
            return jsonResponse({ id: OTHER, email: 'a@b.de' });
         default:
            if (url.pathname.startsWith('/auth/v1/admin/users/'))
               return jsonResponse({ id: OTHER, email: 'a@b.de' });
            return jsonResponse({}, 404);
      }
   });
   return { seen, restore };
};

const withBody = (req: Request, method: string, body: unknown) =>
   new Request(req.url, { method, headers: req.headers, body: JSON.stringify(body) });

// What the serve wrapper does with a thrown error.
const respond = (response: Promise<Response>) => response.catch(errorResponse);

const adminWrites = (seen: Seen[]) =>
   seen.filter((s) => s.path.startsWith('/auth/v1/') && s.method !== 'GET');

Deno.test('getUser reads the member through api and never through the admin API', async () => {
   const { seen, restore } = backend();
   try {
      const res = await getUser(authorizedRequest(['select', 'user']), OTHER);
      assertEquals(res.status, 200);
      assertEquals((await res.json()).email, null);
   } finally {
      restore();
   }
   assert(!seen.some((s) => s.path.includes('/auth/v1/admin/users/')));
   const read = seen.find((s) => s.path === '/rest/v1/user');
   assertEquals(read?.profile, 'api');
   assertEquals(new URLSearchParams(read?.search).get('select'), USER_COLUMNS.replaceAll(' ', ''));
});

Deno.test('updateUser refuses to write another user without the field right', async () => {
   const { seen, restore } = backend({ canWrite: false });
   try {
      const req = withBody(authorizedRequest(['update', 'user']), 'PUT', {
         user_metadata: { display_name: 'New' }
      });
      const res = await respond(updateUser(req, OTHER));
      assertEquals(res.status, 403);
      assertEquals((await res.json()).message, 'field_write_forbidden');
   } finally {
      restore();
   }
   assertEquals(adminWrites(seen), []);
   const check = seen.find((s) => s.path === '/rest/v1/rpc/can_write_user_field');
   assertEquals(JSON.parse(check!.body), { p_user: OTHER, p_field: 'user_metadata' });
});

Deno.test('updateUser writes through the admin API once the database grants the right', async () => {
   const { seen, restore } = backend({ canWrite: true });
   try {
      const req = withBody(authorizedRequest(['update', 'user']), 'PUT', {
         user_metadata: { display_name: 'New' }
      });
      assertEquals((await updateUser(req, OTHER)).status, 200);
   } finally {
      restore();
   }
   assertEquals(adminWrites(seen).map((s) => s.method), ['PUT']);
   // The right is checked as the caller (public schema, caller's token), not with the service role.
   assertEquals(seen.find((s) => s.path.endsWith('/can_write_user_field'))?.profile, 'public');
});

Deno.test('updateUser without personal data in the body needs no field right', async () => {
   const { seen, restore } = backend({ canWrite: false });
   try {
      const req = withBody(authorizedRequest(['update', 'user']), 'PUT', {});
      assertEquals((await updateUser(req, OTHER)).status, 200);
   } finally {
      restore();
   }
   assert(!seen.some((s) => s.path.endsWith('/can_write_user_field')));
});

Deno.test('updateUser on the caller own account asks the database too (it answers yes)', async () => {
   const { seen, restore } = backend({ canWrite: true });
   try {
      const req = withBody(authorizedRequest(['update', 'user']), 'PUT', {
         user_metadata: { display_name: 'Me' }
      });
      await updateUser(req, CALLER);
   } finally {
      restore();
   }
   const check = seen.find((s) => s.path.endsWith('/can_write_user_field'));
   assertEquals(JSON.parse(check!.body).p_user, CALLER);
});

Deno.test('createUser refuses to invite with personal data the caller may not write', async () => {
   const { seen, restore } = backend({ canWrite: false });
   try {
      const req = withBody(authorizedRequest(['insert', 'user']), 'POST', {
         email: 'a@b.de',
         user_metadata: { display_name: 'New' }
      });
      const res = await respond(createUser(req));
      assertEquals(res.status, 403);
      assertEquals((await res.json()).message, 'field_write_forbidden');
   } finally {
      restore();
   }
   assertEquals(adminWrites(seen), []);
   const check = seen.find((s) => s.path.endsWith('/can_write_user_field'));
   // A new account has no id yet: the database answers for the caller's tenant scope.
   assertEquals(JSON.parse(check!.body).p_user, null);
});

Deno.test('createUser invites once the right is granted', async () => {
   const { seen, restore } = backend({ canWrite: true });
   try {
      const req = withBody(authorizedRequest(['insert', 'user']), 'POST', {
         email: 'a@b.de',
         user_metadata: { display_name: 'New' }
      });
      const res = await createUser(req);
      // The invite went out; the membership insert is not stubbed.
      assert(res.status !== 403);
   } finally {
      restore();
   }
   assertEquals(adminWrites(seen).map((s) => s.path.split('/').pop()).includes('invite'), true);
   const fields = seen
      .filter((s) => s.path.endsWith('/can_write_user_field'))
      .map((s) => JSON.parse(s.body).p_field)
      .sort();
   assertEquals(fields, ['email', 'user_metadata']);
});
