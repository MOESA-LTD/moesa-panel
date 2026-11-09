import '../setup/mockMain';
import FormField from '@/components/ui/form/form-field/FormField.vue';
import { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { provideFieldAccess } from '@/composables/useFieldAccess';
import { ability, toAbilityRules } from '@/plugins/casl';

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

describe('FormField field rights', () => {
   beforeEach(() => {
      setActivePinia(createPinia());
      ability.update(
         toAbilityRules(
            [
               { command: 'select', resource_name: 'public.purchase_order' },
               { command: 'update', resource_name: 'public.purchase_order' }
            ],
            [
               {
                  resource_name: 'public.purchase_order',
                  field: 'notes',
                  can_read: false,
                  can_write: false
               },
               {
                  resource_name: 'public.purchase_order',
                  field: 'deposit_rate',
                  can_read: true,
                  can_write: false
               }
            ]
         )
      );
   });
   afterEach(() => ability.update([]));

   const mountInForm = (field: string) =>
      mount(
         defineComponent({
            setup() {
               provideFieldAccess('purchase_order');
               return () =>
                  h(
                     FormField,
                     { id: 'f', label: 'Field', field },
                     {
                        default: (slot: { tabIndex?: number }) =>
                           h('input', { tabindex: slot.tabIndex ?? 0 })
                     }
                  );
            }
         }),
         {
            global: {
               plugins: [createPinia(), i18NPlugin, PrimeVue],
               directives: { tooltip: Tooltip }
            }
         }
      );

   it('is not rendered when the user may not read the field', () => {
      expect(mountInForm('notes').find('.form_field').exists()).toBe(false);
   });

   it('is read-only when the user may read but not write the field', () => {
      const wrapper = mountInForm('deposit_rate');
      expect(wrapper.find('.form_field').exists()).toBe(true);
      expect(wrapper.find('input').attributes('tabindex')).toBe('-1');
   });

   it('is editable for a field the user may write', () => {
      const wrapper = mountInForm('currency');
      expect(wrapper.find('input').attributes('tabindex')).not.toBe('-1');
   });
});
