import { useFormDraft } from '@/composables/useFormDraft';
import { useFormReadonly } from '@/composables/useFormReadonly';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { useForm } from '@/lib/form/useForm';
import i18n from '@plugins/i18n';
import { ToastSeverity } from '@primevue/core/api';
import type { UseMutationReturnType, UseQueryReturnType } from '@tanstack/vue-query';
import { useToast } from 'primevue/usetoast';
import {
   computed,
   reactive,
   readonly as readonlyReactive,
   toValue,
   watch,
   type MaybeRefOrGetter
} from 'vue';
import type * as z from 'zod';

export type UseUpsertFormOptions<S extends z.ZodType, Row, Payload> = {
   /** Id of the row to edit; empty for a new row. */
   id: MaybeRefOrGetter<string | null | undefined>;
   /** Prefill for a new row. */
   prefill?: MaybeRefOrGetter<Partial<Row> | null | undefined>;
   /** Loads the row, e.g. `resource.useOne`. */
   useRow: (
      id: MaybeRefOrGetter<string | null | undefined>
   ) => UseQueryReturnType<Row | null, Error>;
   /** Saves the payload and returns the saved row (null if it cannot be read back). */
   useSaveRow: () => UseMutationReturnType<Row | null, Error, Payload, unknown>;
   /** Table checked for `modify` / `create` permission. */
   subject: keyof Tables;
   /** May depend on the form state (e.g. limits from a selected row) through a getter. */
   schema: MaybeRefOrGetter<S>;
   toFormValues: (row?: Partial<Row> | null) => z.input<S>;
   toPayload: (data: z.output<S>) => Payload;
   onSaved?: (row: Row) => void;
   /** Makes the form read-only for some rows regardless of permissions (e.g. shared records). */
   lockRow?: (row: Row) => boolean;
};

/**
 * Edit form for one row: loads it, keeps the form on fresh server data while it is clean, guards
 * unsaved changes, applies permissions, saves with a toast and resets to the saved row.
 *
 * Every composable is set up synchronously; await `ready` in the component (it keeps the route's
 * Suspense waiting for the row).
 */
export function useUpsertForm<S extends z.ZodType, Row, Payload>(
   options: UseUpsertFormOptions<S, Row, Payload>
) {
   const { data: row, suspense } = options.useRow(options.id);

   const form = useForm({
      schema: options.schema,
      initialValues: options.toFormValues(row.value ?? toValue(options.prefill))
   });

   // Follow fresh server data (e.g. saved in another view) unless the user has unsaved edits.
   watch(row, (value) => {
      if (value && !form.isDirty.value) form.reset(options.toFormValues(value));
   });

   const formValues = () => options.toFormValues(row.value ?? toValue(options.prefill));

   // Unsaved edits survive a reload; leaving without saving drops them.
   const draft = useFormDraft({
      form: `${options.subject}:${toValue(options.id) || 'new'}`,
      values: form.values,
      isDirty: form.isDirty,
      base: formValues,
      restore: form.restore,
      enabled: () => !readonly.value
   });

   useUnsavedChangesGuard(form.isDirty, { onDiscard: draft.discard });

   const cannotSubmit = useFormReadonly(
      options.subject,
      () => (form.values.value as { id?: string } | undefined)?.id
   );
   const readonly = computed(
      () => cannotSubmit.value || (!!row.value && !!options.lockRow?.(row.value))
   );

   const toast = useToast();
   const { mutateAsync: saveRow } = options.useSaveRow();

   const save = form.handleSubmit(async (data) => {
      const saved = await saveRow(options.toPayload(data));
      form.reset(options.toFormValues(saved));

      toast.add({
         life: 3000,
         severity: ToastSeverity.SUCCESS,
         summary: i18n.t('toast.success'),
         detail: i18n.t('toast.saved')
      });

      if (saved) options.onSaved?.(saved);
   });

   const ready: Promise<void> = (
      toValue(options.id)
         ? suspense().then(() => {
              if (row.value && !form.isDirty.value) form.reset(options.toFormValues(row.value));
           })
         : Promise.resolve()
   ).then(draft.apply);

   return {
      ...form,
      row,
      readonly,
      save,
      ready,
      /** Whether a draft was restored, and whether the row changed since (see FormBox). */
      draft: readonlyReactive(reactive({ restored: draft.restored, stale: draft.stale }))
   };
}
