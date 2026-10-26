<script setup>
import { provideRouteStatus } from '@/composables/useRouteStatus';

defineOptions({
   inheritAttrs: false
});
const props = defineProps({
   transitionProps: {
      type: Object,
      default: () => ({})
   },
   suspensible: { type: Boolean, default: false }
});

const dialogRef = inject('dialogRef', null);

const route = useRoute();

const { status, isLoading, setStatus } = provideRouteStatus();
const isPending = computed(() => status.value === 'pending');
const isFallback = computed(() => status.value === 'fallback');

const routeComponent = ref(null);

watch(
   () => route?.fullPath,
   () => setStatus('resolve')
);

const onResolve = () => setStatus('resolve');
const onFallback = () => setStatus('fallback');
const onPending = () => setStatus('pending');
</script>

<template>
   <span class="route_view__contents">
      <RouterView v-bind="$attrs" v-slot="{ Component }">
         <template v-if="Component && !dialogRef">
            <slot />
            <Transition
               enter-active-class="route_view__transition route_view__transition--enter"
               leave-active-class="route_view__transition route_view__transition--leave"
               mode="out-in"
               v-bind="props.transitionProps"
            >
               <span
                  :class="{ route_view__contents: isPending || isFallback }"
                  :key="Component?.name || Component?.type"
               >
                  <Suspense
                     :suspensible="props.suspensible"
                     @fallback="onFallback"
                     @pending="onPending"
                     @resolve="onResolve"
                  >
                     <component :is="Component" ref="routeComponent" />
                  </Suspense>
               </span>
            </Transition>
         </template>
      </RouterView>
      <RouterView
         name="skeleton"
         v-slot="{ Component }"
         :key="routeComponent?.name || routeComponent?.type"
      >
         <template v-if="isLoading">
            <component v-if="Component" :is="Component" />
            <Skeleton v-else class="route_view__skeleton" />
         </template>
      </RouterView>
   </span>
</template>

<style lang="scss">
.route_view {
   &__contents {
      @apply contents;
   }

   &__transition {
      @apply animate-duration-[calc(var(--transition-duration)*0.5)] !important;

      &--enter {
         @apply animate-fadein;
      }
      &--leave {
         @apply animate-fadeout;
      }
   }

   &__skeleton {
      @apply min-w-full min-h-[25%] duration-[calc(var(--transition-duration)*0.5)] !important;
   }
}
</style>
