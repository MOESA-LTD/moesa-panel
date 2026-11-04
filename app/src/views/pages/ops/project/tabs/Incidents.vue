<script setup lang="ts">
import { projectResource } from '@/api/project';
import IncidentTable from '@/components/service-components/incident-table/IncidentTable.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

// The incidents linked to the project (each opens its own card). A new incident starts with the
// project and its customer filled in. The project comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: project } = projectResource.useOne(() => props.id);
</script>

<template>
   <div class="flex flex-col gap-4">
      <span v-if="project && $can('create', 'incident')" class="flex justify-end">
         <CustomLink
            :to="{
               name: 'ops-incident-manage',
               query: {
                  customer_id: project.customer_id,
                  entity_type: 'project',
                  entity_id: id,
                  showDialog: DIALOG_POSITIONS.CENTER
               }
            }"
         >
            <template #default="{ navigate }">
               <Button
                  data-test="new-incident"
                  variant="outlined"
                  :icon="PrimeIcons.PLUS"
                  :label="$t('ops.incident.new_for_project')"
                  @click="navigate"
               />
            </template>
         </CustomLink>
      </span>
      <IncidentTable :filters="{ entityType: 'project', entityId: id }" />
   </div>
</template>
