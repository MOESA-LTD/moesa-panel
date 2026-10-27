import { cloneDeep, isEqual, omitBy, pickBy } from 'lodash';
import {
   computed,
   nextTick,
   ref,
   shallowRef,
   toValue,
   watch,
   type MaybeRefOrGetter,
   type Ref
} from 'vue';
import type * as z from 'zod';
import { mapPostgrestError } from './postgrestErrors';

/** First message per field path, e.g. { email: '...', 'address.0.city': '...' }. */
export type FormErrors = Record<string, string>;

export type UseFormOptions<S extends z.ZodType> = {
   schema: MaybeRefOrGetter<S>;
   initialValues: z.input<S>;
};

const collectErrors = (issues: z.core.$ZodIssue[]): FormErrors =>
   issues.reduce<FormErrors>((errors, issue) => {
      const path = issue.path.join('.');
      errors[path] ??= issue.message;
      return errors;
   }, {});

const topLevel = (path: string) => path.split('.')[0];

/**
 * Form state validated by a zod schema:
 * - a field is validated as soon as it is edited, the whole form on submit;
 * - `isDirty` compares with the initial values, which `reset(values)` replaces (e.g. after saving);
 * - database errors for known fields (unique, foreign key, ...) are shown on those fields.
 */
export function useForm<S extends z.ZodType>({ schema, initialValues }: UseFormOptions<S>) {
   type Input = z.input<S>;

   const initial = shallowRef<Input>(cloneDeep(initialValues));
   const values = ref(cloneDeep(initialValues)) as Ref<Input>;
   const errors = ref<FormErrors>({});
   const isSubmitting = ref(false);
   const isDirty = computed(() => !isEqual(values.value, initial.value));

   const parse = () => toValue(schema).safeParse(values.value);

   function validate() {
      const result = parse();
      errors.value = result.success ? {} : collectErrors(result.error.issues);
      return result;
   }

   /**
    * Re-validates and replaces only the errors of the given top-level fields (e.g. one step of a
    * wizard); returns whether those fields are valid.
    */
   function validateFields(fields: string[]) {
      const result = parse();
      const next = result.success ? {} : collectErrors(result.error.issues);
      const inFields = (_: unknown, path: string) => fields.includes(topLevel(path));
      const fieldErrors = pickBy(next, inFields);
      errors.value = { ...omitBy(errors.value, inFields), ...fieldErrors };
      return Object.keys(fieldErrors).length === 0;
   }

   // A programmatic reset is not an edit and must not show errors.
   let skipNextChange = false;

   watch(
      () => cloneDeep(values.value) as Record<string, unknown>,
      (current, previous) => {
         if (skipNextChange) {
            skipNextChange = false;
            return;
         }
         const keys = Object.keys({ ...previous, ...current });
         const edited = keys.filter((key) => !isEqual(current?.[key], previous?.[key]));
         if (edited.length) validateFields(edited);
      }
   );

   /** Restores the initial values, or makes `next` the new initial values (e.g. the saved row). */
   function reset(next?: Input) {
      if (next !== undefined) initial.value = cloneDeep(next);
      if (!isEqual(values.value, initial.value)) skipNextChange = true;
      values.value = cloneDeep(initial.value);
      errors.value = {};
   }

   /** Puts back earlier edits (e.g. a saved draft) over the initial values, without validating. */
   function restore(edited: Input) {
      if (!isEqual(values.value, edited)) skipNextChange = true;
      values.value = cloneDeep(edited);
      errors.value = {};
   }

   function setErrors(fieldErrors: FormErrors) {
      errors.value = { ...errors.value, ...fieldErrors };
   }

   /**
    * Wraps a submit handler: validates first, tracks `isSubmitting`, and turns database errors on
    * known fields (or an error's own `fieldErrors`) into field errors. Other errors are rethrown to
    * the app error handler.
    */
   function handleSubmit(onValid: (data: z.output<S>) => unknown) {
      return async () => {
         // Let pending per-field validation run first so it cannot overwrite errors set below.
         await nextTick();
         const result = validate();
         if (!result.success) return;

         isSubmitting.value = true;
         try {
            await onValid(result.data);
         } catch (error) {
            // Errors may carry their own field messages (e.g. from an edge function).
            const fieldErrors =
               (error as { fieldErrors?: FormErrors } | null)?.fieldErrors ??
               mapPostgrestError(error, Object.keys(values.value ?? {}));
            if (!fieldErrors) throw error;
            setErrors(fieldErrors);
         } finally {
            isSubmitting.value = false;
         }
      };
   }

   return {
      values,
      errors,
      isDirty,
      isSubmitting,
      validate,
      validateFields,
      reset,
      restore,
      setErrors,
      handleSubmit
   };
}
