<script setup lang="ts">
import IncidentTable from '@/components/service-components/incident-table/IncidentTable.vue';

// Every incident of the customer the lists are filtered by (every customer's when none is), the
// most severe first. A new incident is added from the menu's context menu.
</script>

<template>
   <section class="flex flex-col gap-4 p-4">
      <h2 class="m-0 text-xl font-semibold">{{ $t('ops.incident.title') }}</h2>
      <IncidentTable />
   </section>
</template>
