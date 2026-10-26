import { supabase } from '@/lib/supabase';

export type JunctionSync = {
   /** Junction table, e.g. product_categories. */
   table: keyof Tables;
   /** Column referencing the owner, e.g. product_id. */
   ownerColumn: string;
   ownerId: string;
   /** Column referencing the linked rows, e.g. category_id. */
   itemColumn: string;
   /** The complete set of linked ids after the change. */
   itemIds: readonly string[];
};

/**
 * Makes the junction rows of `ownerId` match `itemIds`, writing only the links that were added or
 * removed (instead of deleting and re-inserting all of them).
 */
export async function syncJunction({
   table,
   ownerColumn,
   ownerId,
   itemColumn,
   itemIds
}: JunctionSync) {
   // supabase-js cannot type a junction table chosen at runtime.
   const junction = () => supabase.from(table) as any;

   const { data: current } = await junction()
      .select(itemColumn)
      .eq(ownerColumn, ownerId)
      .throwOnError();

   const existing = new Set<string>(
      (current ?? []).map((row: Record<string, string>) => row[itemColumn])
   );
   const wanted = new Set(itemIds);

   const removed = [...existing].filter((id) => !wanted.has(id));
   const added = [...wanted].filter((id) => !existing.has(id));

   if (removed.length) {
      await junction().delete().eq(ownerColumn, ownerId).in(itemColumn, removed).throwOnError();
   }
   if (added.length) {
      await junction()
         .insert(added.map((id) => ({ [ownerColumn]: ownerId, [itemColumn]: id })))
         .throwOnError();
   }
}
