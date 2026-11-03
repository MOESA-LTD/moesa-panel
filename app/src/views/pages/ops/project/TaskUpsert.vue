<script setup lang="ts">
import {
   TASK_ROLES,
   TASK_STATUSES,
   WORK_PHASES,
   projectTaskResource,
   projectTaskSchema,
   toProjectTaskFormValues,
   toProjectTaskPayload,
   useMemberOptions
} from '@/api/project';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a project's checklist: a new task belongs to the route's project.
const props = defineProps<{
   id?: string | null;
   projectId?: string | null;
}>();

const members = useMemberOptions();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ project_id: props.projectId ?? undefined }),
      useRow: projectTaskResource.useOne,
      useSaveRow: projectTaskResource.useSave,
      subject: 'project_task',
      schema: projectTaskSchema,
      toFormValues: toProjectTaskFormValues,
      // Every add dialog shares one draft, so a new task takes the project from the route.
      toPayload: (data) =>
         toProjectTaskPayload(
            data.id || !props.projectId ? data : { ...data, project_id: props.projectId }
         )
   });
await ready;
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
         <FormField
            fluid
            :label="$t('ops.project.task.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.phase')"
            :error="errors.phase"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.phase"
               :values="WORK_PHASES"
               i18n-prefix="ops.project.phase"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.position')"
            :error="errors.position"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.position" :min="0" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.role')"
            :error="errors.role"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.role"
               :values="TASK_ROLES"
               i18n-prefix="ops.project.role"
               showClear
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.assignee_id')"
            :error="errors.assignee_id"
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.assignee_id"
               :options="members"
               option-value="value"
               option-label="label"
               filter
               showClear
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.due_on')"
            :error="errors.due_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.due_on || null"
               @update:model-value="values.due_on = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.project.task.fields.status')"
            :error="errors.status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="TASK_STATUSES"
               i18n-prefix="ops.project.task_status"
            />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.blocks_gate"
               inputId="project-task-blocks-gate"
               :disabled="readonly"
            />
            <label for="project-task-blocks-gate">
               {{ $t('ops.project.task.fields.blocks_gate') }}
            </label>
         </span>
      </FormBox>
   </div>
</template>
