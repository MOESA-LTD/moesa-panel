import { assertEquals } from 'jsr:@std/assert@1';
import { errorResponse } from '../_shared/http.ts';

const raised = (message: string) => Object.assign(new Error(message), { code: 'P0001' });

Deno.test('errorResponse passes on the error keys the database raises', async () => {
   const response = errorResponse(raised('plan_limit_users'));
   assertEquals(response.status, 403);
   assertEquals(await response.json(), { message: 'plan_limit_users', code: 'P0001' });
});

Deno.test('errorResponse hides any other message the database raises', async () => {
   const log = console.error;
   console.error = () => {};
   try {
      const response = errorResponse(raised('User with id 42 does not exist in public.user'));
      assertEquals(response.status, 403);
      assertEquals(await response.json(), { message: 'request_rejected', code: 'P0001' });
   } finally {
      console.error = log;
   }
});
