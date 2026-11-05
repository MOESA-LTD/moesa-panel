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

// PrimeVue's Step shows its value in the badge, so the steps are numbered 1..3 there; the wizard
// keeps its named steps.
const STEPS = ['target', 'report', 'result'] as const;
const stepNumber = computed(() => STEPS.indexOf(step.value) + 1);
</script>

<template>
   <div class="card flex flex-col gap-4">
      <h3 class="text-lg font-semibold">{{ title }}</h3>
      <Stepper :value="stepNumber" linear>
         <StepList>
            <Step v-for="(name, index) in STEPS" :key="name" :value="index + 1">
               {{ $t(`ops.transfer.steps.${name}`) }}
            </Step>
         </StepList>
         <StepPanels>
            <StepPanel :value="1">
               <TargetStep :wizard />
            </StepPanel>
            <StepPanel :value="2">
               <ReportStep v-if="step === 'report'" :wizard />
            </StepPanel>
            <StepPanel :value="3">
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
