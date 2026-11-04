import '../setup/mockMain';
import FormField from '@/components/ui/form/form-field/FormField.vue';
import { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { beforeEach, describe, expect, it } from 'vitest';

const mountField = (props: Record<string, unknown>) =>
   mount(FormField, {
      props: { id: 'f', ...props },
      global: { plugins: [createPinia(), i18NPlugin, PrimeVue], directives: { tooltip: Tooltip } }
   });

describe('FormField term', () => {
   beforeEach(() => setActivePinia(createPinia()));

   it('marks the code in its label', () => {
      const label = mountField({ label: 'PI document', term: 'PI' }).get('label');

      const abbr = label.find('abbr[data-term="PI"]');
      expect(abbr.exists()).toBe(true);
      expect(abbr.attributes('role')).toBe('button');
      expect(label.text()).toBe('PI document');
      // The label names the input: nothing inside it overrides its text with another name.
      expect(label.find('[aria-label], [aria-labelledby]').exists()).toBe(false);
      expect(label.attributes('title')).toBe('PI document');
   });

   it('adds the code after a label without it', () => {
      const label = mountField({ label: 'Number', term: 'PI' }).get('label');

      expect(label.text()).toBe('Number PI');
   });

   it('keeps a plain label without a term', () => {
      const label = mountField({ label: 'Number' }).get('label');

      expect(label.find('abbr').exists()).toBe(false);
      expect(label.text()).toBe('Number');
   });
});
