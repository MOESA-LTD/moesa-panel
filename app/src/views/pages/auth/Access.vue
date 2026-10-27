<script setup>
import { useDialogRef } from '@/composables/useDialogRef';
const dialogRef = useDialogRef();
</script>

<template>
   <div class="min-h-full flex flex-col items-center">
      <div
         class="w-full rounded-[inherit] bg-surface-0 dark:bg-surface-900 p-20 flex flex-col items-center"
      >
         <div class="gap-8 flex flex-col items-center">
            <img
               src="/images/access/you-shall-not-pass.png"
               alt="Access denied"
               class="max-h-[28rem]"
            />
            <div class="col-span-12 text-center">
               <Button
                  v-if="dialogRef"
                  :label="$t('router.action.close')"
                  @click="dialogRef?.close"
               />
               <CustomLink v-else :to="{ name: 'account-profile' }" v-slot="{ navigate }">
                  <Button :label="$t('router.action.go_to_profile')" @click="() => navigate()" />
               </CustomLink>
            </div>
         </div>
      </div>
   </div>
</template>
