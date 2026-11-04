<script setup lang="ts">
import { useShipmentEvents, type ShipmentEventRow } from '@/api/shipment';
import { DIALOG_POSITIONS } from '@/constants/router';
import dayjs from 'dayjs';
import { injectShipmentForm } from '../useShipmentForm';

// The shipment's S15 log, newest first: which step of S15 §B happened (or another event), who told
// whom, over which channel, and a note. Entries are added and edited in a dialog.
const form = injectShipmentForm();
const shipmentId = computed(() => form.row.value?.id ?? null);

const { data: events } = useShipmentEvents(shipmentId);

const stepKey = (event: ShipmentEventRow) => `ops.shipment.steps.${event.step ?? 'other'}`;
const parties = (event: ShipmentEventRow) =>
   event.from_party || event.to_party ? `${event.from_party ?? ''} → ${event.to_party ?? ''}` : '';
const time = (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm');
</script>

<template>
   <div class="flex flex-col gap-4">
      <span class="flex items-center justify-between gap-4">
         <span class="font-semibold">{{ $t('ops.shipment.tabs.events') }}</span>
         <CustomLink
            v-if="shipmentId && $can('create', 'shipment_event')"
            :to="{
               name: 'ops-shipment-event-add',
               params: { shipmentId },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }"
         >
            <template #default="{ navigate }">
               <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
            </template>
         </CustomLink>
      </span>
      <p v-if="!events?.length" class="m-0 text-muted-color">{{ $t('ops.shipment.no_events') }}</p>
      <Timeline v-else :value="events" class="items-start">
         <template #opposite="{ item }">
            <span class="whitespace-nowrap text-sm text-muted-color">{{
               time(item.happened_at)
            }}</span>
         </template>
         <template #content="{ item }">
            <div :data-event="item.id" class="flex flex-col gap-1 pb-4">
               <span class="flex flex-wrap items-center gap-2">
                  <span class="font-semibold">
                     <template v-if="item.step">{{ item.step }}. </template>{{ $t(stepKey(item)) }}
                  </span>
                  <Tag v-if="item.channel" severity="secondary" :value="item.channel" />
                  <CustomLink
                     v-if="$can('modify', 'shipment_event')"
                     :to="{
                        name: 'ops-shipment-event-edit',
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
               <span v-if="parties(item)" class="text-sm">{{ parties(item) }}</span>
               <span v-if="item.note" class="whitespace-pre-line">{{ item.note }}</span>
            </div>
         </template>
      </Timeline>
   </div>
</template>
