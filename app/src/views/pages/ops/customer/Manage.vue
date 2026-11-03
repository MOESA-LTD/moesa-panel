<script setup lang="ts">
import { customerResource } from '@/api/customer';
import Brands from './tabs/Brands.vue';
import Contacts from './tabs/Contacts.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Platforms from './tabs/Platforms.vue';
import Warehouses from './tabs/Warehouses.vue';

// The customer card. Contacts, warehouses, platform accounts, brands and documents belong to a
// saved customer, so their tabs open once the general tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();

// A new customer gets its id when saved, while the dialog keeps its route.
const customerId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (customerId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { data: customer, suspense } = customerResource.useOne(customerId);
if (customerId.value) await suspense();

const TABS = ['general', 'contacts', 'warehouses', 'platforms', 'brands', 'documents'] as const;
type TabKey = (typeof TABS)[number];

const fromRoute = (): TabKey =>
   TABS.find((key) => route.name === `ops-customer-manage-${key}` || props.tab === key) ??
   'general';

const activeTab = ref<TabKey>(customerId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id unlocks the other tabs.
const onSaved = (id: string) => (customerId.value = id);

const title = computed(() =>
   customer.value ? `${customer.value.code} — ${customer.value.display_name}` : null
);
</script>

<template>
   <div class="card p-0">
      <h2 v-if="title" class="m-4 mb-0 text-xl font-semibold" v-text="title" />
      <Tabs v-model:value="activeTab">
         <TabList>
            <Tab v-for="key in TABS" :key :value="key" :disabled="key !== 'general' && !customerId">
               {{ $t(`ops.customer.tabs.${key}`) }}
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="general">
               <General :id="customerId" @saved="onSaved($event.id)" />
            </TabPanel>
            <TabPanel value="contacts">
               <Contacts v-if="customerId && activeTab === 'contacts'" :id="customerId" />
            </TabPanel>
            <TabPanel value="warehouses">
               <Warehouses v-if="customerId && activeTab === 'warehouses'" :id="customerId" />
            </TabPanel>
            <TabPanel value="platforms">
               <Platforms v-if="customerId && activeTab === 'platforms'" :id="customerId" />
            </TabPanel>
            <TabPanel value="brands">
               <Brands v-if="customerId && activeTab === 'brands'" :id="customerId" />
            </TabPanel>
            <TabPanel value="documents">
               <Documents v-if="customerId && activeTab === 'documents'" :id="customerId" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
