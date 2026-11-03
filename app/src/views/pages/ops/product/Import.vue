<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import {
   PRODUCT_TO_S10,
   mapS10Rows,
   type ImportError,
   type ImportWarning,
   type ProductImportRow
} from '@/api/product/csv';
import { useImportProducts } from '@/api/product/import';
import { parseCsv } from '@/lib/csv/parse';
import type { FileUploadSelectEvent } from 'primevue';
import { useToast } from 'primevue/usetoast';

// An S10 product file: checked here row by row, then saved whole by the database or not at all.
const PREVIEW_ROWS = 20;

const { t } = useI18n();
const toast = useToast();
const dialogRef = useDialogRef();
const { mutateAsync: importProducts, isPending } = useImportProducts();

const fileName = ref<string | null>(null);
const rows = ref<ProductImportRow[]>([]);
const warnings = ref<ImportWarning[]>([]);
const errors = ref<ImportError[]>([]);

const preview = computed(() => rows.value.slice(0, PREVIEW_ROWS));
const canImport = computed(() => rows.value.length > 0 && errors.value.length === 0);

const readText = (file: File) =>
   new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
   });

const onSelect = async ({ files }: FileUploadSelectEvent) => {
   const file = ([] as File[]).concat(files)[0];
   if (!file) return;
   const { header, rows: cells } = parseCsv(await readText(file));
   const mapped = mapS10Rows(header, cells);
   fileName.value = file.name;
   rows.value = mapped.rows;
   warnings.value = mapped.warnings;
   errors.value = mapped.errors;
};

const onImport = async () => {
   const result = await importProducts(rows.value);
   if (!result.ok) {
      errors.value = result.errors;
      toast.add({
         life: 5000,
         severity: ToastSeverity.ERROR,
         summary: t('toast.error'),
         detail: t('ops.product.import.failed', { count: result.errors.length })
      });
      return;
   }
   toast.add({
      life: 5000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('ops.product.import.done', { inserted: result.inserted, updated: result.updated })
   });
   dialogRef?.value.close();
};

/** The S10 column an error or warning is about, as the file names it. */
const columnOf = (field: string) => PRODUCT_TO_S10[field as keyof typeof PRODUCT_TO_S10] ?? field;
</script>

<template>
   <div class="card flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-4">
         <FileUpload
            mode="basic"
            customUpload
            auto
            accept=".csv,text/csv"
            :chooseLabel="$t('ops.product.import.choose')"
            :chooseButtonProps="{ outlined: true }"
            :disabled="isPending"
            @select="onSelect"
         />
         <span v-if="fileName" class="text-muted-color">
            {{ $t('ops.product.import.summary', { file: fileName, count: rows.length }) }}
         </span>
         <span class="flex-1" />
         <Button
            :label="$t('ops.product.import.submit')"
            :icon="PrimeIcons.UPLOAD"
            :disabled="!canImport"
            :loading="isPending"
            @click="onImport"
         />
      </div>

      <Message v-if="!fileName" severity="secondary">{{ $t('ops.product.import.hint') }}</Message>

      <Message v-if="errors.length" severity="error">
         <div class="font-semibold">{{ $t('ops.product.import.errors_title') }}</div>
         <ul class="list-disc ps-5">
            <li v-for="(error, index) in errors" :key="index">
               {{
                  $t('ops.product.import.row_error', {
                     row: error.row,
                     column: columnOf(error.field),
                     message: $t(`ops.product.import.errors.${error.code}`, {
                        sku: error.sku ?? ''
                     })
                  })
               }}
            </li>
         </ul>
      </Message>

      <Message v-if="warnings.length" severity="warn">
         <div class="font-semibold">{{ $t('ops.product.import.warnings_title') }}</div>
         <ul class="list-disc ps-5">
            <li v-for="warning in warnings" :key="warning.column">
               {{ warning.column }}: {{ $t(`ops.product.import.warnings.${warning.code}`) }}
            </li>
         </ul>
      </Message>

      <DataTable v-if="rows.length" :value="preview" size="small" scrollable>
         <template #header>
            {{ $t('ops.product.import.preview', { shown: preview.length, count: rows.length }) }}
         </template>
         <Column field="customer_code" :header="$t('ops.product.fields.customer')" />
         <Column field="sku" :header="$t('ops.product.fields.sku')" />
         <Column field="display_name" :header="$t('ops.product.fields.display_name')" />
         <Column field="variant_label" :header="$t('ops.product.fields.variant_label')" />
         <Column field="gtin" :header="$t('ops.product.fields.gtin')" />
         <Column field="supplier_code" :header="$t('ops.product.fields.supplier')" />
         <Column field="status" :header="$t('ops.product.fields.status')">
            <template #body="{ data }">
               {{ data.status ? $t(`ops.product.status.${data.status}`) : '' }}
            </template>
         </Column>
      </DataTable>
   </div>
</template>
