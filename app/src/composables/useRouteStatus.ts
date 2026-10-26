import {
   computed,
   inject,
   provide,
   readonly,
   ref,
   type ComputedRef,
   type InjectionKey,
   type Ref
} from 'vue';

export type RouteStatus = 'resolve' | 'pending' | 'fallback';

export type RouteStatusContext = {
   status: Readonly<Ref<RouteStatus>>;
   isLoading: ComputedRef<boolean>;
};

const ROUTE_STATUS_KEY: InjectionKey<RouteStatusContext> = Symbol('routeStatus');

/** Called by CustomRouteView; provides the Suspense state of the current route to its subtree. */
export function provideRouteStatus() {
   const status = ref<RouteStatus>('resolve');
   const isLoading = computed(() => status.value !== 'resolve');

   const setStatus = (value: RouteStatus) => {
      status.value = value;
   };

   provide(ROUTE_STATUS_KEY, { status: readonly(status), isLoading });

   return { status, isLoading, setStatus };
}

/** Reactive loading state of the closest CustomRouteView; false outside of one. */
export function useRouteLoading(): ComputedRef<boolean> {
   return inject(ROUTE_STATUS_KEY, null)?.isLoading ?? computed(() => false);
}
