import type { PlanLimits, SubscriptionStatus, SubscriptionSummary } from '@/api/access';
import { useLookup } from '@/api/useLookup';
import dayjs from 'dayjs';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export type Module = Pick<Tables['module']['Row'], 'id' | 'is_core' | 'position'>;

export type PlanWithModules = Pick<
   Tables['plan']['Row'],
   'id' | 'display_name' | 'description' | 'is_active' | 'position'
> & { plan_module: { module_id: string }[] };

/** The limits shown with their usage, in this order. */
export const LIMIT_KEYS = ['max_branches', 'max_users'] as const satisfies (keyof PlanLimits)[];

/** What a limit counts in SubscriptionSummary.usage. */
export const LIMIT_USAGE = {
   max_branches: 'branches',
   max_users: 'users'
} as const satisfies Record<(typeof LIMIT_KEYS)[number], keyof SubscriptionSummary['usage']>;

/** A subscription ending within this many days is pointed out. */
export const ENDING_SOON_DAYS = 7;

export const statusSeverity = (status: SubscriptionStatus) =>
   ({
      active: 'success',
      trialing: 'info',
      scheduled: 'secondary',
      expired: 'danger',
      canceled: 'danger',
      none: 'warn'
   })[status];

/** Whole days until the subscription ends (0 on its last day); null without an end. */
export const daysLeft = (subscription: Pick<SubscriptionSummary, 'ends_at'> | null) =>
   subscription?.ends_at
      ? Math.max(0, Math.ceil(dayjs(subscription.ends_at).diff(dayjs(), 'day', true)))
      : null;

/** Whether the subscription is in force but ends within ENDING_SOON_DAYS. */
export const isEndingSoon = (subscription: SubscriptionSummary | null) => {
   const days = daysLeft(subscription);
   return !!subscription?.writable && days !== null && days <= ENDING_SOON_DAYS;
};

/** The app's modules, in their order. */
export const useModules = () =>
   useLookup<Module>('module', { select: 'id,is_core,position', order: 'position' });

/** The active plans with their modules, in their order (e.g. those that have a module). */
export function usePlans(moduleId?: MaybeRefOrGetter<string | null | undefined>) {
   const query = useLookup<PlanWithModules>('plan', {
      select: 'id,display_name,description,is_active,position,plan_module(module_id)',
      order: 'position'
   });

   const plans = computed(() =>
      (query.data.value ?? []).filter(
         (plan) =>
            plan.is_active &&
            (!toValue(moduleId) ||
               plan.plan_module.some(({ module_id }) => module_id === toValue(moduleId)))
      )
   );

   return { ...query, plans };
}
