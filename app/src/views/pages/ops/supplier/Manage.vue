<script setup lang="ts">
import { supplierResource } from '@/api/supplier';
import Contacts from './tabs/Contacts.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';

// The supplier card. Contacts and documents belong to a saved supplier, so their tabs open once
// the general tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();
const router = useRouter();

// A new supplier gets its id when saved, while the dialog keeps its route.
const supplierId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (supplierId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { data: supplier, suspense } = supplierResource.useOne(supplierId);
if (supplierId.value) await suspense();

const TABS = ['general', 'contacts', 'documents'] as const;
type TabKey = (typeof TABS)[number];

const fromRoute = (): TabKey =>
   TABS.find((key) => route.name === `ops-supplier-manage-${key}` || props.tab === key) ??
   'general';

const activeTab = ref<TabKey>(supplierId.value ? fromRoute() : 'general');

// A new supplier's URL takes its id, so a reload reopens it and the form's draft follows the id.
const onSaved = (id: string) => {
   const isNew = !supplierId.value;
   supplierId.value = id;
   if (isNew) router.replace({ name: 'ops-supplier-manage', params: { id }, query: route.query });
};

const title = computed(() =>
   supplier.value ? `${supplier.value.code} — ${supplier.value.display_name}` : null
);
</script>

<template>
   <div class="card p-0">
      <h2 v-if="title" class="m-4 mb-0 text-xl font-semibold" v-text="title" />
      <Tabs v-model:value="activeTab">
         <TabList>
            <Tab v-for="key in TABS" :key :value="key" :disabled="key !== 'general' && !supplierId">
               {{ $t(`ops.supplier.tabs.${key}`) }}
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="general">
               <General :id="supplierId" @saved="onSaved($event.id)" />
            </TabPanel>
            <TabPanel value="contacts">
               <Contacts v-if="supplierId && activeTab === 'contacts'" :id="supplierId" />
            </TabPanel>
            <TabPanel value="documents">
               <Documents v-if="supplierId && activeTab === 'documents'" :id="supplierId" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
