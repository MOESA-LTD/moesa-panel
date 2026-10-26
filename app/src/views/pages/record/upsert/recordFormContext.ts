import type { RecordFormValues } from '@/api/record';
import type { FormErrors } from '@/lib/form/useForm';
import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue';

/** State shared by the record form and its tabs (RecordForm, AssembleForm). */
export type RecordFormContext = {
   values: Ref<RecordFormValues>;
   errors: Ref<FormErrors>;
   /** How much of the selected stock this record may use. */
   availableQuantity: ComputedRef<number>;
};

const RECORD_FORM_KEY: InjectionKey<RecordFormContext> = Symbol('recordForm');

export const provideRecordForm = (context: RecordFormContext) => provide(RECORD_FORM_KEY, context);

export function useRecordForm() {
   const context = inject(RECORD_FORM_KEY);
   if (!context) throw new Error('useRecordForm() must be used inside the record upsert form.');
   return context;
}
