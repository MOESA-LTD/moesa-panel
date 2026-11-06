// Pinned third-party dependencies shared by every edge function.
export { createMongoAbility } from 'npm:@casl/ability@6.7.3';
export type { AnyAbility } from 'npm:@casl/ability@6.7.3';
export { createClient } from 'npm:@supabase/supabase-js@2.50.3';
export type { SupabaseClient, SupabaseClientOptions } from 'npm:@supabase/supabase-js@2.50.3';
export { jwtDecode } from 'npm:jwt-decode@4.0.0';
export { z } from 'npm:zod@3.25.76';
export { crypto, timingSafeEqual } from 'jsr:@std/crypto@1';
