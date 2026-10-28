<script setup>
import { useSidebar } from '@/composables/useSidebar';
import { useIsFetching } from '@tanstack/vue-query';

const { mode, active } = useSidebar();
const { currentTenant, scopeTenants, isSignedIn } = storeToRefs(useAuthStore());

const isFetching = useIsFetching();

const containerClass = computed(() => {
   return {
      [`layout-${mode.value}`]: true,
      'layout-sidebar-inactive': !active.value || !isSignedIn.value
   };
});
</script>

<template>
   <div class="layout-wrapper" :class="containerClass">
      <RouterView v-slot="{ Component }" name="layout-topbar">
         <Transition
            appear
            enter-active-class="animate-fadeinup animate-fill-forwards animate-ease-out animate-duration-[var(--transition-duration)]"
            leave-active-class="animate-fadeoutup animate-fill-forwards animate-ease-in animate-duration-[var(--transition-duration)]"
            mode="out-in"
         >
            <header
               v-if="Component"
               class="layout-topbar"
               :key="currentTenant?.display_name + scopeTenants.length"
            >
               <Suspense>
                  <component :is="Component" />
               </Suspense>
            </header>
         </Transition>
      </RouterView>
      <div class="layout-main-container">
         <RouterView v-slot="{ Component }" name="layout-sidebar">
            <Transition
               appear
               enter-active-class="animate-fadeinleft animate-fill-forwards animate-ease-out animate-duration-[var(--transition-duration)]"
               leave-active-class="animate-fadeoutleft animate-fill-forwards animate-ease-in animate-duration-[var(--transition-duration)]"
               mode="out-in"
            >
               <aside
                  v-if="Component"
                  class="layout-sidebar"
                  :key="currentTenant?.display_name + scopeTenants.length"
               >
                  <span class="empty:hidden p-4" id="sidebar-start" />
                  <Suspense>
                     <component :is="Component" />
                  </Suspense>
               </aside>
            </Transition>
         </RouterView>
         <main class="layout-main">
            <RouterView v-slot="{ Component }" name="page-header">
               <div
                  v-if="Component"
                  :key="currentTenant?.display_name + scopeTenants.length"
                  class="card p-4 mb-4 flex justify-center lg:justify-between gap-2 sticky top-0 shadow-md z-10"
               >
                  <Suspense>
                     <component :is="Component" />
                  </Suspense>
                  <span class="ms-auto my-auto" id="page-toolbar" />
               </div>
            </RouterView>

            <SubscriptionBanner v-if="isSignedIn" />
            <CustomRouteView :key="currentTenant?.display_name + scopeTenants.length" />

            <RouterView v-slot="{ Component }" name="page-footer">
               <div v-if="Component" class="p-4">
                  <Suspense>
                     <component :is="Component" />
                  </Suspense>
               </div>
            </RouterView>
         </main>
      </div>
      <RouterView v-slot="{ Component }" name="layout-footer">
         <Transition
            appear
            enter-active-class="animate-fadeindown animate-fill-forwards animate-ease-out animate-duration-[var(--transition-duration)]"
            leave-active-class="animate-fadeoutdown animate-fill-forwards animate-ease-in animate-duration-[var(--transition-duration)]"
            mode="out-in"
         >
            <footer v-if="Component" class="layout-footer">
               <Suspense>
                  <component :is="Component" />
               </Suspense>
            </footer>
         </Transition>
      </RouterView>
      <ProgressBar
         mode="indeterminate"
         v-if="isFetching"
         class="!fixed bottom-0 left-0 right-0 !h-[0.25rem] z-[999]"
      />
   </div>
</template>
