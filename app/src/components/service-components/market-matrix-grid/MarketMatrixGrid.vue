<script setup lang="ts">
import { listingStateLabel, listingStateSeverity, shownListingState } from '@/api/amazon';
import {
   buildMatrix,
   MARKET_CELL_STATUS_SEVERITY,
   type MarketCellOverviewRow,
   type MarketCellStatus,
   type MarketMatrixColumn,
   type MarketMatrixRow
} from '@/api/marketMatrix';
import { formatEmpty } from '@/constants/format';

// The S05 matrix: a row per product, a column per platform and country that has a cell. An opened
// cell shows its status (and a warning when its compliance is red) and opens it; a cell that is not
// opened shows S05's dash, a button to open it for those who may. An Amazon cell the API manages
// shows its listing state under the status; with `amazonConnected` (the customers whose Amazon
// account is connected) a cell of any other customer shows draft (ruling N2).
const props = defineProps<{
   cells: MarketCellOverviewRow[];
   canCreate: boolean;
   /** The cells are being loaded. */
   loading?: boolean;
   /** The cells could not be loaded: says so instead of the empty matrix's hint. */
   error?: boolean;
   /** The customers whose Amazon account is connected; unset shows the stored listing states. */
   amazonConnected?: readonly string[];
}>();
const emit = defineEmits<{
   open: [cellId: string];
   add: [cell: { productId: string; platformId: string; country: string }];
}>();

const { t } = useI18n();
const matrix = computed(() => buildMatrix(props.cells));

const add = (row: MarketMatrixRow, column: MarketMatrixColumn) =>
   emit('add', {
      productId: row.productId,
      platformId: column.platformId,
      country: column.country
   });

/** The listing state an Amazon cell shows, or null for a cell the API does not manage. */
const listingState = (cell: MarketCellOverviewRow) => {
   if (cell.platform_id !== 'amazon' || !cell.listing_state) return null;
   const connected = !props.amazonConnected || props.amazonConnected.includes(cell.customer_id!);
   return shownListingState(cell.listing_state, connected);
};

const columnLabel = (column: MarketMatrixColumn) => `${column.platformName} ${column.country}`;
</script>

<template>
   <DataTable
      :value="matrix.rows"
      :loading
      dataKey="productId"
      scrollable
      size="small"
      showGridlines
   >
      <Column frozen :header="$t('ops.market.fields.product')" class="min-w-48">
         <template #body="{ data }">
            <div class="font-semibold">{{ data.sku }}</div>
            <small class="text-muted-color">{{ data.productName }}</small>
         </template>
      </Column>
      <Column
         v-for="column in matrix.columns"
         :key="column.key"
         :header="columnLabel(column)"
         class="text-center"
      >
         <template #body="{ data }">
            <button
               v-if="data.cells[column.key]"
               type="button"
               class="inline-flex cursor-pointer flex-wrap items-center justify-center gap-1 border-none bg-transparent p-0"
               @click="emit('open', data.cells[column.key].id)"
            >
               <Tag
                  :value="t(`ops.market.status.${data.cells[column.key].status}`)"
                  :severity="
                     MARKET_CELL_STATUS_SEVERITY[data.cells[column.key].status as MarketCellStatus]
                  "
               />
               <i
                  v-if="data.cells[column.key].compliance === 'red'"
                  class="pi pi-exclamation-triangle text-red-500"
                  role="img"
                  v-tooltip.top="t('ops.market.compliance.red')"
                  :aria-label="t('ops.market.compliance.red')"
               />
               <Tag
                  v-if="listingState(data.cells[column.key])"
                  class="basis-full !text-xs"
                  :data-listing-state="listingState(data.cells[column.key])"
                  :value="listingStateLabel(listingState(data.cells[column.key]))"
                  :severity="listingStateSeverity(listingState(data.cells[column.key]))"
                  v-tooltip.top="t('ops.amazon.cell.state')"
               />
            </button>
            <Button
               v-else-if="canCreate"
               :label="formatEmpty(null)"
               text
               size="small"
               severity="secondary"
               :aria-label="t('ops.market.add_cell', { sku: data.sku, cell: columnLabel(column) })"
               @click="add(data, column)"
            />
            <span v-else class="text-muted-color">{{ formatEmpty(null) }}</span>
         </template>
      </Column>
      <template #empty>
         <small v-if="error" data-test="market-load-error" class="text-red-500">
            {{ $t('ops.market.load_error') }}
         </small>
         <span v-else class="text-muted-color">{{ $t('ops.market.no_cells') }}</span>
      </template>
   </DataTable>
</template>
