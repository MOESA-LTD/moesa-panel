<script setup lang="ts">
import {
   GATE_CLOSES_PHASE,
   byPosition,
   type GateStatus,
   type ProjectGateRow,
   type ProjectPhase
} from '@/api/project';
import { glossaryKey } from '@/api/glossary';
import { stripTerms } from '@/constants/terms';

/**
 * A project's phases in a row: the ones it has gone through, the one it is in, the ones ahead.
 * Each gate sits after the phase it closes, marked with its status.
 */
const props = defineProps<{
   phases: ProjectPhase[];
   current: ProjectPhase;
   gates: Pick<ProjectGateRow, 'id' | 'code' | 'position' | 'status'>[];
}>();

const { t, te } = useI18n();

/** The gate's status, then what the gate is (glossary), as its hover text. */
const gateTitle = (gate: { code: string; status: GateStatus }) => {
   const status = t(`ops.project.gate_status.${gate.status}`);
   const key = glossaryKey('gate_code', gate.code);
   return te(key) ? `${status} — ${stripTerms(t(key))}` : status;
};

const GATE_ICON: Record<GateStatus, string> = {
   passed: PrimeIcons.CHECK,
   pending: PrimeIcons.CLOCK,
   rolled_back: PrimeIcons.REPLAY
};

const GATE_SEVERITY: Record<GateStatus, string> = {
   passed: 'success',
   pending: 'secondary',
   rolled_back: 'warn'
};

const PHASE_CLASS = {
   passed: 'bg-green-500/15 text-green-700 dark:text-green-300',
   current: 'bg-primary text-primary-contrast font-semibold',
   ahead: 'bg-surface-100 dark:bg-surface-800 text-muted-color'
};

const steps = computed(() => {
   const current = props.phases.indexOf(props.current);
   const gates = byPosition(props.gates);
   return props.phases.map((phase, index) => ({
      phase,
      state: (index < current ? 'passed' : index === current ? 'current' : 'ahead') as
         | 'passed'
         | 'current'
         | 'ahead',
      gates: gates.filter(({ code }) => GATE_CLOSES_PHASE[code] === phase)
   }));
});
</script>

<template>
   <ol class="flex flex-wrap items-center gap-1 list-none p-0 m-0">
      <template v-for="step in steps" :key="step.phase">
         <li
            class="rounded-border px-2 py-1 text-sm"
            :class="PHASE_CLASS[step.state]"
            :aria-current="step.state === 'current' ? 'step' : undefined"
         >
            {{ $t(`ops.project.phase.${step.phase}`) }}
         </li>
         <li v-for="gate in step.gates" :key="gate.id" :data-gate="gate.code">
            <Tag
               :icon="GATE_ICON[gate.status]"
               :severity="GATE_SEVERITY[gate.status]"
               :value="$t(`ops.project.gate.${gate.code}`)"
               :title="gateTitle(gate)"
            />
         </li>
      </template>
   </ol>
</template>
