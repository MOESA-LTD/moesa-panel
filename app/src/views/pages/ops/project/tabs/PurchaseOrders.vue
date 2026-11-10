<script setup lang="ts">
import { canInsertFields } from '@/composables/useFieldAccess';
import { projectResource } from '@/api/project';
import { DIALOG_POSITIONS } from '@/constants/router';

// The project's purchase orders (read-only here; each opens its own card). A new order starts with
// the project and its customer filled in. The project comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: project } = projectResource.useOne(() => props.id);
</script>

<template>
   <div class="flex flex-col gap-4">
      <span
         v-if="project && $can('create', 'purchase_order') && canInsertFields('purchase_order')"
         class="flex justify-end"
      >
         <CustomLink
            :to="{
               name: 'ops-purchase-order-manage',
               query: {
                  project_id: id,
                  customer_id: project.customer_id,
                  showDialog: DIALOG_POSITIONS.CENTER
               }
            }"
         >
            <template #default="{ navigate }">
               <Button
                  data-test="new-purchase-order"
                  variant="outlined"
                  :icon="PrimeIcons.PLUS"
                  :label="$t('ops.project.new_purchase_order')"
                  @click="navigate"
               />
            </template>
         </CustomLink>
      </span>
      <PurchaseOrderTable :filters="{ projectId: id }" />
   </div>
</template>
