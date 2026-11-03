<script setup lang="ts">
import type { ProductRow } from '@/api/product';
import { projectResource, useLinkProduct, useUnlinkProduct } from '@/api/project';
import { useLookup } from '@/api/useLookup';
import { appErrorHandler } from '@/lib/appErrorHandler';

// The products the project is about: linked from its customer's products, unlinked at will.
// The links come embedded in the card's cached project.
const props = defineProps<{ id: string }>();

type ProductOption = Pick<ProductRow, 'id' | 'sku' | 'display_name'>;

const { data: project } = projectResource.useOne(() => props.id);

const linked = computed(() =>
   (project.value?.project_product ?? []).flatMap(({ product }) => (product ? [product] : []))
);

const { data: products } = useLookup<ProductOption>(
   'product',
   () => ({
      select: 'id, sku, display_name',
      order: 'sku',
      in: { column: 'customer_id', values: [project.value?.customer_id] }
   }),
   () => !!project.value
);

const label = (product: ProductOption) =>
   [product.sku, product.display_name].filter(Boolean).join(' — ');

const options = computed(() => {
   const linkedIds = new Set(linked.value.map(({ id }) => id));
   return (products.value ?? [])
      .filter(({ id }) => !linkedIds.has(id))
      .map((product) => ({ value: product.id, label: label(product) }));
});

const selected = ref<string | null>(null);
const { mutateAsync: link, isPending: isLinking } = useLinkProduct();
const { mutateAsync: unlink } = useUnlinkProduct();

const linkSelected = async () => {
   if (!project.value || !selected.value) return;
   await link({
      project_id: project.value.id,
      product_id: selected.value,
      tenant_id: project.value.tenant_id
   }).then(() => (selected.value = null), appErrorHandler);
};

const unlinkProduct = (productId: string) =>
   unlink({ projectId: props.id, productId }).catch(appErrorHandler);
</script>

<template>
   <div class="flex flex-col gap-4">
      <span v-if="$can('create', 'project_product')" class="flex flex-wrap items-center gap-2">
         <Select
            v-model="selected"
            :options
            option-value="value"
            option-label="label"
            filter
            showClear
            :placeholder="$t('ops.product.select')"
            class="flex-1 min-w-64"
         />
         <Button
            :icon="PrimeIcons.LINK"
            :label="$t('ops.project.products.link')"
            :disabled="!selected"
            :loading="isLinking"
            @click="linkSelected"
         />
      </span>

      <DataTable :value="linked" dataKey="id" size="small">
         <template #empty>{{ $t('ops.project.products.empty') }}</template>
         <Column field="sku" :header="$t('ops.product.fields.sku')" />
         <Column field="display_name" :header="$t('ops.product.fields.display_name')" />
         <Column v-if="$can('modify', 'project_product')" class="w-0">
            <template #body="{ data }">
               <Button
                  variant="text"
                  severity="danger"
                  :icon="PrimeIcons.TIMES"
                  :label="$t('ops.project.products.unlink')"
                  @click="unlinkProduct(data.id)"
               />
            </template>
         </Column>
      </DataTable>
   </div>
</template>
