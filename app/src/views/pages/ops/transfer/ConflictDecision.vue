<script setup lang="ts">
import { CUSTOMER_CODE } from '@/api/customer';
import { SUPPLIER_CODE } from '@/api/supplier';
import type { TableName } from '@/api/queryKeys';
import type { TransferAction, TransferConflict, TransferDecision } from '@/api/transfer';
import { useLookup } from '@/api/useLookup';

// One conflict of the rehearsal and its decision. Only the actions the server offers for it are
// listed. A customer or supplier code may be linked to any of the target's customers or suppliers
// (looked up in the target tenant: ReportStep provides it as the form tenant) or given a typed
// code; every other map links to the row the server found (existing_id), the only one it accepts.
const props = defineProps<{
   conflict: TransferConflict;
   decision: TransferDecision | null;
   target: string;
}>();
const emit = defineEmits<{ decide: [decision: TransferDecision | null] }>();

const { t, te } = useI18n();

const tableLabel = (table: string) => (te(`fields.${table}`) ? t(`fields.${table}`) : table);

const typedCode = computed(
   () => props.conflict.kind === 'customer_code' || props.conflict.kind === 'supplier_code'
);
const codePattern = computed(() =>
   props.conflict.kind === 'customer_code' ? CUSTOMER_CODE : SUPPLIER_CODE
);

const skipDrops = computed(() =>
   Object.entries(props.conflict.skip_drops ?? {})
      .filter(([, count]) => count > 0)
      .map(([table, count]) =>
         t('ops.transfer.skip_drops_item', { table: tableLabel(table), count })
      )
      .join(', ')
);

const actionOptions = computed(() =>
   props.conflict.actions.map((action) => ({
      value: action,
      label: t(`ops.transfer.action.${action}`),
      hint:
         action === 'skip' && skipDrops.value
            ? t('ops.transfer.skip_drops', { list: skipDrops.value })
            : null
   }))
);

const action = computed({
   get: () => props.decision?.action ?? null,
   set: (value: TransferAction | null) => {
      if (!value) return emit('decide', null);
      if (value === 'map')
         return emit('decide', {
            action: 'map',
            ...(props.conflict.existing_id ? { target_id: props.conflict.existing_id } : {})
         });
      emit('decide', { action: value });
   }
});

// The target's rows of the conflict's table, for a code kind's map only.
const lookupEnabled = computed(() => typedCode.value && action.value === 'map');
const { data: rows, isLoading: rowsLoading } = useLookup<{
   id: string;
   code: string;
   display_name: string;
}>(
   // A conflict keeps its table: the component is keyed by the conflict.
   props.conflict.table as TableName,
   () => ({
      select: 'id, code, display_name',
      order: 'code',
      in: { column: 'tenant_id', values: [props.target] }
   }),
   lookupEnabled
);
const rowOptions = computed(() =>
   (rows.value ?? []).map(({ id, code, display_name }) => ({
      id,
      label: `${code} · ${display_name}`
   }))
);

const targetId = computed({
   get: () => props.decision?.target_id ?? null,
   set: (value: string | null) =>
      emit('decide', { action: 'map', ...(value ? { target_id: value } : {}) })
});

const code = computed({
   get: () => props.decision?.code ?? '',
   set: (value: string) =>
      emit('decide', { action: 'new_code', ...(value ? { code: value.toUpperCase() } : {}) })
});
const codeInvalid = computed(() => !!code.value && !codePattern.value.test(code.value));

const message = computed(() =>
   t(`ops.transfer.conflict.${props.conflict.kind}`, {
      code: props.conflict.label ?? props.conflict.source_id
   })
);
</script>

<template>
   <div class="flex flex-col gap-2 py-3" :data-conflict="conflict.key">
      <div class="flex flex-wrap items-center gap-2">
         <Tag severity="secondary" :value="$t(`ops.transfer.conflict_kind.${conflict.kind}`)" />
         <span>{{ message }}</span>
      </div>
      <div class="flex flex-wrap items-start gap-3">
         <Select
            v-model="action"
            :options="actionOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="$t('common.select')"
            class="min-w-60"
            data-action
         >
            <template #option="{ option }">
               <span class="flex flex-col">
                  <span>{{ option.label }}</span>
                  <small v-if="option.hint" class="text-muted-color">{{ option.hint }}</small>
               </span>
            </template>
         </Select>

         <template v-if="action === 'map'">
            <Select
               v-if="typedCode"
               v-model="targetId"
               :options="rowOptions"
               optionLabel="label"
               optionValue="id"
               :loading="rowsLoading"
               :placeholder="$t('ops.transfer.decision.target')"
               filter
               class="min-w-60"
               data-target-row
            />
            <span v-else class="self-center" data-existing>
               {{ $t('ops.transfer.decision.target') }}:
               {{ conflict.label ?? conflict.existing_id }}
            </span>
         </template>

         <span v-if="action === 'new_code' && typedCode" class="flex flex-col gap-1">
            <InputText
               v-model="code"
               :placeholder="$t('ops.transfer.decision.code')"
               :aria-label="$t('ops.transfer.decision.code')"
               :invalid="codeInvalid"
               data-code
            />
         </span>

         <small
            v-if="action === 'skip' && skipDrops"
            class="self-center text-muted-color"
            data-drops
         >
            {{ $t('ops.transfer.skip_drops', { list: skipDrops }) }}
         </small>
      </div>
   </div>
</template>
