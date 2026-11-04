import { email, optional, requiredText } from '@/lib/form/fields';
import i18n from '@plugins/i18n';
import { useForm } from '@/lib/form/useForm';
import { setZodLocale } from '@/lib/form/zod';
import { beforeAll, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import * as z from 'zod';

const schema = z.object({
   display_name: requiredText(),
   email: optional(email()),
   address: z.object({ city: requiredText() })
});

const initialValues = () => ({ display_name: '', email: '', address: { city: '' } });

beforeAll(() => setZodLocale('en'));

describe('useForm', () => {
   it('starts clean and without errors', () => {
      const form = useForm({ schema, initialValues: initialValues() });
      expect(form.isDirty.value).toBe(false);
      expect(form.errors.value).toEqual({});
   });

   it('validates only the field that was edited', async () => {
      const form = useForm({ schema, initialValues: initialValues() });

      form.values.value.email = 'not-an-email';
      await nextTick();

      expect(form.errors.value).toEqual({ email: i18n.t('errors.invalid_email') });
      expect(form.isDirty.value).toBe(true);

      form.values.value.email = '';
      await nextTick();
      expect(form.errors.value).toEqual({});
   });

   it('reports nested paths and the required message on submit', async () => {
      const form = useForm({ schema, initialValues: initialValues() });
      let submitted = false;

      await form.handleSubmit(() => {
         submitted = true;
      })();

      expect(submitted).toBe(false);
      expect(form.errors.value).toEqual({
         display_name: i18n.t('form.required'),
         'address.city': i18n.t('form.required')
      });
   });

   it('submits parsed output: trimmed text and null for empty optionals', async () => {
      const form = useForm({ schema, initialValues: initialValues() });
      form.values.value = { display_name: '  Jane  ', email: '', address: { city: 'Izmir' } };

      let payload: unknown;
      await form.handleSubmit((data) => {
         payload = data;
      })();

      expect(payload).toEqual({ display_name: 'Jane', email: null, address: { city: 'Izmir' } });
   });

   it('shows database errors on the affected field', async () => {
      const form = useForm({ schema, initialValues: initialValues() });
      form.values.value = {
         display_name: 'Jane',
         email: 'jane@example.com',
         address: { city: 'X' }
      };

      await form.handleSubmit(() => {
         throw { code: '23505', details: 'Key (email)=(jane@example.com) already exists.' };
      })();

      expect(form.errors.value).toEqual({ email: i18n.t('form.already_exists') });
      expect(form.isSubmitting.value).toBe(false);
   });

   it('rethrows errors it cannot place on a field', async () => {
      const form = useForm({ schema, initialValues: initialValues() });
      form.values.value = { display_name: 'Jane', email: '', address: { city: 'X' } };

      await expect(
         form.handleSubmit(() => {
            throw new Error('network down');
         })()
      ).rejects.toThrow('network down');
   });

   it('reset to new values makes them the clean state without validating', async () => {
      const form = useForm({ schema, initialValues: initialValues() });
      form.values.value.display_name = 'Draft';
      await nextTick();

      const saved = { display_name: 'Saved', email: 'bad', address: { city: 'X' } };
      form.reset(saved);
      await nextTick();

      expect(form.values.value).toEqual(saved);
      expect(form.initialValues.value).toEqual(saved);
      expect(form.isDirty.value).toBe(false);
      expect(form.errors.value).toEqual({});

      form.values.value.display_name = '';
      await nextTick();
      expect(form.errors.value).toEqual({ display_name: i18n.t('form.required') });
   });
});
