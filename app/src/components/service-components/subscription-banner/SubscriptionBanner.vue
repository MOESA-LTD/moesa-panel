<script setup lang="ts">
import { daysLeft, isEndingSoon } from '@/api/subscription';

// Above every page: the company is read-only (its subscription ended), or it ends soon.
const authStore = useAuthStore();
const subscription = computed(() => (authStore.isSuperAdmin ? null : authStore.subscription));
const days = computed(() => daysLeft(subscription.value) ?? 0);
</script>

<template>
   <Message
      v-if="subscription && !subscription.writable"
      severity="warn"
      icon="pi pi-lock"
      class="mb-4"
   >
      {{
         $t('subscription.banner.read_only', {
            status: $t(`subscription.status.${subscription.status}`)
         })
      }}
   </Message>
   <Message v-else-if="isEndingSoon(subscription)" severity="info" icon="pi pi-clock" class="mb-4">
      {{
         $t(
            subscription?.status === 'trialing'
               ? 'subscription.banner.trial_ends'
               : 'subscription.banner.ends',
            { days },
            days
         )
      }}
   </Message>
</template>
