<script setup lang="ts">
import type { IncidentDeadlineRow } from '@/api/incident';
import { DIALOG_POSITIONS } from '@/constants/router';
import dayjs from 'dayjs';
import { injectIncidentForm, useIncidentClosed } from '../useIncidentForm';

// The incident's deadlines (Y10 §4) by due time: the damage notice, the carrier claim, the free
// days... An unmet one past its time is overdue. Deadlines are added and edited in a dialog while
// the incident is open.
const form = injectIncidentForm();
const incidentId = computed(() => form.row.value?.id ?? null);
const closed = useIncidentClosed(form);

const deadlines = computed(() =>
   [...(form.row.value?.incident_deadline ?? [])].sort((a, b) => a.due_at.localeCompare(b.due_at))
);

const now = Date.now();
const isOverdue = (deadline: IncidentDeadlineRow) =>
   !deadline.met_at && new Date(deadline.due_at).getTime() < now;
const time = (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—');
</script>

<template>
   <div class="flex flex-col gap-4">
      <span class="flex items-center justify-between gap-4">
         <span class="font-semibold">{{ $t('ops.incident.tabs.deadlines') }}</span>
         <CustomLink
            v-if="incidentId && !closed && $can('create', 'incident_deadline')"
            :to="{
               name: 'ops-incident-deadline-add',
               params: { incidentId },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }"
         >
            <template #default="{ navigate }">
               <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
            </template>
         </CustomLink>
      </span>
      <p v-if="!deadlines.length" class="m-0 text-muted-color">
         {{ $t('ops.incident.deadline.no_rows') }}
      </p>
      <DataTable v-else :value="deadlines" dataKey="id" size="small">
         <Column :header="$t('ops.incident.deadline.fields.kind')">
            <template #body="{ data }">
               {{ $t(`ops.incident.deadline_kind.${data.kind}`) }}
            </template>
         </Column>
         <Column field="label" :header="$t('ops.incident.deadline.fields.label')" />
         <Column :header="$t('ops.incident.deadline.fields.due_at')">
            <template #body="{ data }">
               <span class="flex flex-wrap items-center gap-2" :data-deadline="data.id">
                  {{ time(data.due_at) }}
                  <Tag
                     v-if="isOverdue(data)"
                     severity="danger"
                     :value="$t('ops.incident.deadline.overdue')"
                  />
               </span>
            </template>
         </Column>
         <Column :header="$t('ops.incident.deadline.fields.met_at')">
            <template #body="{ data }">{{ time(data.met_at) }}</template>
         </Column>
         <Column v-if="!closed && $can('modify', 'incident_deadline')">
            <template #body="{ data }">
               <CustomLink
                  :to="{
                     name: 'ops-incident-deadline-edit',
                     params: { id: data.id },
                     query: { showDialog: DIALOG_POSITIONS.CENTER }
                  }"
               >
                  <template #default="{ navigate }">
                     <Button
                        variant="text"
                        size="small"
                        :icon="PrimeIcons.PENCIL"
                        :aria-label="$t('action.edit')"
                        @click="navigate"
                     />
                  </template>
               </CustomLink>
            </template>
         </Column>
      </DataTable>
   </div>
</template>
