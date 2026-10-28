<script setup>
import { logoUrl } from '@/api/branch';
import BranchPicker from '@/components/service-components/branch-picker/BranchPicker.vue';
import { useSidebar } from '@/composables/useSidebar';

const { isSignedIn, currentLogoPath, currentTenant } = storeToRefs(useAuthStore());
const logo = computed(() => (isSignedIn.value ? logoUrl(currentLogoPath.value) : null));
const appConfigurator = ref();
const sidebar = useSidebar();

const version = import.meta.env.PACKAGE_VERSION;
</script>

<template>
   <Teleport
      to="#sidebar-start"
      defer
      :disabled="!(sidebar.active.value && sidebar.mode.value === 'overlay')"
   >
      <div class="layout-topbar-logo-container">
         <Button
            type="button"
            class="layout-sidebar-button"
            rounded
            text
            aria-label="Sidebar toggle button"
            severity="secondary"
            :icon="PrimeIcons.BARS"
            @click="sidebar.toggle"
            v-if="isSignedIn"
         />
         <router-link to="/" class="layout-topbar-logo">
            <!-- The company's own logo, when it has one (see the branch profile). -->
            <img
               v-if="logo"
               :src="logo"
               :alt="currentTenant?.display_name"
               class="h-10 max-w-32 object-contain"
            />
            <span class="flex flex-col">
               <span class="font-mono text-primary text-3xl" v-text="'EchoChart'" />
               <small v-if="version" class="text-xs text-muted-color" v-text="`v${version}`" />
            </span>
         </router-link>
      </div>
   </Teleport>

   <div class="layout-topbar-actions">
      <BranchPicker v-if="isSignedIn" />
      <AccountPopover v-if="isSignedIn" class="mt-auto" />
      <Button
         :aria-label="'App configurator toggle button'"
         :icon="PrimeIcons.PALETTE"
         @click="appConfigurator?.toggle"
         type="button"
         rounded
      />
      <Popover
         class="w-min"
         :pt="{
            content: {
               class: '!p-0'
            }
         }"
         ref="appConfigurator"
      >
         <AppConfigurator />
      </Popover>
   </div>
</template>
