<script setup lang="ts">
import {
   byPosition,
   openGate,
   projectPhases,
   projectResource,
   type GateStatus
} from '@/api/project';
import Upsert from '../Upsert.vue';

// Where the project stands (phase strip), its gates in order, and its own fields. The project
// comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: project } = projectResource.useOne(() => props.id);

const gates = computed(() => byPosition(project.value?.project_gate ?? []));
const phases = computed(() =>
   project.value ? projectPhases(project.value.path, project.value.project_gate) : []
);

// The gate the project waits for is open; the others open on demand.
const openGates = ref<string[]>(openGate(gates.value) ? [openGate(gates.value)!.id] : []);

const GATE_SEVERITY: Record<GateStatus, string> = {
   passed: 'success',
   pending: 'secondary',
   rolled_back: 'warn'
};
</script>

<template>
   <div v-if="project" class="flex flex-col gap-6">
      <PhaseStrip :phases :current="project.current_phase" :gates />

      <section class="flex flex-col gap-2">
         <h3 class="m-0 text-lg font-semibold">{{ $t('ops.project.sections.gates') }}</h3>
         <Accordion v-model:value="openGates" multiple lazy>
            <AccordionPanel v-for="gate in gates" :key="gate.id" :value="gate.id">
               <AccordionHeader>
                  <span class="flex items-center gap-2">
                     <span class="font-semibold">{{ $t(`ops.project.gate.${gate.code}`) }}</span>
                     <Tag
                        :value="$t(`ops.project.gate_status.${gate.status}`)"
                        :severity="GATE_SEVERITY[gate.status]"
                     />
                  </span>
               </AccordionHeader>
               <AccordionContent>
                  <GatePanel :gate :project />
               </AccordionContent>
            </AccordionPanel>
         </Accordion>
      </section>

      <Upsert :id />
   </div>
</template>
