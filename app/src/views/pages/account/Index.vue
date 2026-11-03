<script setup lang="ts">
import { useMenuSection } from '@/router/menu';
import AccountHeader from './AccountHeader.vue';

// My account: the header, then a tab per section (the child routes), then the open section.
// `/account` itself redirects to the first section, so there is always one open.
const route = useRoute();
const router = useRouter();

const sections = useMenuSection('account');
const items = computed(() => sections.value?.items ?? []);

/** The section the route is in (its own record, or an ancestor of a route opened inside it). */
const activeSection = computed(
   () =>
      (route.matched.find((record) => items.value.some((item) => item.name === record.name))
         ?.name as string | undefined) ?? ''
);

// The Tabs also select a clicked tab themselves; when the navigation is refused (e.g. unsaved
// changes are kept) the selection goes back to the section that is still open.
const selected = ref(activeSection.value);
watch(activeSection, (name) => (selected.value = name));

const open = async (name: (typeof items.value)[number]['name']) => {
   const failure = await router.push({ name });
   if (failure) selected.value = activeSection.value;
};
</script>

<template>
   <div class="card account_page">
      <AccountHeader />
      <Tabs v-model:value="selected" scrollable>
         <TabList>
            <Tab
               v-for="item in items"
               :key="item.key"
               :value="item.name as string"
               @click="open(item.name)"
            >
               <span class="flex items-center gap-2">
                  <i v-if="item.icon" :class="item.icon" />
                  {{ item.label }}
               </span>
            </Tab>
         </TabList>
      </Tabs>
      <CustomRouteView />
   </div>
</template>

<style lang="scss">
.account_page {
   @apply flex flex-col gap-4;
}
</style>
