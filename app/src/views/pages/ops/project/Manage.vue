<script setup lang="ts">
import { projectResource, type ProjectStatus } from '@/api/project';
import Documents from './tabs/Documents.vue';
import Overview from './tabs/Overview.vue';
import Products from './tabs/Products.vue';
import Tasks from './tabs/Tasks.vue';

// The project card: phase strip and gates, checklist, products and documents of a saved project.
const props = defineProps<{
   id: string;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { data: project, suspense } = projectResource.useOne(() => props.id);
await suspense();

const TABS = ['overview', 'tasks', 'products', 'documents'] as const;
type TabKey = (typeof TABS)[number];

const activeTab = ref<TabKey>(
   TABS.find((key) => route.name === `ops-project-manage-${key}` || props.tab === key) ?? 'overview'
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
            <Tab v-for="key in TABS" :key :value="key">
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
            <TabPanel value="documents">
               <Documents v-if="activeTab === 'documents'" :id />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
