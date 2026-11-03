import type { MediaRow } from '@/api/media';
import MediaDropzone from '@/components/service-components/media/MediaDropzone.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import DocumentFileLink from '@/components/service-components/entity-documents/DocumentFileLink.vue';
import DocumentFileField from '@/views/pages/ops/document/DocumentFileField.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   files: {} as Record<string, unknown>,
   open: vi.fn(),
   download: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/media', async (importOriginal) => {
   const { computed, toValue } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/media')>()),
      mediaResource: {
         useOne: (id: () => string | null) => ({
            data: computed(() => api.files[toValue(id) ?? ''])
         })
      }
   };
});
vi.mock('@/api/media/signedUrls', () => ({
   openMediaFile: api.open,
   downloadMediaFile: api.download
}));
vi.mock('@/api/formTenant', async () => {
   const { ref } = await import('vue');
   return { useFormTenant: () => ref('t-doc') };
});
// The upload and library widgets have their own tests; here only their props and events matter.
vi.mock('@/components/service-components/media/MediaDropzone.vue', async () => {
   const { defineComponent, h } = await import('vue');
   return {
      default: defineComponent({
         name: 'MediaDropzone',
         props: { customerId: null, tenantId: null, multiple: Boolean, compact: Boolean },
         emits: ['uploaded'],
         setup: () => () => h('div')
      })
   };
});
vi.mock('@/components/service-components/media/MediaPickerDialog.vue', async () => {
   const { defineComponent, h } = await import('vue');
   return {
      default: defineComponent({
         name: 'MediaPickerDialog',
         props: {
            customerId: null,
            tenantId: null,
            multiple: Boolean,
            kinds: null,
            visible: Boolean
         },
         emits: ['picked', 'update:visible'],
         setup: () => () => h('div')
      })
   };
});

const file = (id: string) =>
   ({ id, file_name: `${id}.pdf`, storage_path: `t-doc/${id}/${id}.pdf` }) as MediaRow;

const mountField = (props: {
   mediaId: string | null;
   customerId?: string | null;
   readonly?: boolean;
}) => {
   const wrapper = mount(DocumentFileField, {
      props: {
         ...props,
         'onUpdate:mediaId': (value: string | null) => wrapper.setProps({ mediaId: value })
      },
      global: { plugins: [i18NPlugin, PrimeVue] }
   });
   return wrapper;
};

describe('DocumentFileField', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      api.files = { m1: file('m1'), m2: file('m2') };
      api.open.mockReset().mockResolvedValue(undefined);
      api.download.mockReset().mockResolvedValue(undefined);
   });

   it("offers an upload and the library, both for the document's customer and tenant", () => {
      const wrapper = mountField({ mediaId: null, customerId: 'c1' });

      expect(wrapper.getComponent(MediaDropzone).props()).toMatchObject({
         customerId: 'c1',
         tenantId: 't-doc',
         multiple: false,
         compact: true
      });
      expect(wrapper.getComponent(MediaPickerDialog).props()).toMatchObject({
         customerId: 'c1',
         tenantId: 't-doc',
         multiple: false
      });
      expect(wrapper.text()).toContain(i18n.t('ops.media.pick'));
   });

   it('offers shared files only when the record has no customer', () => {
      const wrapper = mountField({ mediaId: null });
      expect(wrapper.getComponent(MediaDropzone).props('customerId')).toBeNull();
      expect(wrapper.getComponent(MediaPickerDialog).props('customerId')).toBeNull();
   });

   it('takes an uploaded or picked file', async () => {
      const wrapper = mountField({ mediaId: null, customerId: 'c1' });

      wrapper.getComponent(MediaDropzone).vm.$emit('uploaded', [file('m1')]);
      expect(wrapper.emitted('update:mediaId')).toEqual([['m1']]);

      await wrapper.setProps({ mediaId: null });
      wrapper.getComponent(MediaPickerDialog).vm.$emit('picked', [file('m2')]);
      expect(wrapper.emitted('update:mediaId')!.at(-1)).toEqual(['m2']);
   });

   it('shows the file with buttons to open and remove it', async () => {
      const wrapper = mountField({ mediaId: 'm1', customerId: 'c1' });

      expect(wrapper.text()).toContain('m1.pdf');
      expect(wrapper.findComponent(MediaDropzone).exists()).toBe(false);

      await wrapper.get('[data-action="open"]').trigger('click');
      expect(api.open).toHaveBeenCalledWith('t-doc/m1/m1.pdf');

      await wrapper.get('[data-action="remove"]').trigger('click');
      expect(wrapper.emitted('update:mediaId')).toEqual([[null]]);
      expect(wrapper.findComponent(MediaDropzone).exists()).toBe(true);
   });

   it('only shows the file when read-only', () => {
      const wrapper = mountField({ mediaId: 'm1', readonly: true });
      expect(wrapper.find('[data-action="remove"]').exists()).toBe(false);
      expect(wrapper.find('[data-action="open"]').exists()).toBe(true);

      const empty = mountField({ mediaId: null, readonly: true });
      expect(empty.findComponent(MediaDropzone).exists()).toBe(false);
      expect(empty.findComponent(MediaPickerDialog).exists()).toBe(false);
   });
});

describe('DocumentFileLink', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => api.download.mockReset().mockResolvedValue(undefined));

   const mountLink = (props: object) =>
      mount(DocumentFileLink, { props, global: { plugins: [i18NPlugin, PrimeVue] } });

   it("downloads a document's file under its name", async () => {
      const wrapper = mountLink({ url: null, media: file('m1') });

      expect(wrapper.findAll('a')).toHaveLength(1);
      await wrapper.get('[data-action="download"]').trigger('click');
      expect(api.download).toHaveBeenCalledWith('t-doc/m1/m1.pdf', 'm1.pdf');
   });

   it('opens a Drive link, and shows both when the document has both', () => {
      const link = mountLink({ url: 'https://drive.google.com/x', media: null });
      expect(link.get('a').attributes()).toMatchObject({
         href: 'https://drive.google.com/x',
         target: '_blank'
      });

      expect(
         mountLink({ url: 'https://drive.google.com/x', media: file('m1') }).findAll('a')
      ).toHaveLength(2);
      expect(mountLink({ url: null, media: null }).findAll('a')).toHaveLength(0);
   });
});
