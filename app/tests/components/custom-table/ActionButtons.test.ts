import ActionButtons from '@/components/ui/custom-table/ActionButtons.vue';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';

describe('ActionButtons', () => {
   it('keeps buttons disabled and calls no row callback for a null skeleton row', () => {
      const wrapper = mount(ActionButtons, {
         props: {
            body: { data: null },
            items: [
               {
                  label: ({ data }: { data: { x: string } }) => data.x,
                  disabled: ({ data }: { data: { x: string } }) => !data.x,
                  icon: 'pi pi-pencil'
               },
               {
                  label: 'Delete',
                  disabled: ({ data }: { data: { x: string } }) => !data.x,
                  icon: 'pi pi-trash'
               }
            ] as never
         },
         global: {
            plugins: [createPinia()],
            directives: { tooltip: {} },
            stubs: {
               Button: { props: ['disabled', 'icon'], template: '<button :disabled="disabled" />' }
            }
         }
      });
      const buttons = wrapper.findAll('button');
      expect(buttons).toHaveLength(2);
      expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true);
   });
});
