import { corsHeaders } from './cors.ts';
import { z } from './deps.ts';

export class HttpError extends Error {
   constructor(
      public status: number,
      message: string,
      public details?: unknown
   ) {
      super(message);
   }
}

export const json = (body: unknown, status = 200) =>
   new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: body === null ? {} : { 'Content-Type': 'application/json' }
   });

const PG_ERROR_STATUS: Record<string, number> = {
   '23505': 409, // unique_violation
   '23503': 409, // foreign_key_violation
   '42501': 403 // insufficient_privilege (RLS)
};

/** Maps an error to a response without leaking internals; unknown errors are logged and returned as 500. */
export const errorResponse = (error: unknown) => {
   if (error instanceof HttpError) {
      return json({ message: error.message, details: error.details }, error.status);
   }

   if (error instanceof z.ZodError) {
      return json(
         {
            message: 'invalid_request',
            issues: error.issues.map(({ path, code, message }) => ({ path, code, message }))
         },
         422
      );
   }

   const { code, status } = (error ?? {}) as { code?: string; status?: number };

   if (code && PG_ERROR_STATUS[code]) {
      return json({ message: 'request_rejected', code }, PG_ERROR_STATUS[code]);
   }

   // Supabase Auth errors carry a public error code (e.g. email_exists) and a 4xx status.
   if (typeof status === 'number' && status >= 400 && status < 500 && code) {
      return json({ message: code, code }, status);
   }

   console.error(error);
   return json({ message: 'internal_error' }, 500);
};

/** Deno.serve wrapper: handles CORS preflight, attaches CORS headers and maps thrown errors. */
export const serve = (handler: (req: Request) => Promise<Response>) =>
   Deno.serve(async (req) => {
      const cors = corsHeaders(req);

      if (req.method === 'OPTIONS') {
         return new Response('ok', { headers: cors });
      }

      let response: Response;
      try {
         response = await handler(req);
      } catch (error) {
         response = errorResponse(error);
      }

      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
   });
