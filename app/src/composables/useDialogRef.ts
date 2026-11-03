import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import { inject, type Ref } from 'vue';

/** The dynamic dialog this component is rendered in (see the dialog route guard), or null. */
export const useDialogRef = () => inject<Ref<DynamicDialogInstance> | null>('dialogRef', null);
