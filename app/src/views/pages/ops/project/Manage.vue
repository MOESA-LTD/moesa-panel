<script setup lang="ts">
import { projectResource, type ProjectStatus } from '@/api/project';
import { useAbility } from '@casl/vue';
import Documents from './tabs/Documents.vue';
import Overview from './tabs/Overview.vue';
import Products from './tabs/Products.vue';
import PurchaseOrders from './tabs/PurchaseOrders.vue';
import Shipments from './tabs/Shipments.vue';
import Tasks from './tabs/Tasks.vue';

// The project card: phase strip and gates, checklist, products, its purchase orders and shipments
// (read-only history, shown to those who may read them) and documents of a saved project.
const props = defineProps<{
   id: string;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { data: project, suspense } = projectResource.useOne(() => props.id);
await suspense();

const TABS = [
   'overview',
   'tasks',
   'products',
   'purchase_orders',
   'shipments',
   'documents'
] as const;
type TabKey = (typeof TABS)[number];

const ability = useAbility();
const TAB_SUBJECT: Partial<Record<TabKey, string>> = {
   purchase_orders: 'purchase_order',
   shipments: 'shipment'
};
const tabs = computed(() =>
   TABS.filter((key) => !TAB_SUBJECT[key] || ability.can('read', TAB_SUBJECT[key]))
);

const activeTab = ref<TabKey>(
   tabs.value.find((key) => route.name === `ops-project-manage-${key}` || props.tab === key) ??
      'overview'
);

const STATUS_SEVERITY: Record<ProjectStatus, string> = {
   active: 'success',
   on_hold: 'warn',
   closed: 'secondary',
   cancelled: 'danger'
};
</script>

<template>
   <div class="card p-0">
      <div v-if="project" class="m-4 mb-0 flex flex-wrap items-center gap-2">
         <h2
            class="m-0 text-xl font-semibold"
            v-text="`${project.code} — ${project.display_name}`"
         />
         <Tag :value="$t(`ops.project.phase.${project.current_phase}`)" severity="info" />
         <Tag
            :value="$t(`ops.project.status.${project.status}`)"
            :severity="STATUS_SEVERITY[project.status]"
         />
      </div>
      <Tabs v-model:value="activeTab">
         <TabList>
            <Tab v-for="key in tabs" :key :value="key">
               {{ $t(`ops.project.tabs.${key}`) }}
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="overview">
               <Overview v-if="activeTab === 'overview'" :id />
            </TabPanel>
            <TabPanel value="tasks">
               <Tasks v-if="activeTab === 'tasks'" :id />
            </TabPanel>
            <TabPanel value="products">
               <Products v-if="activeTab === 'products'" :id />
            </TabPanel>
            <TabPanel v-if="tabs.includes('purchase_orders')" value="purchase_orders">
               <PurchaseOrders v-if="activeTab === 'purchase_orders'" :id />
            </TabPanel>
            <TabPanel v-if="tabs.includes('shipments')" value="shipments">
               <Shipments v-if="activeTab === 'shipments'" :id />
            </TabPanel>
            <TabPanel value="documents">
               <Documents v-if="activeTab === 'documents'" :id />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
