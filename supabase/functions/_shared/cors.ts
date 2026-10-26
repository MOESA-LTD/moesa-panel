// Comma separated list, e.g. "https://app.echochart.com,http://localhost:5173". Defaults to "*".
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
   .split(',')
   .map((origin) => origin.trim())
   .filter(Boolean);

export const corsHeaders = (req: Request): Record<string, string> => {
   const origin = req.headers.get('Origin') ?? '';
   const allowOrigin = allowedOrigins.includes('*')
      ? '*'
      : allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];

   return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
         'authorization, x-tenant, x-tenant-id, 0, x-client-info, apikey, content-type',
      Vary: 'Origin'
   };
};
