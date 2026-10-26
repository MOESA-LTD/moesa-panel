<script setup lang="ts">
import { useUser, type UserWithRoles } from '@/api/user';
import General from '@/views/pages/branch/user/upsert/tabs/General.vue';
import { TabProps } from 'primevue';
import { RouteLocationAsRelativeGeneric } from 'vue-router';

const props = defineProps<{
   id?: string | null;
   data?: Partial<UserWithRoles> | null;
}>();

const userId = computed(() => props.id ?? props.data?.id ?? null);

// Loaded here so the route's Suspense waits for it; the tab reuses the cached query.
const { suspense } = useUser(userId);
if (userId.value) await suspense();

const tabs: ComputedRef<(TabProps & { route: RouteLocationAsRelativeGeneric })[]> = computed(() => [
   {
      value: i18n.t('user.upsert.tabs.general_info'),
      asChild: true,
      route: {
         name: 'branch-manage-user-general',
         params: { id: userId.value }
      }
   }
]);

const tab = defineModel('tab', {
   default: i18n.t('user.upsert.tabs.general_info')
});

const tabValue = computed(() => tab.value || tabs.value[0].value);
</script>

<template>
   <div class="card p-0">
      <Tabs v-model:value="tabValue">
         <TabList>
            <!-- @vue-expect-error PrimeVue's TabSlots omits the scope it passes in asChild mode -->
            <Tab
               v-for="tab in tabs"
               v-bind="tab"
               :key="tab.value"
               v-slot="slotProps"
               :disabled="!$can('create', 'user') || !$can('modify', 'user')"
            >
               <CustomLink :to="tab.route">
                  <!-- @vue-expect-error see above -->
                  <button v-bind="slotProps" v-text="tab.value" />
               </CustomLink>
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel :value="$t('user.upsert.tabs.general_info')">
               <General :id="userId" :data="props.data" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
