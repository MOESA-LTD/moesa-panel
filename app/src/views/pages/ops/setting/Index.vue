<script setup lang="ts">
import {
   fromPickerDate,
   settingKind,
   toPickerDate,
   useSaveSetting,
   useSettingRows,
   type SettingRow
} from '@/api/setting';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useToast } from 'primevue/usetoast';

// The company's operating rules, each value edited in place and saved as soon as it changes;
// without the right to change settings the page only shows them.
const { t, te } = useI18n();
const toast = useToast();

const { data: rows, isPending } = useSettingRows();
const { mutateAsync: saveSetting } = useSaveSetting();

const sorted = computed(() => _sortBy(rows.value ?? [], 'key'));

/** The values being edited, by setting id; taken again from the stored ones whenever they load. */
const drafts = ref<Record<string, Json>>({});
watch(
   rows,
   (next) => (drafts.value = Object.fromEntries((next ?? []).map(({ id, value }) => [id, value]))),
   { immediate: true }
);

const label = (row: SettingRow) =>
   te(`ops.setting.keys.${row.key}`) ? t(`ops.setting.keys.${row.key}`) : (row.description ?? '');

const save = async (row: SettingRow) => {
   const value = drafts.value[row.id];
   // An emptied number is not a value; the stored one comes back.
   if (value === null || value === undefined || _isEqual(value, row.value)) {
      drafts.value[row.id] = row.value;
      return;
   }
   try {
      await saveSetting({ id: row.id, value });
      toast.add({ life: 3000, severity: ToastSeverity.SUCCESS, summary: t('toast.saved') });
   } catch (error) {
      drafts.value[row.id] = row.value;
      await appErrorHandler(error);
   }
};

const change = (row: SettingRow, value: Json | undefined) => {
   drafts.value[row.id] = value ?? null;
   save(row);
};

const changeDate = (row: SettingRow, date: unknown) => {
   if (date instanceof Date) change(row, fromPickerDate(date));
};
</script>

<template>
   <div class="flex flex-col gap-4 p-4">
      <h2 class="text-xl font-semibold m-0">{{ $t('ops.setting.title') }}</h2>
      <DataTable :value="sorted" :loading="isPending" data-key="id" size="small">
         <Column :header="$t('ops.setting.headers.setting')">
            <template #body="{ data }">
               <div class="flex flex-col">
                  <span>{{ label(data) }}</span>
                  <code class="text-sm text-muted-color">{{ data.key }}</code>
               </div>
            </template>
         </Column>
         <Column :header="$t('ops.setting.headers.value')" class="w-64">
            <template #body="{ data }">
               <ToggleSwitch
                  v-if="settingKind(data.value) === 'boolean'"
                  :model-value="drafts[data.id] as boolean"
                  :disabled="!$can('modify', 'setting')"
                  @update:model-value="change(data, $event)"
               />
               <!-- Its value is updated when the input is left, not on every key. -->
               <InputNumber
                  v-else-if="settingKind(data.value) === 'number'"
                  :model-value="drafts[data.id] as number"
                  :disabled="!$can('modify', 'setting')"
                  :max-fraction-digits="2"
                  fluid
                  @update:model-value="change(data, $event)"
               />
               <DatePicker
                  v-else-if="settingKind(data.value) === 'date'"
                  :model-value="toPickerDate(drafts[data.id] as string)"
                  :disabled="!$can('modify', 'setting')"
                  date-format="yy-mm-dd"
                  show-icon
                  fluid
                  @update:model-value="changeDate(data, $event)"
               />
               <InputText
                  v-else
                  :model-value="drafts[data.id] as string"
                  :disabled="!$can('modify', 'setting')"
                  fluid
                  @update:model-value="drafts[data.id] = $event ?? ''"
                  @blur="save(data)"
               />
            </template>
         </Column>
      </DataTable>
   </div>
</template>
