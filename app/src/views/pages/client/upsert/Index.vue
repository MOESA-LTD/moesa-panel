<script setup>
import { useClient } from '@/api/client/queries';
import ClientUpsertAddress from './tabs/Address.vue';
import ClientUpsertGeneral from './tabs/General.vue';

const props = defineProps({
   id: {
      type: String,
      default: null,
      required: false
   },
   data: {
      type: Object,
      default: null,
      required: false
   },
   tab: {
      type: String,
      default: 'general',
      required: false
   }
});

const emit = defineEmits(['update:tab']);

const clientId = computed(() => props.id ?? props.data?.id ?? null);

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { suspense } = useClient(clientId);
if (clientId.value) await suspense();

const tabValue = ref(props.tab || 'general');
const tabModel = computed({
   get: () => tabValue.value,
   set(value) {
      tabValue.value = value;
      emit('update:tab', value);
   }
});
</script>

<template>
   <div class="card p-0">
      <Tabs v-model:value="tabModel">
         <TabList>
            <Tab
               value="general"
               as-child
               v-slot="slotProps"
               :disabled="!$can('create', 'client') || !$can('modify', 'client')"
            >
               <CustomLink :to="{ name: 'client-manage-general', params: { id: clientId } }">
                  <button v-bind="slotProps" v-text="$t('client.general_info')" />
               </CustomLink>
            </Tab>
            <Tab
               value="address"
               :disabled="!clientId || !$can('modify', 'client_address')"
               as-child
               v-slot="slotProps"
            >
               <CustomLink :to="{ name: 'client-manage-address', params: { id: clientId } }">
                  <button v-bind="slotProps" v-text="$t('client.addresses')" />
               </CustomLink>
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="general">
               <ClientUpsertGeneral class="p-0" :id="clientId" :data="props.data" />
            </TabPanel>
            <TabPanel
               value="address"
               v-if="tabModel === 'address' && clientId && $can('modify', 'client_address')"
            >
               <ClientUpsertAddress class="p-0" :id="clientId" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
