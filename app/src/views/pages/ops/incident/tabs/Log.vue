<script setup lang="ts">
import type { IncidentLogRow } from '@/api/incident';
import { DIALOG_POSITIONS } from '@/constants/router';
import dayjs from 'dayjs';
import { injectIncidentForm, useIncidentClosed } from '../useIncidentForm';

// The incident's S17 C log, newest first: what happened or was done, with whom, the decision and
// its cost. A cost charged to the customer needs the customer's written approval (Y10 §3). Lines
// are added and edited in a dialog while the incident is open.
const form = injectIncidentForm();
const incidentId = computed(() => form.row.value?.id ?? null);
const closed = useIncidentClosed(form);

const lines = computed(() =>
   [...(form.row.value?.incident_log ?? [])].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
);

const needsApproval = (line: IncidentLogRow) =>
   line.cost_payer === 'customer' && !line.customer_approved;
const time = (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm');
</script>

<template>
   <div class="flex flex-col gap-4">
      <span class="flex items-center justify-between gap-4">
         <span class="font-semibold">{{ $t('ops.incident.tabs.log') }}</span>
         <CustomLink
            v-if="incidentId && !closed && $can('create', 'incident_log')"
            :to="{
               name: 'ops-incident-log-add',
               params: { incidentId },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }"
         >
            <template #default="{ navigate }">
               <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
            </template>
         </CustomLink>
      </span>
      <p v-if="!lines.length" class="m-0 text-muted-color">{{ $t('ops.incident.log.no_rows') }}</p>
      <Timeline v-else :value="lines" class="items-start">
         <template #opposite="{ item }">
            <span class="whitespace-nowrap text-sm text-muted-color">{{
               time(item.logged_at)
            }}</span>
         </template>
         <template #content="{ item }">
            <div :data-log="item.id" class="flex flex-col gap-1 pb-4">
               <span class="flex flex-wrap items-center gap-2">
                  <span class="whitespace-pre-line">{{ item.note }}</span>
                  <CustomLink
                     v-if="!closed && $can('modify', 'incident_log')"
                     :to="{
                        name: 'ops-incident-log-edit',
                        params: { id: item.id },
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
               </span>
               <span v-if="item.counterparty" class="text-sm">
                  {{ $t('ops.incident.log.fields.counterparty') }}: {{ item.counterparty }}
               </span>
               <span v-if="item.decision" class="text-sm">
                  {{ $t('ops.incident.log.fields.decision') }}: {{ item.decision }}
               </span>
               <span
                  v-if="item.cost_amount !== null || needsApproval(item)"
                  class="flex flex-wrap items-center gap-2"
               >
                  <span v-if="item.cost_amount !== null" class="text-sm">
                     {{ $t('ops.incident.log.fields.cost_amount') }}: {{ item.cost_amount }}
                     {{ item.cost_currency }}
                     <template v-if="item.cost_payer">
                        · {{ $t(`ops.incident.cost_payer.${item.cost_payer}`) }}
                     </template>
                  </span>
                  <Tag
                     v-if="needsApproval(item)"
                     severity="warn"
                     :value="$t('ops.incident.log.needs_customer_approval')"
                  />
               </span>
            </div>
         </template>
      </Timeline>
   </div>
</template>
