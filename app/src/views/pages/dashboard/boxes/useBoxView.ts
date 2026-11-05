import type { DashboardBoxDef, DashboardBoxId } from '@/constants/dashboard';
import { computed, type ComputedRef, type Ref } from 'vue';
import type { BoxView } from './views';

/** A box's view of its query's rows: the hook runs once, the view follows its data. */
export function useBoxView<Row>(
   box: DashboardBoxDef,
   useRows: () => { data: Ref<Row[] | undefined> },
   view: (rows: readonly Row[], id: DashboardBoxId) => BoxView
): ComputedRef<BoxView> {
   const { data } = useRows();
   return computed(() => view(data.value ?? [], box.id));
}
