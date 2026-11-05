<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { boxById, DASHBOARD_BOXES } from '@/constants/dashboard';
import { useAuthStore } from '@/store/auth';
import { useDashboardLayout, type CanSee } from '@/store/dashboardLayout';
import { useAbility } from '@casl/vue';
import { computed, ref, watch } from 'vue';

const dialogRef = useDialogRef();
const auth = useAuthStore();
const layout = useDashboardLayout();
const ability = useAbility();

const canSee: CanSee = (id) => ability.can('read', boxById(id).permission);

// The layout is loaded when the account changes, not on every render: a reload after a failed
// storage write would drop the in-memory layout.
watch(
   () => auth.user?.id ?? null,
   (id) => layout.load(id),
   { immediate: true }
);

// The permitted set is only known once the access is loaded; until then nothing is said.
const accessLoaded = ref(false);
void auth.accessReady().then(() => {
   accessLoaded.value = true;
});

const shown = computed(() => layout.visibleBoxes(canSee).shown);
const anyPermitted = computed(() => DASHBOARD_BOXES.some((box) => canSee(box.id)));
</script>

<template>
   <div
      class="bg-[var(--surface-ground)] flex flex-col gap-4"
      :class="{
         'p-4': !!dialogRef
      }"
   >
      <template v-if="accessLoaded">
         <p v-if="!shown.length" class="text-muted-color">
            {{ $t(anyPermitted ? 'dashboard.layout.all_hidden' : 'dashboard.layout.no_boxes') }}
         </p>
         <div
            v-else
            class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start"
         >
            <div
               v-for="id in shown"
               :key="id"
               :data-box-id="id"
               :class="{ 'md:col-span-2': layout.sizeOf(id) === 'wide' }"
            >
               <component
                  :is="boxById(id).component"
                  :box="boxById(id)"
                  :size="layout.sizeOf(id)"
               />
            </div>
         </div>
      </template>
   </div>
</template>
