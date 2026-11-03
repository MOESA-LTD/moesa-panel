<script setup lang="ts">
import { planSchema, toPlanFormValues, toPlanPayload, usePlan, useSavePlan } from '@/api/admin';
import { LIMIT_KEYS, useModules } from '@/api/subscription';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{ id?: string | null }>();

const authStore = useAuthStore();
const { t } = useI18n();
const { data: modules, suspense } = useModules();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      useRow: usePlan,
      useSaveRow: useSavePlan,
      subject: 'plan',
      schema: planSchema,
      toFormValues: toPlanFormValues,
      toPayload: toPlanPayload,
      // Plans are the super admin's; no table permission stands for that.
      canSubmit: () => authStore.isSuperAdmin
   });
await Promise.all([ready, suspense()]);

// Core modules come with every plan, so only the others are picked.
const moduleOptions = computed(() =>
   (modules.value ?? [])
      .filter(({ is_core }) => !is_core)
      .map(({ id }) => ({ id, label: t(`fields.${id}`) }))
);
const coreModules = computed(() => (modules.value ?? []).filter(({ is_core }) => is_core));

const periods = computed(() =>
   (['month', 'year'] as const).map((value) => ({
      value,
      label: t(`admin.plan.period.${value}`)
   }))
);

/** A limit is unlimited while its value is null. */
const unlimited = (key: (typeof LIMIT_KEYS)[number]) =>
   computed({
      get: () => values.value[key] === null,
      set: (on: boolean) => (values.value[key] = on ? null : 0)
   });
const unlimitedBranches = unlimited('max_branches');
const unlimitedUsers = unlimited('max_users');
const unlimitedFlags = { max_branches: unlimitedBranches, max_users: unlimitedUsers };
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField fluid :label="$t('fields.name')" :error="errors.display_name" :readonly>
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.display_name" />
            </template>
         </FormField>
         <FormField
            fluid
            :label="$t('admin.plan.description')"
            :error="errors.description"
            :readonly
            class="!flex-auto !max-w-none w-full"
            v-slot="slotProps"
         >
            <Textarea
               v-bind="slotProps"
               :model-value="values.description ?? ''"
               @update:model-value="values.description = $event"
               autoResize
               rows="2"
            />
         </FormField>

         <FormBox :legend="$t('admin.plan.pricing')" class="!flex-auto">
            <FormField fluid :label="$t('admin.plan.price')" :error="errors.price" :readonly>
               <template #default="slotProps">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="values.price"
                     :min="0"
                     :max-fraction-digits="2"
                  />
               </template>
            </FormField>
            <FormField
               fluid
               :label="$t('fields.currency')"
               :error="errors.currency"
               :readonly
               v-slot="slotProps"
            >
               <SelectCurrency v-bind="slotProps" v-model="values.currency" />
            </FormField>
            <FormField
               fluid
               :label="$t('admin.plan.billing_period')"
               :error="errors.billing_period"
               :readonly
               v-slot="slotProps"
            >
               <Select
                  v-bind="slotProps"
                  v-model="values.billing_period"
                  :options="periods"
                  optionLabel="label"
                  optionValue="value"
                  showClear
               />
            </FormField>
            <FormField
               fluid
               :label="$t('admin.plan.trial_days')"
               :error="errors.trial_days"
               :readonly
               v-slot="slotProps"
            >
               <InputNumber v-bind="slotProps" v-model="values.trial_days" :min="0" />
            </FormField>
         </FormBox>

         <FormBox :legend="$t('subscription.limits')" class="!flex-auto">
            <FormField
               v-for="key in LIMIT_KEYS"
               :key
               fluid
               :label="$t(`subscription.limit.${key}`)"
               :error="errors[key]"
               :readonly
               v-slot="slotProps"
            >
               <span class="flex items-center gap-3">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="values[key]"
                     :min="0"
                     :disabled="unlimitedFlags[key].value || readonly"
                     class="flex-1"
                  />
                  <span class="flex items-center gap-2 whitespace-nowrap">
                     <Checkbox
                        v-model="unlimitedFlags[key].value"
                        binary
                        :inputId="`${key}-unlimited`"
                        :disabled="readonly"
                     />
                     <label :for="`${key}-unlimited`">{{ $t('admin.plan.unlimited') }}</label>
                  </span>
               </span>
            </FormField>
         </FormBox>

         <FormField
            fluid
            :label="$t('subscription.modules')"
            :error="errors.modules"
            :readonly
            class="!flex-auto !max-w-none w-full"
         >
            <div class="flex flex-col gap-3">
               <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <span v-for="option in moduleOptions" :key="option.id" class="flex gap-2">
                     <Checkbox
                        v-model="values.modules"
                        :value="option.id"
                        :inputId="`module-${option.id}`"
                        :disabled="readonly"
                     />
                     <label :for="`module-${option.id}`">{{ option.label }}</label>
                  </span>
               </div>
               <p class="m-0 text-sm text-muted-color">
                  {{
                     $t('admin.plan.core_hint', {
                        modules: coreModules.map(({ id }) => $t(`fields.${id}`)).join(', ')
                     })
                  }}
               </p>
            </div>
         </FormField>

         <FormBox :legend="$t('admin.plan.offer')" class="!flex-auto">
            <span class="flex items-center gap-2">
               <ToggleSwitch
                  v-model="values.is_active"
                  inputId="plan-active"
                  :disabled="readonly"
               />
               <label for="plan-active">{{ $t('admin.plan.active_hint') }}</label>
            </span>
            <span class="flex items-center gap-2">
               <ToggleSwitch
                  v-model="values.is_default"
                  inputId="plan-default"
                  :disabled="readonly"
               />
               <label for="plan-default">{{ $t('admin.plan.default_hint') }}</label>
            </span>
            <FormField
               fluid
               :label="$t('admin.plan.position')"
               :error="errors.position"
               :readonly
               v-slot="slotProps"
            >
               <InputNumber v-bind="slotProps" v-model="values.position" />
            </FormField>
         </FormBox>
      </FormBox>
   </div>
</template>
