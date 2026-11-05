import '../setup/mockMain';
import TableFilterInput from '@/components/ui/custom-table/TableFilterInput.vue';
import DatePicker from '@/components/ui/form/DatePicker.vue';
import { i18NPlugin } from '@plugins/i18n';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import PrimeDatePicker from 'primevue/datepicker';
import Tooltip from 'primevue/tooltip';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';

let wrapper: VueWrapper | undefined;

const mountPicker = (model: Ref<Date | null>, props: Record<string, unknown> = {}) => {
   wrapper = mount(
      defineComponent({
         setup: () => () =>
            h(DatePicker, {
               modelValue: model.value,
               'onUpdate:modelValue': (value: Date | null) => (model.value = value),
               dateFormat: 'yy-mm-dd',
               ...props
            })
      }),
      { global: { plugins: [PrimeVue] }, attachTo: document.body }
   );
   return wrapper;
};

const inputOf = (w: VueWrapper) => w.get('input').element as HTMLInputElement;

/** Types one character at a time with the caret at the end, as a keyboard does, then leaves the field. */
async function typeInto(w: VueWrapper, text: string) {
   const input = w.get('input');
   const el = input.element as HTMLInputElement;
   await input.trigger('focus');
   for (const ch of text) {
      el.value += ch;
      await input.trigger('input');
      await nextTick();
      await nextTick();
   }
   await input.trigger('blur');
   await nextTick();
   return el.value;
}

describe('DatePicker typed input', () => {
   afterEach(() => {
      wrapper?.unmount();
      wrapper = undefined;
   });

   // Stock PrimeVue rewrites "2026-11-1" to "2026-11-01" mid-typing, so these saved day 1 (or 3).
   it.each([
      ['2026-11-15', 15],
      ['2026-11-10', 10],
      ['2026-11-30', 30]
   ])('typing %s keeps day %i', async (text, day) => {
      const model = ref<Date | null>(null);
      const shown = await typeInto(mountPicker(model), text);

      expect(model.value?.getFullYear()).toBe(2026);
      expect(model.value?.getMonth()).toBe(10);
      expect(model.value?.getDate()).toBe(day);
      expect(shown).toBe(text);
   });

   it('typing a day below 10 keeps it', async () => {
      const model = ref<Date | null>(null);
      await typeInto(mountPicker(model), '2026-11-05');

      expect(model.value?.getMonth()).toBe(10);
      expect(model.value?.getDate()).toBe(5);
   });

   it('reformats the text on blur from the parsed date', async () => {
      const model = ref<Date | null>(null);
      const shown = await typeInto(mountPicker(model), '2026-1-5');

      expect(model.value?.getMonth()).toBe(0);
      expect(model.value?.getDate()).toBe(5);
      expect(shown).toBe('2026-01-05');
   });

   it('leaves the model alone when the text does not parse', async () => {
      const model = ref<Date | null>(new Date(2026, 0, 2));
      const w = mountPicker(model);
      await typeInto(w, '15.11.2026');

      expect(model.value?.getDate()).toBe(2);
      expect(model.value?.getMonth()).toBe(0);
   });

   it('shows an outside model change while not focused', async () => {
      const model = ref<Date | null>(new Date(2026, 0, 2));
      const w = mountPicker(model);
      expect(inputOf(w).value).toBe('2026-01-02');

      model.value = new Date(2026, 2, 4);
      await nextTick();
      await nextTick();

      expect(inputOf(w).value).toBe('2026-03-04');
   });

   it('still sets the date picked from the calendar', async () => {
      const model = ref<Date | null>(new Date(2026, 10, 1));
      const w = mountPicker(model, { inline: true });

      const day = [
         ...(w.element as HTMLElement).querySelectorAll<HTMLElement>(
            '[data-pc-group-section="tablebodycelllabel"]'
         )
      ].find((el) => el.textContent?.trim() === '15' && !el.closest('[data-p-other-month="true"]'));
      expect(day).toBeDefined();
      day!.click();
      await nextTick();

      expect(model.value?.getMonth()).toBe(10);
      expect(model.value?.getDate()).toBe(15);
   });

   it('parses a typed time with showTime', async () => {
      const model = ref<Date | null>(null);
      await typeInto(mountPicker(model, { showTime: true, hourFormat: '24' }), '2026-11-15 14:30');

      expect(model.value?.getDate()).toBe(15);
      expect(model.value?.getHours()).toBe(14);
      expect(model.value?.getMinutes()).toBe(30);
   });
});

describe('DatePicker in templates', () => {
   it('resolves <DatePicker> to the app override, not the stock PrimeVue one', () => {
      const w = mount(TableFilterInput, {
         props: { filterModel: { value: null, matchMode: 'dateIs' }, dataType: 'date' },
         global: {
            plugins: [createPinia(), i18NPlugin, PrimeVue],
            directives: { tooltip: Tooltip }
         }
      });

      const pickers = w.findAllComponents(PrimeDatePicker);
      expect(pickers).toHaveLength(2);
      for (const picker of pickers) expect(picker.vm.$options.extends).toBe(PrimeDatePicker);
      w.unmount();
   });
});
