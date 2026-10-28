<script setup lang="ts">
import {
   subscriptionSchema,
   useAssignSubscription,
   useCompanySubscription,
   useSubscriptionHistory,
   useUpdateSubscription,
   type SubscriptionRow
} from '@/api/admin';
import type { SubscriptionStatus } from '@/api/access';
import { statusSeverity, usePlans } from '@/api/subscription';
import { localeDateString } from '@/lib/dayjs';
import { useForm } from '@/lib/form/useForm';
import dayjs from 'dayjs';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

// One company's subscription: the one in force, starting another (a new plan, a renewal), extending
// or canceling it, and the history.
const props = defineProps<{ companyId: string }>();

const { t } = useI18n();
const confirm = useConfirm();

const company = useCompanySubscription(() => props.companyId);
const history = useSubscriptionHistory(() => props.companyId);
const { plans, suspense: plansReady } = usePlans();
await Promise.all([company.suspense(), history.suspense(), plansReady()]);

const current = computed(() =>
   history.data.value?.find(({ id }) => id === company.data.value?.subscription_id)
);

const formatDate = (value: string | null | undefined) =>
   value ? localeDateString({ value, validate: false }) : '-';

// Changing the one in force

const { mutateAsync: update, isPending: updating } = useUpdateSubscription();

/** Pushes the end on by `months` from the later of now and the current end. */
const extend = (months: number) => {
   const subscription = current.value;
   if (!subscription) return;
   const end = dayjs(subscription.ends_at);
   const from = subscription.ends_at && end.isAfter(dayjs()) ? end : dayjs();
   return update({ id: subscription.id, ends_at: from.add(months, 'month').toISOString() });
};

const removeEnd = () => current.value && update({ id: current.value.id, ends_at: null });

const cancel = () =>
   confirm.require({
      icon: PrimeIcons.EXCLAMATION_TRIANGLE,
      header: t('admin.subscription.cancel'),
      message: t('admin.subscription.cancel_question', {
         company: company.data.value?.display_name
      }),
      acceptProps: { label: t('action.yes'), severity: 'danger', outlined: true },
      rejectProps: { label: t('action.no'), severity: 'secondary', outlined: true },
      accept: () =>
         current.value && update({ id: current.value.id, canceled_at: new Date().toISOString() })
   });

const resume = () => current.value && update({ id: current.value.id, canceled_at: null });

// Starting another

const form = useForm({
   schema: subscriptionSchema,
   initialValues: {
      plan_id: company.data.value?.plan_id ?? '',
      starts_at: new Date(),
      ends_at: dayjs().add(1, 'year').toDate(),
      is_trial: false,
      note: null
   }
});
const { values, errors, isSubmitting } = form;
const { mutateAsync: assign } = useAssignSubscription(() => props.companyId);
const toast = useToast();
const start = form.handleSubmit(async (data) => {
   await assign(data);
   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
});

/**
 * A row's standing in the history: one that started before the one in force was replaced by it,
 * whatever its own dates say.
 */
const historyStatus = (row: SubscriptionRow) =>
   row.id !== current.value?.id && row.status !== 'scheduled' ? 'replaced' : row.status;
const historySeverity = (row: SubscriptionRow) =>
   historyStatus(row) === 'replaced'
      ? 'secondary'
      : statusSeverity(row.status as SubscriptionStatus);
</script>

<template>
   <div v-if="company.data.value" class="flex flex-col gap-4">
      <div class="card flex flex-col gap-4 !mb-0">
         <div class="flex flex-wrap items-center gap-3">
            <h2 class="m-0">{{ company.data.value.display_name }}</h2>
            <Tag
               :severity="statusSeverity(company.data.value.status as SubscriptionStatus)"
               :value="$t(`subscription.status.${company.data.value.status}`)"
            />
         </div>
         <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 m-0">
            <dt class="text-muted-color">{{ $t('admin.subscription.plan') }}</dt>
            <dd class="m-0">{{ company.data.value.plan_name ?? $t('subscription.no_plan') }}</dd>
            <dt class="text-muted-color">{{ $t('subscription.starts_at') }}</dt>
            <dd class="m-0">{{ formatDate(company.data.value.starts_at) }}</dd>
            <dt class="text-muted-color">{{ $t('subscription.ends_at') }}</dt>
            <dd class="m-0">
               {{
                  company.data.value.ends_at
                     ? formatDate(company.data.value.ends_at)
                     : $t('subscription.no_end')
               }}
            </dd>
            <dt class="text-muted-color">{{ $t('admin.subscription.usage') }}</dt>
            <dd class="m-0">
               {{ $t('subscription.limit.max_branches') }}: {{ company.data.value.branches }} ·
               {{ $t('subscription.limit.max_users') }}: {{ company.data.value.users }}
            </dd>
         </dl>
         <div v-if="current" class="flex flex-wrap gap-2">
            <Button
               size="small"
               outlined
               icon="pi pi-calendar-plus"
               :label="$t('admin.subscription.extend_month')"
               :loading="updating"
               @click="extend(1)"
            />
            <Button
               size="small"
               outlined
               icon="pi pi-calendar-plus"
               :label="$t('admin.subscription.extend_year')"
               :loading="updating"
               @click="extend(12)"
            />
            <Button
               v-if="current.ends_at"
               size="small"
               outlined
               severity="secondary"
               icon="pi pi-calendar-times"
               :label="$t('admin.subscription.remove_end')"
               :loading="updating"
               @click="removeEnd"
            />
            <Button
               v-if="!current.canceled_at"
               size="small"
               outlined
               severity="danger"
               icon="pi pi-ban"
               :label="$t('admin.subscription.cancel')"
               :loading="updating"
               @click="cancel"
            />
            <Button
               v-else
               size="small"
               outlined
               severity="success"
               icon="pi pi-replay"
               :label="$t('admin.subscription.resume')"
               :loading="updating"
               @click="resume"
            />
         </div>
      </div>

      <div class="card !mb-0">
         <h3 class="mt-0">{{ $t('admin.subscription.start') }}</h3>
         <!-- Always submittable: the defaults (the current plan for a year) are a valid start. -->
         <FormBox
            @submit="start"
            @reset="() => form.reset()"
            dirty
            :submitting="isSubmitting"
            :submitText="$t('admin.subscription.start')"
         >
            <FormField
               fluid
               :label="$t('admin.subscription.plan')"
               :error="errors.plan_id"
               v-slot="slotProps"
            >
               <Select
                  v-bind="slotProps"
                  v-model="values.plan_id"
                  :options="plans"
                  optionLabel="display_name"
                  optionValue="id"
               />
            </FormField>
            <FormField
               fluid
               :label="$t('subscription.starts_at')"
               :error="errors.starts_at"
               v-slot="slotProps"
            >
               <DatePicker v-bind="slotProps" v-model="values.starts_at" showTime hourFormat="24" />
            </FormField>
            <FormField
               fluid
               :label="$t('subscription.ends_at')"
               :error="errors.ends_at"
               v-slot="slotProps"
            >
               <DatePicker
                  v-bind="slotProps"
                  v-model="values.ends_at"
                  showTime
                  hourFormat="24"
                  showClear
                  :placeholder="$t('subscription.no_end')"
               />
            </FormField>
            <span class="flex items-center gap-2">
               <ToggleSwitch v-model="values.is_trial" inputId="subscription-trial" />
               <label for="subscription-trial">{{ $t('admin.subscription.is_trial') }}</label>
            </span>
            <FormField
               fluid
               :label="$t('admin.subscription.note')"
               :error="errors.note"
               class="!flex-auto !max-w-none w-full"
               v-slot="slotProps"
            >
               <InputText
                  v-bind="slotProps"
                  :model-value="values.note ?? ''"
                  @update:model-value="values.note = $event ?? null"
               />
            </FormField>
            <p class="m-0 text-sm text-muted-color w-full">
               {{ $t('admin.subscription.start_hint') }}
            </p>
         </FormBox>
      </div>

      <div class="card !mb-0">
         <h3 class="mt-0">{{ $t('admin.subscription.history') }}</h3>
         <DataTable :value="history.data.value ?? []" dataKey="id" size="small" scrollable>
            <Column :header="$t('admin.subscription.plan')">
               <template #body="{ data }: { data: SubscriptionRow }">
                  <span class="inline-flex items-center gap-2">
                     {{ data.plan?.display_name }}
                     <Tag
                        v-if="data.is_trial"
                        severity="info"
                        :value="$t('subscription.status.trialing')"
                     />
                  </span>
               </template>
            </Column>
            <Column :header="$t('admin.subscription.status')">
               <template #body="{ data }: { data: SubscriptionRow }">
                  <Tag
                     :severity="historySeverity(data)"
                     :value="
                        historyStatus(data) === 'replaced'
                           ? $t('admin.subscription.replaced')
                           : $t(`subscription.status.${data.status}`)
                     "
                  />
               </template>
            </Column>
            <Column :header="$t('subscription.starts_at')">
               <template #body="{ data }: { data: SubscriptionRow }">
                  {{ formatDate(data.starts_at) }}
               </template>
            </Column>
            <Column :header="$t('subscription.ends_at')">
               <template #body="{ data }: { data: SubscriptionRow }">
                  {{ data.ends_at ? formatDate(data.ends_at) : $t('subscription.no_end') }}
                  <span v-if="data.canceled_at" class="text-red-500 block text-sm">
                     {{ $t('subscription.status.canceled') }}: {{ formatDate(data.canceled_at) }}
                  </span>
               </template>
            </Column>
            <Column field="note" :header="$t('admin.subscription.note')" />
         </DataTable>
      </div>
   </div>
</template>
