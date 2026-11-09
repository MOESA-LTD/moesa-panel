import type { PlanLimits } from '@/api/access';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { LIMIT_KEYS } from '@/api/subscription';
import { useTenantKey } from '@/api/useTenantKey';
import { requiredText } from '@/lib/form/fields';
import { publicSchema, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import i18n from '@plugins/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

// The super admin's panel: plans, and the companies' subscriptions. The policies let only the
// super admin write these (013_init_subscriptions.sql).

export type PlanWithTerms = Tables['plan']['Row'] & {
   plan_module: { module_id: string }[];
   plan_limit: { limit_key: string; value: number }[];
};

export type PlanInput = {
   plan: Omit<Tables['plan']['Insert'], 'created_at'>;
   moduleIds: string[];
   limits: PlanLimits;
};

const PLAN_SELECT = '*, plan_module(module_id), plan_limit(limit_key, value)';

/** Tables whose rows a change of plans or subscriptions makes stale. */
const PLAN_TABLES = ['plan', 'plan_module', 'plan_limit', 'company_subscription'] as const;
const SUBSCRIPTION_TABLES = ['subscription', 'company_subscription'] as const;

export const planRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('plan')
         .select(PLAN_SELECT)
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as PlanWithTerms | null;
   },

   /** Saves the plan with its modules and limits in one transaction (see save_plan). */
   async save({ plan, moduleIds, limits }: PlanInput) {
      const { data: id } = await publicSchema
         .rpc('save_plan', { plan_data: plan, module_ids: moduleIds, limits })
         .throwOnError();
      return planRepository.get(id, new AbortController().signal);
   }
};

export function usePlan(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantKey.value, 'plan', toValue(id))),
      queryFn: ({ signal }) => planRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

/** A change of a plan changes what its companies may use: the super admin's own view too. */
const useAdminMutation = <Input, Result>(
   mutationFn: (input: Input) => Promise<Result>,
   tables: readonly (keyof Tables | keyof Views)[]
) => {
   const queryClient = useQueryClient();
   const authStore = useAuthStore();

   return useMutation({
      mutationFn,
      onSuccess: async () => {
         await invalidateTables(queryClient, [...tables]);
         await authStore.refreshAccess();
      }
   });
};

export const useSavePlan = () => useAdminMutation(planRepository.save, PLAN_TABLES);

const count = () => z.number().int().min(0);

export const planSchema = z.object({
   id: z.string().optional(),
   display_name: requiredText(),
   description: z.string().nullish(),
   price: z.number().min(0).nullable(),
   currency: z.string().length(3).nullable(),
   billing_period: z.enum(['month', 'year']).nullable(),
   trial_days: count(),
   is_default: z.boolean(),
   is_active: z.boolean(),
   position: z.number().int(),
   modules: z.array(z.string()),
   // null: unlimited
   max_branches: count().nullable(),
   max_users: count().nullable()
});

export type PlanFormValues = z.input<typeof planSchema>;

export const toPlanFormValues = (plan?: Partial<PlanWithTerms> | null): PlanFormValues => {
   const limit = (key: string) =>
      plan?.plan_limit?.find(({ limit_key }) => limit_key === key)?.value ?? null;
   return {
      id: plan?.id ?? undefined,
      display_name: plan?.display_name ?? '',
      description: plan?.description ?? null,
      price: plan?.price ?? null,
      currency: plan?.currency ?? null,
      billing_period: (plan?.billing_period as 'month' | 'year' | null) ?? null,
      trial_days: plan?.trial_days ?? 0,
      is_default: plan?.is_default ?? false,
      is_active: plan?.is_active ?? true,
      position: plan?.position ?? 0,
      modules: plan?.plan_module?.map(({ module_id }) => module_id) ?? [],
      max_branches: plan?.id ? limit('max_branches') : 0,
      max_users: plan?.id ? limit('max_users') : 5
   };
};

export const toPlanPayload = ({
   modules,
   max_branches,
   max_users,
   description,
   ...plan
}: z.output<typeof planSchema>): PlanInput => ({
   plan: { ...plan, description: description || null },
   moduleIds: modules,
   limits: Object.fromEntries(
      LIMIT_KEYS.map((key) => [key, { max_branches, max_users }[key]])
   ) as PlanLimits
});

// Subscriptions

/** A company with the subscription in force, its plan and usage (company_subscription). */
export function useCompanySubscription(companyId: MaybeRefOrGetter<string>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.detail(tenantKey.value, 'company_subscription', toValue(companyId))
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('company_subscription')
            .select('*')
            .eq('id', toValue(companyId))
            .abortSignal(signal)
            .maybeSingle()
            .throwOnError();
         return data;
      }
   });
}

export type SubscriptionRow = Tables['subscription']['Row'] & {
   status: string;
   plan: { display_name: string } | null;
};

/** A company's subscriptions, the latest first: the one in force is the latest that started. */
export function useSubscriptionHistory(companyId: MaybeRefOrGetter<string>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'subscription', { tenant_id: toValue(companyId) })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('subscription')
            .select('*, status, plan(display_name)')
            .eq('tenant_id', toValue(companyId))
            .order('starts_at', { ascending: false })
            .order('created_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data as unknown as SubscriptionRow[];
      }
   });
}

export const subscriptionSchema = z
   .object({
      plan_id: z.string({ error: () => i18n.t('form.required') }).min(1),
      starts_at: z.date(),
      ends_at: z.date().nullable(),
      is_trial: z.boolean(),
      note: z.string().nullish()
   })
   .refine(({ starts_at, ends_at }) => !ends_at || ends_at > starts_at, {
      path: ['ends_at'],
      error: () => i18n.t('admin.subscription.ends_after_start')
   });

export type SubscriptionFormValues = z.input<typeof subscriptionSchema>;

/** Starts a subscription of a company (kept with its history; it is in force once started). */
export const useAssignSubscription = (companyId: MaybeRefOrGetter<string>) =>
   useAdminMutation(async (values: z.output<typeof subscriptionSchema>) => {
      await supabase
         .from('subscription')
         .insert({
            tenant_id: toValue(companyId),
            plan_id: values.plan_id,
            starts_at: values.starts_at.toISOString(),
            ends_at: values.ends_at?.toISOString() ?? null,
            is_trial: values.is_trial,
            note: values.note || null
         })
         .throwOnError();
   }, SUBSCRIPTION_TABLES);

/** Changes when a subscription ends (extending it), or cancels it from now on. */
export const useUpdateSubscription = () =>
   useAdminMutation(
      async ({
         id,
         ...changes
      }: { id: string } & Pick<Tables['subscription']['Update'], 'ends_at' | 'canceled_at'>) => {
         await supabase.from('subscription').update(changes).eq('id', id).throwOnError();
      },
      SUBSCRIPTION_TABLES
   );
