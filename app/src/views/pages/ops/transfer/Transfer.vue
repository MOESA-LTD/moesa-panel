<script setup lang="ts">
import { customerResource } from '@/api/customer';
import ReportStep from './ReportStep.vue';
import ResultStep from './ResultStep.vue';
import TargetStep from './TargetStep.vue';
import { useTransferWizard } from './useTransferWizard';

// The transfer of a customer (or of some of its products) to another company or branch, as a
// route dialog: pick the target and mode, rehearse, decide the conflicts, run. The source is the
// customer's own tenant, which may be another of the branches shown than the active one.
const props = defineProps<{ customerId: string; productIds: string[] | null }>();

const { data: customer } = customerResource.useOne(() => props.customerId);

const wizard = useTransferWizard({
   sourceTenant: () => customer.value?.tenant_id ?? null,
   customerId: () => props.customerId,
   productIds: () => props.productIds
});
const { step, transfer, report, target } = wizard;

const { t } = useI18n();
const title = computed(() => {
   const code = customer.value?.code ?? '';
   return props.productIds?.length
      ? t('ops.transfer.title_products', { code, count: props.productIds.length })
      : t('ops.transfer.title_customer', { code });
});

const STEPS = ['target', 'report', 'result'] as const;
</script>

<template>
   <div class="card flex flex-col gap-4">
      <h3 class="text-lg font-semibold">{{ title }}</h3>
      <Stepper :value="step" linear>
         <StepList>
            <Step v-for="value in STEPS" :key="value" :value>
               {{ $t(`ops.transfer.steps.${value}`) }}
            </Step>
         </StepList>
         <StepPanels>
            <StepPanel value="target">
               <TargetStep :wizard />
            </StepPanel>
            <StepPanel value="report">
               <ReportStep v-if="step === 'report'" :wizard />
            </StepPanel>
            <StepPanel value="result">
               <ResultStep
                  v-if="step === 'result' && transfer && report && target"
                  :transfer
                  :report
                  :target
               />
            </StepPanel>
         </StepPanels>
      </Stepper>
   </div>
</template>
