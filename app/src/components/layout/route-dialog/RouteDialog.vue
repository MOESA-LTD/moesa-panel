<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { useAuthStore } from '@/store/auth';
import { useEventListener } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { ProgressSpinner } from 'primevue';
import {
   computed,
   defineAsyncComponent,
   onUnmounted,
   provide,
   ref,
   watch,
   type Component
} from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationNormalized } from 'vue-router';
import { ROUTE_DIALOG, type DialogCloseGuard } from './context';
import { forgetDialog, markOffScreen, updateDialog, type SavedRouteDialog } from './session';
import { bringToFront } from './stacking';
import { useDialogFrame, type DialogEdges } from './useDialogFrame';

/**
 * A route's page shown in a dialog over the current page (see the dialog route guard). The dialog
 * owns its header, closing (with guards), moving, resizing and stacking; PrimeVue's DynamicDialog
 * only hosts it.
 */
const props = defineProps<{
   route: RouteLocationNormalized;
   /** Identifies the dialog in the tab's session (see session.ts). */
   dialogId: string;
   /** How it was shown before a reload, when it is being reopened. */
   initialFrame?: Pick<SavedRouteDialog, 'state' | 'normalStyle'>;
}>();

const dialogRef = useDialogRef();
const { t } = useI18n();

const record = props.route.matched.at(-1)!;
const view = record.components?.default;
const page: Component | undefined =
   typeof view === 'function'
      ? defineAsyncComponent({
           loader: view as () => Promise<Component>,
           loadingComponent: (record.components?.skeleton as Component) || ProgressSpinner
        })
      : view;

// Closing

const closeGuards = new Set<DialogCloseGuard>();

async function close() {
   for (const guard of closeGuards) {
      if (!(await guard())) return;
   }
   dialogRef?.value.close();
}

provide(ROUTE_DIALOG, {
   addCloseGuard: (guard) => {
      closeGuards.add(guard);
      return () => closeGuards.delete(guard);
   },
   close
});

// Closed by losing the session (e.g. it expired), the dialog reopens after signing in again.
let keepForSignIn = false;

// The page belongs to the signed-in user and, if it needs permissions, to the current tenant.
if (props.route.meta.requiresAuth) {
   const { isSignedIn, currentTenant } = storeToRefs(useAuthStore());
   const tenantId = currentTenant.value?.id;

   watch([isSignedIn, () => currentTenant.value?.id], ([signedIn, id]) => {
      if (!signedIn) {
         keepForSignIn = true;
         dialogRef?.value.close();
      } else if (id !== tenantId && props.route.meta.requiredPermissions) {
         dialogRef?.value.close();
      }
   });
}

// A reload does not unmount the dialog, so it stays in the session and reopens.
onUnmounted(() => {
   markOffScreen(props.dialogId);
   if (!keepForSignIn) forgetDialog(props.dialogId);
});

// Frame

const root = ref<HTMLElement | null>(null);
const dialogElement = () => root.value?.closest<HTMLElement>('.p-dialog');

const { state, startDrag, startResize, toggleMaximize, toggleMinimize } = useDialogFrame(
   dialogElement,
   {
      initial: props.initialFrame,
      onChange: (snapshot) => {
         // Kept in the dialog's props so a re-render does not reset the position and size.
         if (dialogRef?.value.options.props) dialogRef.value.options.props.style = snapshot.style;
         updateDialog(props.dialogId, snapshot);
      }
   }
);

/** Double-clicking the header maximizes or restores, as in desktop windows. */
const onHeaderDblclick = (event: MouseEvent) => {
   if (!(event.target as HTMLElement).closest('button, a, input')) toggleMaximize();
};

/** Window buttons: minimize or restore, maximize or restore, close. */
const controls = computed(() => [
   // Both restores share PrimeVue's restore icon, so maximize keeps its own.
   state.value === 'minimized'
      ? {
           icon: PrimeIcons.WINDOW_MINIMIZE,
           label: t('component.dialog.restore'),
           command: toggleMinimize
        }
      : { icon: PrimeIcons.MINUS, label: t('component.dialog.minimize'), command: toggleMinimize },
   state.value === 'maximized'
      ? {
           icon: PrimeIcons.WINDOW_MINIMIZE,
           label: t('component.dialog.restore'),
           command: toggleMaximize
        }
      : {
           icon: PrimeIcons.WINDOW_MAXIMIZE,
           label: t('component.dialog.maximize'),
           command: toggleMaximize
        },
   {
      icon: PrimeIcons.TIMES,
      label: t('component.dialog.close'),
      command: close
   }
]);

const EDGES: Record<string, DialogEdges> = {
   n: { top: true },
   e: { right: true },
   s: { bottom: true },
   w: { left: true },
   ne: { top: true, right: true },
   se: { bottom: true, right: true },
   sw: { bottom: true, left: true },
   nw: { top: true, left: true }
};

// Escape closes the dialog that has focus, through the guarded path.
useEventListener(dialogElement, 'keydown', (event: KeyboardEvent) => {
   if (event.key !== 'Escape') return;
   event.stopPropagation();
   close();
});

// The dialog clicked last is shown in front of the others.
useEventListener(
   () => dialogElement()?.closest<HTMLElement>('.p-dialog-mask'),
   'pointerdown',
   (event: PointerEvent) => bringToFront(event.currentTarget as HTMLElement),
   { capture: true }
);
</script>

<template>
   <div ref="root" :class="['route_dialog', `route_dialog--${state}`]">
      <div
         class="p-dialog-header route_dialog__header"
         @pointerdown="startDrag"
         @dblclick="onHeaderDblclick"
      >
         <span class="p-dialog-title first-letter:uppercase" v-text="$t(route.meta.label ?? '')" />
         <div class="route_dialog__controls">
            <Button
               v-for="control in controls"
               :key="control.label"
               :icon="control.icon"
               severity="secondary"
               rounded
               text
               size="small"
               :aria-label="control.label"
               v-tooltip.bottom="control.label"
               @click="control.command"
            />
         </div>
      </div>
      <div v-show="state !== 'minimized'" class="p-dialog-content route_dialog__body">
         <component :is="page" v-bind="route.params" />
      </div>
      <span
         v-show="state === 'normal'"
         v-for="(edges, name) in EDGES"
         :key="name"
         :class="`route_dialog__handle route_dialog__handle--${name}`"
         aria-hidden="true"
         @pointerdown="startResize($event, edges)"
      />
   </div>
</template>

<style lang="scss">
.route_dialog {
   @apply flex flex-col h-full min-h-0;

   &__header {
      @apply cursor-move touch-none select-none;
   }

   &__controls {
      @apply flex items-center gap-1;
   }

   &__body {
      @apply flex-1 min-h-0 overflow-auto;
   }

   // Positioned against .p-dialog (see the dialog guard), outside the scrolling body.
   &__handle {
      @apply absolute z-10 touch-none;

      &--n,
      &--s {
         @apply inset-x-2 h-2 cursor-ns-resize;
      }
      &--e,
      &--w {
         @apply inset-y-2 w-2 cursor-ew-resize;
      }
      &--n {
         @apply -top-1;
      }
      &--s {
         @apply -bottom-1;
      }
      &--e {
         @apply -right-1;
      }
      &--w {
         @apply -left-1;
      }

      &--ne,
      &--se,
      &--sw,
      &--nw {
         @apply size-3;
      }
      &--ne {
         @apply -top-1 -right-1 cursor-nesw-resize;
      }
      &--sw {
         @apply -bottom-1 -left-1 cursor-nesw-resize;
      }
      &--nw {
         @apply -top-1 -left-1 cursor-nwse-resize;
      }
      &--se {
         @apply -bottom-1 -right-1 cursor-nwse-resize;
      }
   }
}

// Where a dragged dialog will snap (useDialogFrame inserts it below the dialog, in its mask).
.route_dialog__snap-preview {
   @apply fixed pointer-events-none;
   transition:
      left 120ms ease-out,
      top 120ms ease-out,
      width 120ms ease-out,
      height 120ms ease-out;

   &::after {
      @apply absolute inset-2 rounded-xl;
      content: '';
      border: 2px solid var(--p-primary-color);
      background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
      backdrop-filter: blur(2px);
   }
}

// Touch screens get the dialog at its layout size; resizing there is impractical.
@media (pointer: coarse) {
   .route_dialog__handle {
      @apply hidden;
   }
}
</style>
