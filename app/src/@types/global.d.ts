// Generated from the local database into the edge functions, which can only import from their own
// directory; the app shares that one file (type-only, so nothing is bundled). See dev:supabase-types.
import type { Database, Json as DbJson } from '../../../supabase/functions/_shared/database.types';

declare global {
   type Db = Database;
   type Json = DbJson;
   type Public = Db['public'] & {};
   type Tables = Public['Tables'] & {};
   type Views = Public['Views'] & {};
}
