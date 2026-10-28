<script setup lang="ts">
import { usePlans } from '@/api/subscription';

// A page of a module outside the company's plan (the route guard sends the user here).
const props = defineProps<{ module: string }>();

const authStore = useAuthStore();
const { plans, suspense } = usePlans(() => props.module);
await suspense();
</script>

<template>
   <div class="card flex flex-col items-center text-center gap-4 py-12">
      <i class="pi pi-lock !text-5xl text-muted-color" />
      <h2 class="m-0">
         {{ $t('subscription.locked.title', { module: $t(`fields.${props.module}`) }) }}
      </h2>
      <p class="m-0 max-w-xl text-muted-color">{{ $t('subscription.locked.text') }}</p>
      <div v-if="plans.length" class="flex flex-wrap items-center justify-center gap-2">
         <span>{{ $t('subscription.locked.in_plans') }}</span>
         <Tag v-for="plan in plans" :key="plan.id" severity="info" :value="plan.display_name" />
      </div>
      <Button
         v-if="authStore.currentTenant?.owned"
         as="router-link"
         :to="{ name: 'subscription' }"
         icon="pi pi-credit-card"
         outlined
         :label="$t('subscription.locked.see_subscription')"
      />
   </div>
</template>
