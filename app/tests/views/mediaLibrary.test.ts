import type { MediaLibraryFilters } from '@/api/media/library';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import MediaIndex from '@/views/pages/ops/media/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import Tooltip from 'primevue/tooltip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

// The library's queries and mutations are stand-ins; isMediaInUse and the thumb paths are real.
const api = vi.hoisted(() => ({
   rows: [] as unknown[],
   filters: [] as unknown[],
   remove: vi.fn(),
   open: vi.fn(),
   download: vi.fn(),
   confirm: vi.fn(),
   push: vi.fn(),
   query: {} as Record<string, string>
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', async () => {
   const { ability } = await import('@/plugins/casl');
   return {
      useAuthStore: () => ({
         canIn: (_tenantId: string | null, action: string, subject: string) =>
            ability.can(action, subject)
      })
   };
});
vi.mock('@/store/customerFilter', () => ({
   useCustomerFilter: () => ({ customerId: 'c-global' })
}));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: api.query }),
   useRouter: () => ({ push: api.push })
}));
vi.mock('@/composables/useConfirmDelete', () => ({ useConfirmDelete: () => api.confirm }));
vi.mock('@/api/media', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/media')>()),
   useDeleteMedia: () => ({ mutateAsync: api.remove, isPending: ref(false) })
}));
vi.mock('@/api/media/library', async (importOriginal) => {
   const { computed, toValue, watchEffect } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/media/library')>()),
      useMediaLibrary: (filters: () => unknown) => {
         watchEffect(() => api.filters.push(toValue(filters)));
         return {
            data: computed(() => ({ pages: [api.rows] })),
            hasNextPage: ref(false),
            isFetching: ref(false),
            fetchNextPage: vi.fn()
         };
      }
   };
});
vi.mock('@/api/media/signedUrls', async () => {
   const { computed, toValue } = await import('vue');
   return {
      useSignedUrl: (path: () => string | null) =>
         computed(() => (toValue(path) ? `signed:${toValue(path)}` : undefined)),
      openMediaFile: api.open,
      downloadMediaFile: api.download
   };
});

const Stub = (name: string) =>
   defineComponent({ name, props: ['customerId'], setup: () => () => h('div', { [name]: '' }) });
const SelectCustomer = defineComponent({
   props: ['modelValue'],
   setup: (props) => () => h('span', { 'data-filter': 'customer' }, props.modelValue)
});

const row = (id: string, usage: { link_count?: number; document_count?: number } = {}) => ({
   id,
   tenant_id: 't1',
   customer_id: 'c1',
   file_name: `${id}.png`,
   title: null,
   alt_text: null,
   tags: ['mop'],
   mime_type: 'image/png',
   storage_path: `t1/${id}/${id}.png`,
   thumbnail_path: `t1/${id}/thumb/thumb.webp`,
   kind: 'image',
   link_count: usage.link_count ?? 0,
   document_count: usage.document_count ?? 0
});

const mountIndex = () =>
   mount(MediaIndex, {
      global: {
         plugins: [i18NPlugin, PrimeVue, [abilitiesPlugin, ability, { useGlobalProperties: true }]],
         directives: { tooltip: Tooltip },
         stubs: { MediaDropzone: Stub('data-dropzone'), SelectCustomer }
      }
   });

const card = (wrapper: ReturnType<typeof mountIndex>, id: string) =>
   wrapper.get(`[data-media-id="${id}"]`);
const lastFilters = () => api.filters.at(-1) as MediaLibraryFilters;

describe('media library', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   beforeEach(() => {
      ability.update([{ action: 'manage', subject: 'all' }]);
      api.rows = [];
      api.filters = [];
      api.query = {};
      [api.remove, api.open, api.download, api.push, api.confirm].forEach((fn) =>
         fn.mockReset().mockResolvedValue(undefined)
      );
   });

   it('starts on the global customer and presets the linked record from the route', () => {
      api.query = { entity_type: 'product', entity_id: 'p1' };
      const wrapper = mountIndex();

      expect(wrapper.get('[data-filter="customer"]').text()).toBe('c-global');
      expect(lastFilters()).toMatchObject({
         customerId: 'c-global',
         kind: null,
         tag: null,
         linkedType: 'product',
         entityId: 'p1'
      });
   });

   it('applies a typed tag on Enter only, trimmed and lower-cased', async () => {
      const wrapper = mountIndex();
      const input = wrapper.get('input[data-filter="tag"]');

      await input.setValue('  Mop ');
      expect(lastFilters().tag).toBeNull();
      await input.trigger('keydown', { key: 'Enter' });
      expect(lastFilters().tag).toBe('mop');
   });

   it('offers every record type and "Not linked" in the linked-record filter', async () => {
      const wrapper = mountIndex();
      const select = wrapper
         .findAllComponents(Select)
         .find((found) => found.attributes('data-filter') === 'linked')!;
      const options = select.props('options') as { value: string; label: string }[];

      expect(options.at(-1)).toEqual({ value: 'none', label: 'Not linked' });
      expect(options[0]).toEqual({ value: 'customer', label: 'Customer' });

      select.vm.$emit('update:modelValue', 'none');
      await flushPromises();
      expect(lastFilters()).toMatchObject({ linkedType: 'none', entityId: null });
   });

   it('shows one card per file, opening it inline or downloading it under its name', async () => {
      api.rows = [row('a'), row('b')];
      const wrapper = mountIndex();

      expect(wrapper.findAll('[data-media-card]')).toHaveLength(2);
      expect(card(wrapper, 'a').get('img').attributes('src')).toBe('signed:t1/a/thumb/thumb.webp');
      await card(wrapper, 'a').get('[data-action="open"]').trigger('click');
      expect(api.open).toHaveBeenCalledWith('t1/a/a.png');
      await card(wrapper, 'a').get('[data-action="download"]').trigger('click');
      expect(api.download).toHaveBeenCalledWith('t1/a/a.png', 'a.png');
   });

   it('opens the edit dialog for a file', async () => {
      api.rows = [row('a')];
      await card(mountIndex(), 'a').get('[data-action="edit"]').trigger('click');
      expect(api.push).toHaveBeenCalledWith({
         name: 'ops-media-edit',
         params: { id: 'a' },
         query: { showDialog: 'center' }
      });
   });

   it('deletes an unused file once confirmed, the row with its paths', async () => {
      api.rows = [row('a')];
      api.confirm.mockResolvedValue(true);
      await card(mountIndex(), 'a').get('[data-action="delete"]').trigger('click');
      await flushPromises();

      expect(api.confirm).toHaveBeenCalledOnce();
      expect(api.remove).toHaveBeenCalledWith({
         media: expect.objectContaining({
            id: 'a',
            storage_path: 't1/a/a.png',
            thumbnail_path: 't1/a/thumb/thumb.webp'
         })
      });
   });

   it('keeps a file when the delete is not confirmed', async () => {
      api.rows = [row('a')];
      api.confirm.mockResolvedValue(false);
      await card(mountIndex(), 'a').get('[data-action="delete"]').trigger('click');
      await flushPromises();
      expect(api.remove).not.toHaveBeenCalled();
   });

   it('disables deleting a file that is linked or cited by a document', () => {
      api.rows = [row('linked', { link_count: 1 }), row('cited', { document_count: 2 })];
      const wrapper = mountIndex();

      for (const id of ['linked', 'cited'])
         expect(
            card(wrapper, id).get('[data-action="delete"]').attributes('disabled')
         ).toBeDefined();
   });

   it('offers no delete, edit or upload without the rights', () => {
      ability.update([{ action: 'select', subject: 'media' }]);
      api.rows = [row('a')];
      const wrapper = mountIndex();

      expect(card(wrapper, 'a').find('[data-action="delete"]').exists()).toBe(false);
      expect(card(wrapper, 'a').find('[data-action="edit"]').exists()).toBe(false);
      expect(wrapper.find('[data-dropzone]').exists()).toBe(false);
      // Opening and downloading only need to read the file.
      expect(card(wrapper, 'a').find('[data-action="download"]').exists()).toBe(true);
   });
});
