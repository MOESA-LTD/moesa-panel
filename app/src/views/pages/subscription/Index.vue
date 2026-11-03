<script setup lang="ts">
import { daysLeft, LIMIT_KEYS, LIMIT_USAGE, statusSeverity, useModules } from '@/api/subscription';
import { localeDateString } from '@/lib/dayjs';

// The subscription of the active tenant's company: its plan, modules and limits.
const authStore = useAuthStore();
const subscription = computed(() => authStore.subscription);

const { data: modules, suspense } = useModules();
await suspense();

const formatDate = (value: string | null | undefined) =>
   value ? localeDateString({ value, validate: false }) : '';

const days = computed(() => daysLeft(subscription.value));

const limits = computed(() =>
   LIMIT_KEYS.map((key) => {
      const limit = subscription.value?.limits[key] ?? null;
      const used = subscription.value?.usage[LIMIT_USAGE[key]] ?? 0;
      return {
         key,
         used,
         limit,
         // Over the limit: e.g. a plan with fewer branches than the company already has.
         over: limit !== null && used > limit,
         percent: limit === null ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100)
      };
   })
);
</script>

<template>
   <div v-if="subscription">
      <div class="card flex flex-col gap-4">
         <div class="flex flex-wrap items-center gap-3">
            <h2 class="m-0">{{ subscription.plan?.display_name ?? $t('subscription.no_plan') }}</h2>
            <Tag
               :severity="statusSeverity(subscription.status)"
               :value="$t(`subscription.status.${subscription.status}`)"
            />
         </div>
         <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 m-0">
            <dt class="text-muted-color">{{ $t('subscription.starts_at') }}</dt>
            <dd class="m-0">{{ formatDate(subscription.starts_at) || '-' }}</dd>
            <dt class="text-muted-color">{{ $t('subscription.ends_at') }}</dt>
            <dd class="m-0">
               <template v-if="subscription.ends_at">
                  {{ formatDate(subscription.ends_at) }}
                  <span v-if="subscription.writable && days !== null" class="text-muted-color">
                     ({{ $t('subscription.days_left', { days }, days) }})
                  </span>
               </template>
               <template v-else>{{ $t('subscription.no_end') }}</template>
            </dd>
         </dl>
         <Message v-if="!subscription.writable" severity="warn" icon="pi pi-lock">
            {{ $t('subscription.read_only') }}
         </Message>
         <p class="m-0 text-sm text-muted-color">{{ $t('subscription.change_hint') }}</p>
      </div>

      <div class="card flex flex-col gap-4">
         <h3 class="m-0">{{ $t('subscription.limits') }}</h3>
         <div v-for="item in limits" :key="item.key" class="flex flex-col gap-2">
            <div class="flex justify-between gap-2">
               <span>{{ $t(`subscription.limit.${item.key}`) }}</span>
               <span :class="item.over ? 'text-red-500' : 'text-muted-color'">
                  {{
                     item.limit === null
                        ? $t('subscription.unlimited_usage', { used: item.used })
                        : `${item.used} / ${item.limit}`
                  }}
               </span>
            </div>
            <ProgressBar
               v-if="item.limit !== null"
               :value="item.percent"
               :showValue="false"
               class="!h-2"
            />
         </div>
      </div>

      <div class="card flex flex-col gap-4">
         <h3 class="m-0">{{ $t('subscription.modules') }}</h3>
         <ul class="list-none p-0 m-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="module in modules" :key="module.id" class="flex items-center gap-2">
               <i
                  :class="
                     subscription.modules.includes(module.id)
                        ? 'pi pi-check-circle text-green-500'
                        : 'pi pi-lock text-muted-color'
                  "
               />
               <span>{{ $t(`fields.${module.id}`) }}</span>
               <Tag
                  v-if="module.is_core"
                  severity="secondary"
                  :value="$t('subscription.core_module')"
               />
            </li>
         </ul>
      </div>
   </div>
</template>
