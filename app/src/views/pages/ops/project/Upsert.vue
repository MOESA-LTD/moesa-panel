<script setup lang="ts">
import { PACKAGES } from '@/api/customer';
import {
   PROJECT_PATHS,
   PROJECT_STATUSES,
   PROJECT_TYPES,
   projectResource,
   projectSchema,
   toProjectFormValues,
   toProjectPayload,
   useMemberOptions,
   type ProjectCard
} from '@/api/project';
import { useDialogRef } from '@/composables/useDialogRef';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';

// A project's own fields: opened alone to create one, and in the card's overview to edit it. The
// customer, type, path and packages decide the gates, so they are fixed once saved.
const props = defineProps<{ id?: string | null }>();

const router = useRouter();
const dialogRef = useDialogRef();
const customerFilter = useCustomerFilter();
const members = useMemberOptions();

/** A new project opens in its card: this dialog closes and the card's opens. */
const openCard = (project: ProjectCard) => {
   const to = { name: 'ops-project-manage', params: { id: project.id } };
   if (!dialogRef) return router.replace(to);
   dialogRef.value.close();
   return router.push({ ...to, query: { showDialog: DIALOG_POSITIONS.CENTER } });
};

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ customer_id: customerFilter.customerId ?? undefined }),
      useRow: projectResource.useOne,
      useSaveRow: projectResource.useSave,
      subject: 'project',
      schema: projectSchema,
      toFormValues: toProjectFormValues,
      toPayload: toProjectPayload,
      onSaved: (project) => {
         if (!props.id) openCard(project);
      }
   });
await ready;

const DATES = ['target_delivery_on', 'target_live_on'] as const;
</script>

<template>
   <FormBox
      @submit="save"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
      :class="{ card: !id }"
   >
      <FormBox :legend="$t('ops.project.sections.general')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.project.fields.customer_id')"
            :error="errors.customer_id"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <SelectCustomer
               v-bind="slotProps"
               v-model="values.customer_id"
               :disabled="!!id"
               hide-closed
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.fields.type')"
            :error="errors.type"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.type"
               :values="PROJECT_TYPES"
               glossary="project_type"
               i18n-prefix="ops.project.type"
               :disabled="!!id"
            />
         </FormField>
         <FormField
            v-if="values.type === 'npi'"
            fluid
            :label="$t('ops.project.fields.path')"
            :error="errors.path"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.path"
               :values="PROJECT_PATHS"
               glossary="project_path"
               i18n-prefix="ops.project.path"
               :disabled="!!id"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.fields.packages')"
            :error="errors.packages"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.packages"
               :values="PACKAGES"
               glossary="package"
               multiple
               :disabled="!!id"
            />
         </FormField>
         <small v-if="!id" class="text-muted-color w-full">{{
            $t('ops.project.fixed_hint')
         }}</small>
      </FormBox>

      <FormBox :legend="$t('ops.project.sections.plan')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.project.fields.status')"
            :error="errors.status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="PROJECT_STATUSES"
               i18n-prefix="ops.project.status"
            />
         </FormField>
         <FormField
            v-for="date in DATES"
            :key="date"
            fluid
            :label="$t(`ops.project.fields.${date}`)"
            :error="errors[date]"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values[date] || null"
               @update:model-value="values[date] = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.fields.coordinator_id')"
            :error="errors.coordinator_id"
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.coordinator_id"
               :options="members"
               option-value="value"
               option-label="label"
               filter
               showClear
            />
         </FormField>
      </FormBox>

      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.project.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
