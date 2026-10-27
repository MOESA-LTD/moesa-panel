<script setup>
import { useMenuSection } from '@/router/menu';

const route = useRoute();
const router = useRouter();
watchEffect(() => {
   if (!route?.query?.showDialog && route.name == 'account') {
      router.replace({ name: 'account-profile' });
   }
});

const menuRoute = useMenuSection('account');
</script>
<template>
   <div class="card flex flex-col gap-4">
      <RouteMenuBar v-if="menuRoute" :route="menuRoute" />
      <CustomRouteView class="flex-1" />
   </div>
</template>
