<script setup lang="ts">
import { formatAmount } from '@/api/purchaseOrder';
import type { PiRow } from '@/api/purchaseOrder/figures';

// The S09 §C PI check as a table: what the system recalculates, what the PI says and the
// difference (PI − system), from piDifferences. A row whose figures differ is marked. Display only.
const props = defineProps<{ rows: PiRow[]; currency: string }>();

const { t } = useI18n();

const differs = (row: PiRow) => row.diff !== null && row.diff !== 0;

// The same rule as piDifferences' `matches`: nothing differs, and the PI states every figure but
// the line totals (a line without a PI total is not compared).
const matches = computed(() =>
   props.rows.every((row) => !differs(row) && (row.key === 'line' || row.pi !== null))
);

const label = (row: PiRow) => row.label ?? t(`ops.purchase_order.pi.${row.key}`);
</script>

<template>
   <table class="w-full border-collapse text-sm">
      <thead>
         <tr class="border-b border-surface">
            <th class="p-2 text-start" />
            <th class="p-2 text-end">{{ $t('ops.purchase_order.pi.system') }}</th>
            <th class="p-2 text-end">{{ $t('ops.purchase_order.pi.entered') }}</th>
            <th class="p-2 text-end">{{ $t('ops.purchase_order.pi.diff') }}</th>
         </tr>
      </thead>
      <tbody>
         <tr
            v-for="(row, index) in rows"
            :key="`${row.key}-${index}`"
            class="border-b border-surface"
            :class="{ 'text-red-500': differs(row), 'font-semibold': row.key === 'total' }"
            :data-test="differs(row) ? 'pi-diff' : undefined"
         >
            <td class="p-2">{{ label(row) }}</td>
            <td class="p-2 text-end">{{ formatAmount(row.system, currency) }}</td>
            <td class="p-2 text-end">{{ formatAmount(row.pi, currency) }}</td>
            <td class="p-2 text-end">{{ formatAmount(row.diff, currency) }}</td>
         </tr>
      </tbody>
      <tfoot>
         <tr>
            <td colspan="4" class="p-2">
               <Message v-if="matches" severity="success" size="small" data-test="pi-result">
                  {{ $t('ops.purchase_order.pi.matches') }}
               </Message>
               <Message v-else severity="error" size="small" data-test="pi-result">
                  {{ $t('ops.purchase_order.pi.mismatch') }}
               </Message>
            </td>
         </tr>
      </tfoot>
   </table>
</template>
