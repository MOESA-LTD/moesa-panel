<script setup lang="ts">
import { AMAZON_COUNTRIES, amazonErrorText, usePublishBulk, type BulkResult } from '@/api/amazon';
import type { ProductRow } from '@/api/product';

// Publishes the selected products (one customer's) to one Amazon marketplace: each product's cell
// in that country is published by the function, which reports a result per product (submitted,
// skipped, rejected). `products` names them in the result table.
const props = defineProps<{
   productIds: string[];
   products?: Pick<ProductRow, 'id' | 'sku' | 'display_name'>[];
}>();

const { t, te } = useI18n();

const country = ref<string>('DE');
const results = ref<BulkResult[] | null>(null);
const failure = ref<string | null>(null);

const { mutateAsync: publishBulk, isPending } = usePublishBulk();

const submit = async () => {
   failure.value = null;
   results.value = null;
   try {
      results.value = await publishBulk({ productIds: props.productIds, country: country.value });
   } catch (error) {
      failure.value = amazonErrorText(error);
   }
};

const RESULT_SEVERITY: Record<BulkResult['result'], string> = {
   submitted: 'success',
   skipped_no_cell: 'secondary',
   skipped_incomplete: 'warn',
   invalid: 'danger',
   error: 'danger'
};

const rows = computed(() =>
   (results.value ?? []).map((result) => {
      const product = props.products?.find(({ id }) => id === result.product_id);
      return {
         ...result,
         sku: product?.sku ?? result.product_id,
         name: product?.display_name ?? '',
         detail:
            result.code && te(`errors.${result.code}`)
               ? t(`errors.${result.code}`)
               : (result.code ?? '')
      };
   })
);
const submitted = computed(() => rows.value.filter(({ result }) => result === 'submitted').length);
</script>

<template>
   <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-4">
         <FormField :label="$t('ops.amazon.bulk.country')" v-slot="slotProps">
            <Select v-bind="slotProps" v-model="country" :options="[...AMAZON_COUNTRIES]" />
         </FormField>
         <Button
            data-action="bulk-publish"
            :icon="PrimeIcons.AMAZON"
            :label="$t('ops.amazon.bulk.submit')"
            :disabled="!productIds.length || !country"
            :loading="isPending"
            @click="submit"
         />
      </div>
      <Message v-if="failure" data-bulk-error severity="error">{{ failure }}</Message>
      <template v-if="results">
         <small data-summary class="text-muted-color">{{
            $t('ops.amazon.bulk.summary', { submitted, total: rows.length })
         }}</small>
         <table class="w-full border-collapse text-sm">
            <thead>
               <tr class="text-left">
                  <th class="p-2">{{ $t('ops.amazon.bulk.col.sku') }}</th>
                  <th class="p-2">{{ $t('ops.amazon.bulk.col.name') }}</th>
                  <th class="p-2">{{ $t('ops.amazon.bulk.col.result') }}</th>
                  <th class="p-2">{{ $t('ops.amazon.bulk.col.detail') }}</th>
               </tr>
            </thead>
            <tbody>
               <tr
                  v-for="row in rows"
                  :key="row.product_id"
                  :data-result="row.result"
                  class="border-t border-surface-200 dark:border-surface-700"
               >
                  <td class="p-2 font-semibold">{{ row.sku }}</td>
                  <td class="p-2">{{ row.name }}</td>
                  <td class="p-2">
                     <Tag
                        :value="$t(`ops.amazon.bulk.result.${row.result}`)"
                        :severity="RESULT_SEVERITY[row.result]"
                     />
                  </td>
                  <td class="p-2">{{ row.detail }}</td>
               </tr>
            </tbody>
         </table>
      </template>
   </div>
</template>
