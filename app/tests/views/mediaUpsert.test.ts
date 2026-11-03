import en from '@/plugins/i18n/locales/en/index.json';
import MediaUpsert from '@/views/pages/ops/media/Upsert.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense } from 'vue';

// The form itself is useUpsertForm (a stand-in here); what the dialog adds is the customer lock.
const api = vi.hoisted(() => ({ usage: null as unknown, options: undefined as unknown }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/composables/useUpsertForm', () => ({
   useUpsertForm: (options: unknown) => {
      api.options = options;
      return {
         values: ref({ id: 'm1', title: '', alt_text: '', tags: [], customer_id: 'c1' }),
         errors: ref({}),
         isDirty: ref(false),
         isSubmitting: ref(false),
         readonly: ref(false),
         reset: vi.fn(),
         save: vi.fn(),
         ready: Promise.resolve(),
         draft: {},
         row: ref({
            id: 'm1',
            file_name: 'front.png',
            mime_type: 'image/png',
            storage_path: 't1/m1/front.png',
            thumbnail_path: null
         })
      };
   }
}));
vi.mock('@/api/media/library', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/media/library')>()),
   useMediaUsage: () => ({ data: ref(api.usage), suspense: () => Promise.resolve() })
}));
vi.mock('@/api/media/signedUrls', async () => {
   const { computed } = await import('vue');
   return { useSignedUrl: () => computed(() => undefined) };
});

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});
const SelectCustomer = defineComponent({
   props: ['modelValue', 'disabled'],
   setup: (props) => () =>
      h('span', { 'data-customer': '', 'data-disabled': String(!!props.disabled) })
});

const mountUpsert = async (usage: { link_count: number; document_count: number }) => {
   api.usage = usage;
   const wrapper = mount(
      defineComponent({
         render: () => h(Suspense, null, { default: () => h(MediaUpsert, { id: 'm1' }) })
      }),
      {
         global: {
            plugins: [i18NPlugin, PrimeVue],
            directives: { focustrap: {} },
            stubs: { FormBox: Slot, FormField: Slot, SelectCustomer, AutoComplete: true }
         }
      }
   );
   await flushPromises();
   return wrapper;
};

describe('media edit dialog', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('locks the customer of a file in use and says why', async () => {
      const wrapper = await mountUpsert({ link_count: 0, document_count: 1 });

      expect(wrapper.get('[data-customer]').attributes('data-disabled')).toBe('true');
      expect(wrapper.get('[data-customer-locked]').text()).toBe(
         i18n.t('errors.media_customer_locked')
      );
      expect(wrapper.get('[data-file-name]').text()).toBe('front.png');
   });

   it('lets the customer of an unused file change', async () => {
      const wrapper = await mountUpsert({ link_count: 0, document_count: 0 });

      expect(wrapper.get('[data-customer]').attributes('data-disabled')).toBe('false');
      expect(wrapper.find('[data-customer-locked]').exists()).toBe(false);
      expect(api.options).toMatchObject({ subject: 'media' });
   });
});
