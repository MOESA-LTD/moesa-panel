<script setup lang="ts">
import { useMyMemberships } from '@/api/account/memberships';

// Read-only: the companies and branches the user may use, with their roles in each.
const { t } = useI18n();
const { memberships, isPending } = useMyMemberships();
</script>

<template>
   <FormBox :legend="t('account.memberships.legend')">
      <div v-if="isPending" class="flex flex-col gap-2">
         <Skeleton v-for="n in 3" :key="n" height="2rem" />
      </div>
      <small v-else-if="!memberships.length" class="text-muted-color">
         {{ t('account.memberships.empty') }}
      </small>
      <ul v-else class="flex flex-col gap-2 m-0 p-0 list-none">
         <li
            v-for="membership in memberships"
            :key="membership.id"
            data-membership
            class="flex flex-wrap gap-2 items-center"
            :style="{ paddingInlineStart: `${membership.depth * 1.25}rem` }"
         >
            <span class="font-medium" v-text="membership.display_name" />
            <Tag v-if="membership.owned" :value="t('account.memberships.owner')" />
            <Tag v-for="role in membership.roles" :key="role" severity="secondary" :value="role" />
            <small v-if="!membership.roles.length" class="text-muted-color">
               {{ t('account.memberships.no_roles') }}
            </small>
         </li>
      </ul>
   </FormBox>
</template>
