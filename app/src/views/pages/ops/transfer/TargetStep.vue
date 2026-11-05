<script setup lang="ts">
import type { TransferMode } from '@/api/transfer';
import type { TransferWizard } from './useTransferWizard';

// The first step: where to, and whether the source keeps its rows. A refused target (read-only,
// another plan, not the caller's to write) is listed with its reason but cannot be picked.
const props = defineProps<{ wizard: TransferWizard }>();
const { options, optionsLoading, sourceWritable, target, mode, canRehearse, rehearsing, rehearse } =
   props.wizard;

const { t } = useI18n();

const targetGroups = computed(() => {
   const targets = options.value?.targets ?? [];
   return [true, false]
      .map((sameCompany) => ({
         label: t(`ops.transfer.target.${sameCompany ? 'same_company' : 'other_company'}`),
         items: targets
            .filter(({ same_company }) => same_company === sameCompany)
            .map((option) => ({ ...option, disabled: !!option.refusal }))
      }))
      .filter(({ items }) => items.length > 0);
});

const MODES: TransferMode[] = ['copy', 'move'];
const modeOptions = computed(() =>
   MODES.map((value) => ({
      value,
      label: t(`ops.transfer.mode.${value}_label`),
      disabled: value === 'move' && !sourceWritable.value
   }))
);
</script>

<template>
   <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
         <label for="transfer-target" class="font-medium">{{
            $t('ops.transfer.target.label')
         }}</label>
         <Select
            v-model="target"
            inputId="transfer-target"
            :options="targetGroups"
            optionLabel="display_name"
            optionValue="id"
            optionDisabled="disabled"
            optionGroupLabel="label"
            optionGroupChildren="items"
            :loading="optionsLoading"
            filter
            fluid
         >
            <template #option="{ option }">
               <span class="flex flex-col" :data-target="option.id">
                  <span>{{ option.display_name }}</span>
                  <small v-if="option.refusal" class="text-muted-color" data-refusal>
                     {{ $t(`errors.${option.refusal}`) }}
                  </small>
               </span>
            </template>
         </Select>
      </div>

      <div class="flex flex-col gap-2">
         <span class="font-medium">{{ $t('ops.transfer.mode.label') }}</span>
         <SelectButton
            v-model="mode"
            :options="modeOptions"
            optionLabel="label"
            optionValue="value"
            optionDisabled="disabled"
            :allowEmpty="false"
            data-mode
         />
         <small class="text-muted-color" data-mode-hint>
            {{ $t(`ops.transfer.mode.${mode}`) }}
         </small>
         <Message v-if="!sourceWritable" severity="secondary" size="small" data-read-only>
            {{ $t('ops.transfer.mode.move_read_only') }}
         </Message>
      </div>

      <div class="flex justify-end">
         <Button
            :label="$t('ops.transfer.rehearse')"
            :icon="PrimeIcons.PLAY"
            :disabled="!canRehearse"
            :loading="rehearsing"
            data-rehearse
            @click="rehearse"
         />
      </div>
   </div>
</template>
