import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { Form } from './Form';

type Credentials = { email: string | null; user_metadata: { display_name: string | null } };

const createForm = (autoValidate: Array<keyof Credentials> | boolean = true) =>
   Form.create<Credentials>({
      data: { email: null, user_metadata: { display_name: null } },
      rules: { email: 'required|email', 'user_metadata.display_name': 'required' },
      autoValidate,
      useDialogForm: false
   });

describe('Form auto validation', () => {
   it('validates only the field that was edited', async () => {
      const form = createForm();

      form.email = 'not-an-email';
      await nextTick();

      expect(form._errors.has('email')).toBe(true);
      expect(form._errors.has('user_metadata.display_name')).toBe(false);
      expect(form._isValid).toBe(false);

      form.email = 'jane@example.com';
      await nextTick();

      expect(form._errors.has('email')).toBe(false);
      expect(form._isValid).toBe(true);
   });

   it('revalidates a field that is cleared back to its default', async () => {
      const form = createForm();

      form.email = 'jane@example.com';
      await nextTick();
      expect(form._isValid).toBe(true);

      form.email = null;
      await nextTick();
      expect(form._isValid).toBe(false);
   });

   it('maps nested rule paths to the edited top-level field', async () => {
      const form = createForm();

      form._set('user_metadata.display_name', 'Jane');
      await nextTick();

      expect(form._isValid).toBe(true);
      expect(form._errors.has('email')).toBe(false);
   });

   it('validates the configured rules when given a list of fields', async () => {
      const form = createForm(['email']);

      form._set('user_metadata.display_name', 'Jane');
      await nextTick();

      expect(form._errors.has('email')).toBe(true);
      expect(form._errors.has('user_metadata.display_name')).toBe(false);
   });

   it('does not validate when auto validation is off', async () => {
      const form = createForm(false);

      form.email = 'not-an-email';
      await nextTick();

      expect(form._errors.has('email')).toBe(false);
   });
});

describe('Form reset', () => {
   it('clears errors on the same reactive object and resets validity', () => {
      const form = createForm(false);
      const errors = form._errors;

      expect(form._validate()).toBe(false);
      expect(errors.has('email')).toBe(true);

      form._reset();

      expect(form._errors).toBe(errors);
      expect(errors.has('email')).toBe(false);
      expect(form._isValid).toBe(false);
   });
});
