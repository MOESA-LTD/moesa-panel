<script setup lang="ts">
import ChangeRequestTable from '@/components/service-components/change-request-table/ChangeRequestTable.vue';

// Every change request of the customer the lists are filtered by (every customer's when none is).
// A new request is added from the menu's context menu.
</script>

<template>
   <section class="flex flex-col gap-4 p-4">
      <h2 class="m-0 text-xl font-semibold">{{ $t('ops.change_request.title') }}</h2>
      <ChangeRequestTable />
   </section>
</template>
