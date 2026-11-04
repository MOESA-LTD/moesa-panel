<script setup lang="ts">
import type { DocumentRow } from '@/api/document';
import { glossaryKey } from '@/api/glossary';
import { useOpenIncidentOptions } from '@/api/incident';
import {
   byPosition,
   gateEvidenceEntityIds,
   usePassGate,
   useProjectOperations,
   useRollbackGate,
   type GateStatus,
   type ProjectCard,
   type ProjectGateRow
} from '@/api/project';
import { useLookup } from '@/api/useLookup';
import { DIALOG_POSITIONS } from '@/constants/router';
import { appErrorHandler } from '@/lib/appErrorHandler';
import dayjs from 'dayjs';
import { useToast } from 'primevue/usetoast';

// One gate of a project: its decision, its evidence documents, and passing or rolling it back
// (through an incident).
// The rules are the database's (see 021_projects.sql); a refused decision shows its rule as a
// toast. A passed gate is frozen: it can only be rolled back.
const props = defineProps<{ gate: ProjectGateRow; project: ProjectCard }>();

type GateDocument = Pick<DocumentRow, 'id' | 'entity_id' | 'type' | 'version' | 'file_name'>;

const { t, te } = useI18n();
const toast = useToast();

const gateLabel = computed(() => t(`ops.project.gate.${props.gate.code}`));
const gateDescription = computed(() => {
   const key = glossaryKey('gate_code', props.gate.code);
   return te(key) ? t(key) : undefined;
});

const STATUS_SEVERITY: Record<GateStatus, string> = {
   passed: 'success',
   pending: 'secondary',
   rolled_back: 'warn'
};

// Gates are passed in their order and rolled back from the last passed one.
const gates = computed(() => byPosition(props.project.project_gate));
const index = computed(() => gates.value.findIndex(({ id }) => id === props.gate.id));
const canPass = computed(
   () =>
      props.gate.status !== 'passed' &&
      (index.value < 1 || gates.value[index.value - 1].status === 'passed')
);
const canRollback = computed(
   () =>
      props.gate.status === 'passed' &&
      !gates.value.slice(index.value + 1).some(({ status }) => status === 'passed')
);

// --- pass ---

const passing = ref(false);
const pass = reactive({
   note: '',
   customerApprovedOn: null as Date | null,
   approvalDocumentId: null as string | null,
   evidenceDocumentIds: [] as string[]
});

// The documents of the gate, the project, its purchase orders and their shipments: the approval
// is one of the gate's, evidence any of them (032_gate_links.sql; G3 needs an order's approved PI).
const { purchaseOrderIds, shipmentIds } = useProjectOperations(() => props.project.id, passing);
const { data: documents } = useLookup<GateDocument>(
   'document',
   () => ({
      select: 'id, entity_id, type, version, file_name',
      order: 'version',
      in: {
         column: 'entity_id',
         values: gateEvidenceEntityIds({
            gateId: props.gate.id,
            projectId: props.project.id,
            purchaseOrderIds: purchaseOrderIds.value,
            shipmentIds: shipmentIds.value
         })
      }
   }),
   passing
);
const documentOption = (document: GateDocument) => ({
   value: document.id,
   label:
      document.file_name ||
      `${t(`ops.document.type.${document.type}`)} v${String(document.version).padStart(2, '0')}`
});
const approvalOptions = computed(() =>
   (documents.value ?? [])
      .filter(({ entity_id, type }) => entity_id === props.gate.id && type === 'gate_approval')
      .map(documentOption)
);
const evidenceOptions = computed(() => (documents.value ?? []).map(documentOption));

const { mutateAsync: passGate, isPending: isPassing } = usePassGate();

const openPass = () => {
   Object.assign(pass, {
      note: '',
      customerApprovedOn: null,
      approvalDocumentId: null,
      evidenceDocumentIds: [...props.gate.evidence_document_ids]
   });
   passing.value = true;
};

const submitPass = async () => {
   try {
      await passGate({
         gateId: props.gate.id,
         note: pass.note.trim(),
         customerApprovedOn: pass.customerApprovedOn
            ? dayjs(pass.customerApprovedOn).format('YYYY-MM-DD')
            : null,
         approvalDocumentId: pass.approvalDocumentId,
         evidenceDocumentIds: pass.evidenceDocumentIds
      });
   } catch (error) {
      // The rule the database refused it by, e.g. errors.gate_order.
      return appErrorHandler(error);
   }
   passing.value = false;
   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: gateLabel.value,
      detail: t('ops.project.gate_panel.passed')
   });
};

// --- roll back ---

// A gate is rolled back through an open incident of the project's customer (036), which then
// lists the gates it rolled back. Without one, the dialog offers to open one for the project.
const rollingBack = ref(false);
const reason = ref('');
const incidentId = ref<string | null>(null);
const { mutateAsync: rollbackGate, isPending: isRollingBack } = useRollbackGate();
const incidentOptions = useOpenIncidentOptions(() => props.project.customer_id);
const canSubmitRollback = computed(() => !!reason.value.trim() && !!incidentId.value);

const openRollback = () => {
   reason.value = '';
   incidentId.value = null;
   rollingBack.value = true;
};

const submitRollback = async () => {
   if (!canSubmitRollback.value) return;
   try {
      await rollbackGate({
         gateId: props.gate.id,
         reason: reason.value.trim(),
         incidentId: incidentId.value!
      });
   } catch (error) {
      return appErrorHandler(error);
   }
   rollingBack.value = false;
   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: gateLabel.value,
      detail: t('ops.project.gate_panel.rolled_back')
   });
};

const formatDate = (value: string | null, format = 'YYYY-MM-DD') =>
   value ? dayjs(value).format(format) : null;
</script>

<template>
   <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
         <i
            v-if="gateDescription"
            data-test="gate-glossary-info"
            class="pi pi-info-circle"
            role="img"
            v-tooltip.top="gateDescription"
            :aria-label="gateDescription"
         />
         <Tag
            :value="$t(`ops.project.gate_status.${gate.status}`)"
            :severity="STATUS_SEVERITY[gate.status]"
         />
         <Tag
            v-if="gate.needs_customer_approval"
            :value="$t('ops.project.gate_panel.needs_customer_approval')"
            severity="info"
         />
         <span class="flex-1" />
         <template v-if="$can('modify', 'project_gate')">
            <Button
               v-if="canPass"
               :icon="PrimeIcons.CHECK"
               :label="$t('ops.project.gate_panel.pass')"
               @click="openPass"
            />
            <Button
               v-if="canRollback"
               severity="warn"
               variant="outlined"
               :icon="PrimeIcons.REPLAY"
               :label="$t('ops.project.gate_panel.rollback')"
               @click="openRollback"
            />
         </template>
      </div>

      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 m-0">
         <template v-if="gate.passed_at">
            <dt class="text-muted-color">{{ $t('ops.project.gate_panel.passed_at') }}</dt>
            <dd class="m-0">{{ formatDate(gate.passed_at, 'YYYY-MM-DD HH:mm') }}</dd>
         </template>
         <template v-if="gate.customer_approved_on">
            <dt class="text-muted-color">
               {{ $t('ops.project.gate_panel.customer_approved_on') }}
            </dt>
            <dd class="m-0">{{ formatDate(gate.customer_approved_on) }}</dd>
         </template>
         <template v-if="gate.note">
            <dt class="text-muted-color">{{ $t('ops.project.gate_panel.note') }}</dt>
            <dd class="m-0 whitespace-pre-line">{{ gate.note }}</dd>
         </template>
         <template v-if="gate.status === 'rolled_back' && gate.rolled_back_reason">
            <dt class="text-muted-color">{{ $t('ops.project.gate_panel.rolled_back_reason') }}</dt>
            <dd class="m-0 whitespace-pre-line">{{ gate.rolled_back_reason }}</dd>
         </template>
      </dl>

      <EntityDocuments
         entityType="project_gate"
         :entityId="gate.id"
         :code="`${project.code}-${gateLabel}`"
         :customerId="project.customer_id"
      />

      <Dialog
         v-model:visible="passing"
         modal
         :header="`${gateLabel} — ${$t('ops.project.gate_panel.pass')}`"
         class="w-full max-w-xl"
      >
         <form class="flex flex-col gap-4" @submit.prevent="submitPass">
            <template v-if="gate.needs_customer_approval">
               <FormField
                  fluid
                  :label="$t('ops.project.gate_panel.customer_approved_on')"
                  v-slot="slotProps"
               >
                  <DatePicker
                     v-bind="slotProps"
                     v-model="pass.customerApprovedOn"
                     date-format="yy-mm-dd"
                     show-icon
                  />
               </FormField>
               <FormField
                  fluid
                  :label="$t('ops.project.gate_panel.approval_document')"
                  v-slot="slotProps"
               >
                  <Select
                     v-bind="slotProps"
                     v-model="pass.approvalDocumentId"
                     :options="approvalOptions"
                     option-value="value"
                     option-label="label"
                     showClear
                  />
               </FormField>
               <small class="text-muted-color">{{
                  $t('ops.project.gate_panel.approval_hint')
               }}</small>
            </template>
            <FormField fluid :label="$t('ops.project.gate_panel.evidence')" v-slot="slotProps">
               <MultiSelect
                  v-bind="slotProps"
                  v-model="pass.evidenceDocumentIds"
                  :options="evidenceOptions"
                  option-value="value"
                  option-label="label"
                  display="chip"
               />
            </FormField>
            <FormField fluid :label="$t('ops.project.gate_panel.note')" v-slot="slotProps">
               <Textarea v-bind="slotProps" v-model="pass.note" auto-resize rows="3" />
            </FormField>
            <span class="flex justify-end gap-2">
               <Button variant="text" :label="$t('action.cancel')" @click="passing = false" />
               <Button
                  type="submit"
                  :icon="PrimeIcons.CHECK"
                  :label="$t('ops.project.gate_panel.pass')"
                  :loading="isPassing"
               />
            </span>
         </form>
      </Dialog>

      <Dialog
         v-model:visible="rollingBack"
         modal
         :header="`${gateLabel} — ${$t('ops.project.gate_panel.rollback')}`"
         class="w-full max-w-xl"
      >
         <form
            class="flex flex-col gap-4"
            data-test="rollback-form"
            @submit.prevent="submitRollback"
         >
            <FormField fluid :label="$t('ops.project.gate_panel.incident')" v-slot="slotProps">
               <Select
                  v-bind="slotProps"
                  v-model="incidentId"
                  :options="incidentOptions"
                  option-value="value"
                  option-label="label"
                  filter
                  data-field="incident_id"
               />
            </FormField>
            <span
               v-if="!incidentOptions.length"
               class="flex flex-wrap items-center gap-2"
               data-test="no-incident"
            >
               <small class="text-muted-color">{{
                  $t('ops.project.gate_panel.no_incident')
               }}</small>
               <CustomLink
                  v-if="$can('create', 'incident')"
                  :to="{
                     name: 'ops-incident-manage',
                     query: {
                        customer_id: project.customer_id,
                        entity_type: 'project',
                        entity_id: project.id,
                        showDialog: DIALOG_POSITIONS.CENTER
                     }
                  }"
               >
                  <template #default="{ navigate }">
                     <Button
                        variant="link"
                        size="small"
                        :icon="PrimeIcons.PLUS"
                        :label="$t('ops.incident.new_for_project')"
                        @click="
                           () => {
                              rollingBack = false;
                              navigate();
                           }
                        "
                     />
                  </template>
               </CustomLink>
            </span>
            <FormField fluid :label="$t('ops.project.gate_panel.reason')" v-slot="slotProps">
               <Textarea v-bind="slotProps" v-model="reason" auto-resize rows="3" required />
            </FormField>
            <span class="flex justify-end gap-2">
               <Button variant="text" :label="$t('action.cancel')" @click="rollingBack = false" />
               <Button
                  type="submit"
                  severity="warn"
                  :icon="PrimeIcons.REPLAY"
                  :label="$t('ops.project.gate_panel.rollback')"
                  :loading="isRollingBack"
                  :disabled="!canSubmitRollback"
               />
            </span>
         </form>
      </Dialog>
   </div>
</template>
