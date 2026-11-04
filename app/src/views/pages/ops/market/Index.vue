<script setup lang="ts">
import { matrixCounts, useMarketCells, type MarketCellRow } from '@/api/marketMatrix';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';
import { useAbility } from '@casl/vue';

// The market matrix (S05) of the customer the lists are filtered by (every customer's when none
// is): the pivot of products by platform and country, or the cells as a list (?view=list).
type View = 'matrix' | 'list';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const ability = useAbility();
const customerFilter = useCustomerFilter();

const view = computed<View>({
   get: () => (route.query.view === 'list' ? 'list' : 'matrix'),
   set: (value) => router.replace({ query: { ...route.query, view: value } })
});
const viewOptions = computed(() => [
   { value: 'matrix', label: t('ops.market.view.matrix') },
   { value: 'list', label: t('ops.market.view.list') }
]);

/** The matrix narrowed to one platform; none shows every platform. */
const platformId = ref<string | null>(null);

const { data: cells } = useMarketCells(() => ({
   customerId: customerFilter.customerId,
   platformId: platformId.value
}));

// Per customer of the shown cells: its live cells against its target ones.
const counters = computed(() => {
   const shown = cells.value ?? [];
   const codes = new Map(shown.map((cell) => [cell.customer_id, cell.customer_code]));
   return Object.entries(
      matrixCounts(shown as Pick<MarketCellRow, 'customer_id' | 'status'>[])
   ).map(([customerId, { live, target }]) => ({
      customerId,
      label: t('ops.market.counter', { code: codes.get(customerId) ?? '', live, target })
   }));
});

const canCreate = computed(() => ability.can('create', 'market_cell'));

const dialog = { showDialog: DIALOG_POSITIONS.CENTER };

const openCell = (id: string) =>
   router.push({ name: 'ops-market-cell-edit', params: { id }, query: dialog });

const addCell = (cell: { productId: string; platformId: string; country: string }) =>
   router.push({
      name: 'ops-market-cell-add',
      query: {
         ...dialog,
         product_id: cell.productId,
         platform_id: cell.platformId,
         country: cell.country
      }
   });

const addCells = () => router.push({ name: 'ops-market-cells-add', query: dialog });
</script>

<template>
   <section class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-center gap-4">
         <h2 class="m-0 text-xl font-semibold">{{ $t('ops.market.title') }}</h2>
         <SelectButton
            v-model="view"
            :options="viewOptions"
            option-value="value"
            option-label="label"
            :allow-empty="false"
         />
         <span class="flex-1" />
         <Button
            v-if="canCreate"
            variant="outlined"
            :icon="PrimeIcons.PLUS"
            :label="$t('ops.market.add_cells')"
            @click="addCells"
         />
      </div>
      <template v-if="view === 'matrix'">
         <div class="flex flex-wrap items-center gap-2">
            <SelectPlatform v-model="platformId" show-clear class="w-56" />
            <Tag
               v-for="counter in counters"
               :key="counter.customerId"
               :value="counter.label"
               severity="secondary"
            />
         </div>
         <MarketMatrixGrid :cells="cells ?? []" :canCreate @open="openCell" @add="addCell" />
      </template>
      <MarketCellTable v-else />
   </section>
</template>
