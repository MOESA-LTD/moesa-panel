<script setup lang="ts">
import type { UserModel } from '@/api/user/model';

/** A user in the audit log: a link to the user when the viewer may read users, else the name. */
defineProps<{ user: UserModel | null }>();
</script>
<template>
   <div v-if="user" class="flex gap-4 items-center">
      <CustomLink
         v-if="$can('read', 'user')"
         :to="{
            name: 'branch-manage-user-general',
            params: { id: user.id },
            query: { showDialog: 'center' }
         }"
         v-slot="{ navigate }"
      >
         <Button variant="link" size="small" raised :label="user.displayName" @click="navigate" />
      </CustomLink>
      <span v-else v-text="user.displayName" />
   </div>
</template>
