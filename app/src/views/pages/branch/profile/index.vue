<script setup lang="ts">
import {
   LOGO_MAX_BYTES,
   LOGO_TYPES,
   logoUrl,
   useBranch,
   useRemoveBranchLogo,
   useSetBranchLogo
} from '@/api/branch';
import type { Tenant } from '@/api/access';
import { localeDateString } from '@/lib/dayjs';
import BranchForm from '@/views/pages/branch/branches/Upsert.vue';
import type { FileUploadSelectEvent } from 'primevue';
import { useToast } from 'primevue/usetoast';

// The active branch's profile: its logo, where it sits in the company, and its details.
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const { currentTenant, branches, subscription } = storeToRefs(authStore);

const id = computed(() => currentTenant.value?.id ?? null);
const { data: branch, suspense } = useBranch(id);
await suspense();

const canEdit = computed(() => !!id.value && authStore.canIn(id.value, 'modify', 'tenant'));

/** The branches above it, the company first, as far as the user may see them. */
const above = computed(() => {
   const path: Tenant[] = [];
   let parentId = currentTenant.value?.parent_id;
   while (parentId) {
      const parent = branches.value.find((tenant) => tenant.id === parentId);
      if (!parent) break;
      path.unshift(parent);
      parentId = parent.parent_id;
   }
   return path;
});

const subBranches = computed(
   () => branches.value.filter((tenant) => tenant.parent_id === id.value).length
);

// Logo

const logo = computed(() => logoUrl(branch.value?.logo_path));
const { mutateAsync: setLogo, isPending: uploading } = useSetBranchLogo();
const { mutateAsync: removeLogo, isPending: removing } = useRemoveBranchLogo();

const notify = (detail: string, severity: string = ToastSeverity.SUCCESS) =>
   toast.add({
      life: 3000,
      severity,
      summary: t(severity === ToastSeverity.SUCCESS ? 'toast.success' : 'toast.error'),
      detail
   });

const onLogoSelect = async ({ files }: FileUploadSelectEvent) => {
   const file = ([] as File[]).concat(files)[0];
   if (!file || !id.value) return;
   // Checked here too, so a wrong file is explained rather than refused by the bucket.
   if (!LOGO_TYPES.includes(file.type)) return notify(t('errors.logo_type'), ToastSeverity.ERROR);
   if (file.size > LOGO_MAX_BYTES) return notify(t('errors.logo_size'), ToastSeverity.ERROR);

   await setLogo({ id: id.value, file, previous: branch.value?.logo_path });
   notify(t('toast.saved'));
};

const onLogoRemove = async () => {
   if (!id.value) return;
   await removeLogo({ id: id.value, previous: branch.value?.logo_path });
   notify(t('toast.saved'));
};
</script>

<template>
   <div v-if="branch" class="flex flex-col gap-4 p-4">
      <section class="branch_profile__header">
         <div class="branch_profile__logo">
            <img v-if="logo" :src="logo" :alt="branch.display_name" />
            <i v-else :class="PrimeIcons.BUILDING" class="text-4xl text-muted-color" />
         </div>

         <div class="flex-1 min-w-0 flex flex-col gap-2">
            <h2 class="m-0 truncate">{{ branch.display_name }}</h2>
            <Breadcrumb
               v-if="above.length"
               :model="above.map(({ display_name }) => ({ label: display_name }))"
               class="!p-0 !bg-transparent"
            />
            <div class="flex flex-wrap gap-2">
               <Tag
                  v-if="!branch.parent_id"
                  severity="info"
                  :value="$t('branch_profile.company')"
               />
               <Tag
                  v-if="subscription?.plan"
                  severity="secondary"
                  :value="`${$t('branch_profile.plan')}: ${subscription.plan.display_name}`"
               />
               <Tag
                  severity="secondary"
                  :value="`${$t('branch_profile.sub_branches')}: ${subBranches}`"
               />
               <Tag
                  v-if="branch.created_at"
                  severity="secondary"
                  :value="`${$t('branch_profile.created_at')}: ${localeDateString({ value: branch.created_at, validate: false })}`"
               />
            </div>
         </div>

         <div v-if="canEdit" class="flex flex-col gap-2 items-stretch">
            <FileUpload
               mode="basic"
               customUpload
               auto
               :accept="LOGO_TYPES.join(',')"
               :chooseLabel="$t(logo ? 'branch_profile.change_logo' : 'branch_profile.upload_logo')"
               :chooseButtonProps="{ size: 'small', outlined: true, loading: uploading }"
               :disabled="uploading || removing"
               @select="onLogoSelect"
            />
            <Button
               v-if="logo"
               size="small"
               text
               severity="danger"
               :icon="PrimeIcons.TRASH"
               :label="$t('branch_profile.remove_logo')"
               :loading="removing"
               :disabled="uploading"
               @click="onLogoRemove"
            />
            <small class="text-muted-color">{{ $t('branch_profile.logo_hint') }}</small>
         </div>
      </section>

      <BranchForm :id="branch.id" plain />
   </div>
</template>

<style scoped lang="scss">
.branch_profile__header {
   display: flex;
   flex-wrap: wrap;
   align-items: center;
   gap: 1.5rem;
   padding-bottom: 1rem;
   border-bottom: 1px solid var(--p-content-border-color);
}

.branch_profile__logo {
   width: 6rem;
   height: 6rem;
   flex: none;
   display: flex;
   align-items: center;
   justify-content: center;
   border-radius: var(--p-content-border-radius);
   border: 1px solid var(--p-content-border-color);
   background: var(--p-content-hover-background);
   overflow: hidden;

   img {
      width: 100%;
      height: 100%;
      object-fit: contain;
   }
}
</style>
