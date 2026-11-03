<script setup>
import { useRouteDialogRestore } from '@/components/layout/route-dialog/useRouteDialogRestore';
import { useAuthUi } from '@/composables/useAuthUi';

useAuthUi();
useRouteDialogRestore();
</script>

<template>
   <Suspense>
      <ConfirmDialog />
   </Suspense>
   <Suspense>
      <DynamicDialog />
   </Suspense>
   <Toast position="bottom-right" />
   <Transition
      appear
      enter-active-class="animate-fadein animate-duration-[calc(var(--transition-duration)*0.5)]"
      leave-active-class="animate-fadeout animate-duration-[calc(var(--transition-duration)*0.5)]"
      mode="out-in"
   >
      <Suspense>
         <router-view />
      </Suspense>
   </Transition>
</template>

<style>
#app {
   display: flex;
   height: 100vh;
   width: 100vw;
   overflow: hidden;
}
</style>
