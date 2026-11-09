// Generated from the local database into the edge functions, which can only import from their own
// directory; the app shares that one file (type-only, so nothing is bundled). See dev:supabase-types.
import type { Json as DbJson } from '../../../supabase/functions/_shared/database.types';
import type { ApiTables, AppDatabase } from './database';

declare global {
   type Db = AppDatabase;
   type Json = DbJson;
   /** The functions (RPCs) and their types. */
   type Public = Db['public'] & {};
   /** What the app reads and writes: one view per table, masking the fields the user may not read. */
   type Api = Db['api'] & {};
   type Views = Api['Views'] & {};
   /** The tables as the app reaches them: their `api` views. */
   type Tables = ApiTables;
}
