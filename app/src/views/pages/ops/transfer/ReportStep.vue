<script setup lang="ts">
import { provideFormTenant } from '@/api/formTenant';
import { useConfirmAction } from '@/composables/useConfirmAction';
import ConflictDecision from './ConflictDecision.vue';
import type { TransferWizard } from './useTransferWizard';

// The rehearsal's report and the decisions on its conflicts. Every lookup in here reads the target
// tenant alone (provideFormTenant): without it, row-level security returns the active tenant's
// rows, and a conflict could be linked to a row the server refuses.
const props = defineProps<{ wizard: TransferWizard }>();
const {
   target,
   targetOption,
   mode,
   decisions,
   report,
   stale,
   moveBlocked,
   canRehearse,
   canRun,
   rehearsing,
   running,
   step,
   decide,
   rehearse,
   run
} = props.wizard;

provideFormTenant(target);

const { t, te } = useI18n();
const confirmAction = useConfirmAction();

const tableLabel = (table: string) => (te(`fields.${table}`) ? t(`fields.${table}`) : table);

const counts = computed(() =>
   Object.entries(report.value?.counts ?? {}).filter(([, count]) => count > 0)
);
const total = computed(() => counts.value.reduce((sum, [, count]) => sum + count, 0));

const gapText = (gap: { rule: string; label: string | null; source_id: string }) => {
   const label = gap.label ?? gap.source_id;
   return te(`ops.transfer.report.${gap.rule}`)
      ? t(`ops.transfer.report.${gap.rule}`, { label })
      : `${label}: ${gap.rule}`;
};

const back = () => (step.value = 'target');

const onRun = () =>
   confirmAction({
      header: t('ops.transfer.run'),
      message: t(`ops.transfer.confirm.${mode.value}`, {
         count: total.value,
         target: targetOption.value?.display_name ?? ''
      }),
      acceptLabel: t('ops.transfer.run'),
      accept: async () => {
         await run();
      }
   });
</script>

<template>
   <div v-if="report && target" class="flex flex-col gap-6">
      <Message severity="info" data-path>{{
         $t(`ops.transfer.report.path_${report.path}`)
      }}</Message>

      <section class="flex flex-col gap-2">
         <h4 class="font-semibold">{{ $t('ops.transfer.report.counts') }}</h4>
         <table class="w-full max-w-md text-sm" data-counts>
            <tbody>
               <tr v-for="[table, count] in counts" :key="table" class="border-b border-surface">
                  <td class="py-1">{{ tableLabel(table) }}</td>
                  <td class="py-1 text-end tabular-nums">{{ count }}</td>
               </tr>
            </tbody>
         </table>
      </section>

      <section class="flex flex-col gap-1">
         <h4 class="font-semibold">{{ $t('ops.transfer.report.conflicts') }}</h4>
         <p v-if="!report.conflicts.length" class="text-muted-color">
            {{ $t('ops.transfer.report.no_conflicts') }}
         </p>
         <div v-else class="flex flex-col divide-y divide-surface">
            <ConflictDecision
               v-for="conflict in report.conflicts"
               :key="conflict.key"
               :conflict
               :decision="decisions[conflict.key] ?? null"
               :target
               @decide="decide(conflict.key, $event)"
            />
         </div>
         <Message v-if="report.unresolved > 0" severity="warn" size="small" data-unresolved>
            {{ $t('ops.transfer.unresolved', { count: report.unresolved }) }}
         </Message>
      </section>

      <section v-if="report.users.length" class="flex flex-col gap-1" data-users>
         <h4 class="font-semibold">{{ $t('ops.transfer.report.users') }}</h4>
         <small class="text-muted-color">{{ $t('ops.transfer.report.users_hint') }}</small>
         <ul class="list-disc ps-5">
            <li v-for="user in report.users" :key="user.user_id">
               {{ user.display_name ?? user.user_id }}
               ({{ user.columns.join(', ') }}: {{ user.rows }})
            </li>
         </ul>
      </section>

      <section v-if="report.left_behind.length" class="flex flex-col gap-1" data-left-behind>
         <h4 class="font-semibold">{{ $t('ops.transfer.report.left_behind') }}</h4>
         <ul class="list-disc ps-5">
            <li v-for="(link, index) in report.left_behind" :key="index">
               {{
                  $t('ops.transfer.report.left_behind_item', {
                     table: tableLabel(link.table),
                     label: link.label ?? link.source_id ?? '',
                     column: link.column,
                     refers_to: tableLabel(link.refers_to)
                  })
               }}
            </li>
         </ul>
         <Message v-if="moveBlocked" severity="error" size="small" data-move-blocked>
            {{ $t('ops.transfer.move_blocked') }}
         </Message>
      </section>

      <section v-if="report.settings_gaps.length" class="flex flex-col gap-1" data-gaps>
         <h4 class="font-semibold">{{ $t('ops.transfer.report.settings_gaps') }}</h4>
         <ul class="list-disc ps-5">
            <li v-for="(gap, index) in report.settings_gaps" :key="index">{{ gapText(gap) }}</li>
         </ul>
      </section>

      <p v-if="report.files" data-files>
         {{ $t('ops.transfer.report.files', { count: report.files }) }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
         <Button
            :label="$t('action.back')"
            severity="secondary"
            outlined
            :disabled="running"
            @click="back"
         />
         <Button
            v-if="stale"
            :label="$t('ops.transfer.rehearse_again')"
            :icon="PrimeIcons.REFRESH"
            outlined
            :disabled="!canRehearse"
            :loading="rehearsing"
            data-rehearse-again
            @click="rehearse"
         />
         <Button
            :label="$t('ops.transfer.run')"
            :icon="PrimeIcons.ARROW_RIGHT_ARROW_LEFT"
            :disabled="!canRun"
            :loading="running"
            data-run
            @click="onRun"
         />
      </div>
   </div>
</template>
