<script setup>
import { useDialogRef } from '@/composables/useDialogRef';
const authStore = useAuthStore();
const { isSignedIn } = storeToRefs(authStore);
const { logout } = authStore;

const dialogRef = useDialogRef();

dialogRef?.value?.options?.props?.closeButtonProps?.onClick?.();

watch(
   () => isSignedIn.value,
   async (value) => {
      if (!value) return;
      await logout();
   },
   { immediate: true, once: true }
);
</script>
<template><div v-text="$t(`auth.logout.logged_out_successfully`)" /></template>
