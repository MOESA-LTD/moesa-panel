import type { EntityMediaLink, MediaRole, MediaRow } from '@/api/media';
import EntityMedia from '@/components/service-components/entity-media/EntityMedia.vue';
import MediaPickerDialog from '@/components/service-components/media/MediaPickerDialog.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import FileUpload from 'primevue/fileupload';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, toValue, type MaybeRefOrGetter } from 'vue';

// The media hooks are stand-ins; the helpers (default roles, kinds, thumb paths) are the real ones.
const api = vi.hoisted(() => ({
   links: [] as unknown[],
   upload: vi.fn(),
   link: vi.fn(),
   unlink: vi.fn(),
   setRole: vi.fn(),
   setPrimary: vi.fn(),
   open: vi.fn(),
   download: vi.fn(),
   library: [] as unknown[],
   libraryFilters: undefined as unknown,
   libraryOptions: undefined as { enabled?: unknown } | undefined
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', async () => {
   const { ability } = await import('@/plugins/casl');
   // No other branches here: a row's tenant follows the active ability.
   return {
      useAuthStore: () => ({
         currentTenant: { id: 't-active' },
         canIn: (_tenantId: string | null, action: string, subject: string) =>
            ability.can(action, subject)
      })
   };
});
vi.mock('@/api/media', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/media')>()),
   useEntityMedia: () => ({ data: ref(api.links), isPending: ref(false) }),
   useMediaMaxBytes: () => ({ data: ref(26214400) }),
   useLinkMedia: () => ({ mutateAsync: api.link, isPending: ref(false) }),
   useUnlinkMedia: () => ({ mutateAsync: api.unlink, isPending: ref(false) }),
   useSetLinkRole: () => ({ mutateAsync: api.setRole, isPending: ref(false) }),
   useSetPrimaryMedia: () => ({ mutateAsync: api.setPrimary, isPending: ref(false) })
}));
vi.mock('@/api/media/upload', () => ({
   useUploadMedia: () => ({ mutateAsync: api.upload, isPending: ref(false) })
}));
vi.mock('@/api/media/signedUrls', async () => {
   const { computed, toValue } = await import('vue');
   return {
      useSignedUrl: (path: () => string | null) =>
         computed(() => (toValue(path) ? `signed:${toValue(path)}` : undefined)),
      openMediaFile: api.open,
      downloadMediaFile: api.download
   };
});
vi.mock('@/api/media/library', async () => {
   const { toValue } = await import('vue');
   return {
      useMediaLibrary: (filters: () => unknown, options?: { enabled?: unknown }) => {
         api.libraryFilters = toValue(filters);
         api.libraryOptions = options;
         return {
            data: ref({ pages: [api.library] }),
            hasNextPage: ref(false),
            isFetching: ref(false),
            fetchNextPage: vi.fn()
         };
      }
   };
});

const media = (id: string, mimeType = 'image/png') =>
   ({
      id,
      tenant_id: 't-record',
      customer_id: null,
      file_name: `${id}.${mimeType.split('/')[1]}`,
      mime_type: mimeType,
      storage_path: `t-record/${id}/${id}`,
      thumbnail_path: null,
      title: id,
      alt_text: null
   }) as unknown as MediaRow;

const link = (id: string, role: MediaRole, file: MediaRow, position = 0) =>
   ({ id, role, position, media_id: file.id, media: file }) as unknown as EntityMediaLink;

const allowAll = () => [{ action: 'manage', subject: 'all' }];
/** Everything but one action on one subject. */
const allowAllBut = (action: string, subject: string) => [
   ...allowAll(),
   { action, subject, inverted: true }
];
/** Everything but updating products, which is half of "modify". */
const withoutProductUpdate = () => [
   ...allowAll(),
   { action: 'update', subject: 'product', inverted: true }
];

const mountMedia = () =>
   mount(EntityMedia, {
      props: { entityType: 'product', entityId: 'p1', customerId: 'c1', tenantId: 't-record' },
      global: { plugins: [i18NPlugin, PrimeVue] }
   });

const cards = (wrapper: ReturnType<typeof mountMedia>) => wrapper.findAll('[data-media-card]');

describe('EntityMedia', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   beforeEach(() => {
      ability.update(allowAll());
      api.links = [];
      api.library = [];
      [
         api.upload,
         api.link,
         api.unlink,
         api.setRole,
         api.setPrimary,
         api.open,
         api.download
      ].forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
      api.link.mockResolvedValue([]);
   });

   it('shows one card per link, the primary image first, with its name and role', () => {
      const primary = media('front');
      api.links = [
         link('l-primary', 'primary_image', primary),
         link('l-gallery', 'gallery', media('side'), 1),
         link('l-pdf', 'attachment', media('sheet', 'application/pdf'), 2)
      ];
      const shown = cards(mountMedia());

      expect(shown.map((card) => card.attributes('data-link-id'))).toEqual([
         'l-primary',
         'l-gallery',
         'l-pdf'
      ]);
      expect(shown[0].text()).toContain('front.png');
      expect(shown[0].text()).toContain(i18n.t('ops.media.role.primary_image'));
      expect(shown[2].text()).toContain(i18n.t('ops.media.role.attachment'));
      // An image shows its signed picture; a PDF its icon.
      expect(shown[0].get('img').attributes('src')).toBe(`signed:${primary.storage_path}`);
      expect(shown[2].find('.pi-file-pdf').exists()).toBe(true);
   });

   it('makes a gallery image the primary one with its star', async () => {
      api.links = [
         link('l-primary', 'primary_image', media('front')),
         link('l-gallery', 'gallery', media('side'), 1)
      ];
      const wrapper = mountMedia();

      await cards(wrapper)[1].get('[data-action="set-primary"]').trigger('click');

      expect(api.setPrimary).toHaveBeenCalledOnce();
      expect(api.setPrimary).toHaveBeenCalledWith({ linkId: 'l-gallery' });
      // The primary image shows its mark, not a button to set it again.
      expect(cards(wrapper)[0].find('[data-action="set-primary"]').exists()).toBe(false);
      expect(cards(wrapper)[0].find('.pi-star-fill').exists()).toBe(true);
      // The library offers the files not linked yet.
      expect(wrapper.findComponent(MediaPickerDialog).props('excludeIds')).toEqual([
         'front',
         'side'
      ]);
   });

   it('offers no star on a PDF', () => {
      api.links = [link('l-pdf', 'attachment', media('sheet', 'application/pdf'))];
      const [card] = cards(mountMedia());
      expect(card.find('[data-action="set-primary"]').exists()).toBe(false);
      expect(card.find('.pi-star-fill').exists()).toBe(false);
   });

   it('unlinks the selected cards together', async () => {
      api.links = [
         link('a', 'gallery', media('one')),
         link('b', 'gallery', media('two'), 1),
         link('c', 'gallery', media('three'), 2)
      ];
      const wrapper = mountMedia();
      const [first, second] = cards(wrapper);

      await first.get('input[type="checkbox"]').setValue(true);
      await second.get('input[type="checkbox"]').setValue(true);
      expect(wrapper.get('[data-bulk-bar]').text()).toContain(
         i18n.t('ops.media.selected', { count: 2 })
      );
      await wrapper.get('[data-action="unlink"]').trigger('click');
      await flushPromises();

      expect(api.unlink).toHaveBeenCalledOnce();
      expect(api.unlink).toHaveBeenCalledWith({ linkIds: ['a', 'b'] });
      // The selection is cleared once done.
      expect(wrapper.get('[data-bulk-bar]').text()).toContain(
         i18n.t('ops.media.selected', { count: 0 })
      );
   });

   it('opens a file from its card, or downloads it under its name', async () => {
      const file = media('sheet', 'application/pdf');
      api.links = [link('l-pdf', 'attachment', file)];
      const card = cards(mountMedia())[0];

      await card.get('[data-action="open"]').trigger('click');
      expect(api.open).toHaveBeenCalledWith(file.storage_path);
      expect(api.download).not.toHaveBeenCalled();

      await card.get('[data-action="download"]').trigger('click');
      expect(api.download).toHaveBeenCalledWith(file.storage_path, file.file_name);
   });

   it('is read-only without the right to update the record', () => {
      ability.update(withoutProductUpdate());
      api.links = [
         link('l-primary', 'primary_image', media('front')),
         link('l-gallery', 'gallery', media('side'), 1)
      ];
      const wrapper = mountMedia();

      expect(cards(wrapper)).toHaveLength(2);
      expect(wrapper.findComponent(FileUpload).exists()).toBe(false);
      expect(wrapper.find('[data-action="set-primary"]').exists()).toBe(false);
      expect(wrapper.find('[data-bulk-bar]').exists()).toBe(false);
      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
      expect(wrapper.find('[data-action="link-from-library"]').exists()).toBe(false);
      // The primary image is still marked.
      expect(cards(wrapper)[0].find('.pi-star-fill').exists()).toBe(true);
   });

   it('offers no upload without the right to create files, but still links from the library', () => {
      ability.update(allowAllBut('insert', 'media'));
      api.links = [link('l-gallery', 'gallery', media('side'))];
      const wrapper = mountMedia();

      expect(wrapper.findComponent(FileUpload).exists()).toBe(false);
      expect(wrapper.find('[data-action="link-from-library"]').exists()).toBe(true);
      expect(wrapper.find('[data-action="unlink"]').exists()).toBe(true);
   });

   it('offers no unlink without the right to delete links, but still sets roles', () => {
      ability.update(allowAllBut('delete', 'media_link'));
      api.links = [link('l-gallery', 'gallery', media('side'))];
      const wrapper = mountMedia();

      expect(wrapper.find('[data-bulk-bar]').exists()).toBe(true);
      expect(wrapper.find('[data-action="unlink"]').exists()).toBe(false);
      expect(wrapper.find('[data-action="set-primary"]').exists()).toBe(true);
      expect(wrapper.findComponent(FileUpload).exists()).toBe(true);
   });

   it('offers neither roles nor the star without the right to update links', () => {
      ability.update(allowAllBut('update', 'media_link'));
      api.links = [link('l-gallery', 'gallery', media('side'))];
      const wrapper = mountMedia();

      expect(wrapper.find('[data-action="set-primary"]').exists()).toBe(false);
      expect(wrapper.find('[data-action="set-role"]').exists()).toBe(false);
      expect(wrapper.find('[data-action="unlink"]').exists()).toBe(true);
   });

   it("links an image uploaded to a product without files as its primary image, in the record's tenant", async () => {
      const uploaded = media('new');
      api.upload.mockResolvedValue(uploaded);
      const wrapper = mountMedia();
      const file = new File(['x'], 'new.png', { type: 'image/png' });

      wrapper.findComponent(FileUpload).vm.$emit('uploader', { files: [file] });
      await flushPromises();

      expect(api.upload).toHaveBeenCalledWith({ file, customerId: 'c1', tenantId: 't-record' });
      expect(api.link).toHaveBeenCalledOnce();
      expect(api.link).toHaveBeenCalledWith({
         entityType: 'product',
         entityId: 'p1',
         tenantId: 't-record',
         links: [{ mediaId: 'new', role: 'primary_image' }]
      });
   });

   it('marks only the first of several dropped images primary, and goes on past a failure', async () => {
      const files = ['a.png', 'bad.png', 'b.png'].map(
         (name) => new File(['x'], name, { type: 'image/png' })
      );
      api.upload.mockImplementation(async ({ file }: { file: File }) => {
         if (file.name === 'bad.png') throw Object.assign(new Error('boom'), { code: 'XX000' });
         return media(file.name.replace('.png', ''));
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const wrapper = mountMedia();

      wrapper.findComponent(FileUpload).vm.$emit('uploader', { files });
      await flushPromises();

      expect(api.upload).toHaveBeenCalledTimes(3);
      expect(api.link).toHaveBeenCalledOnce();
      expect(api.link).toHaveBeenCalledWith(
         expect.objectContaining({
            links: [
               { mediaId: 'a', role: 'primary_image' },
               { mediaId: 'b', role: 'gallery' }
            ]
         })
      );
      // The failure went to the error handler.
      expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ code: 'XX000' }));
   });

   it('links a gallery image after an existing primary image', async () => {
      api.links = [link('l-primary', 'primary_image', media('front'))];
      api.upload.mockResolvedValue(media('new'));
      const wrapper = mountMedia();

      wrapper
         .findComponent(FileUpload)
         .vm.$emit('uploader', { files: [new File(['x'], 'new.png', { type: 'image/png' })] });
      await flushPromises();

      expect(api.link).toHaveBeenCalledWith(
         expect.objectContaining({ links: [{ mediaId: 'new', role: 'gallery' }] })
      );
   });

   it('links files picked from the library, in the order picked', async () => {
      api.library = [
         { ...media('older'), kind: 'image' },
         { ...media('sheet', 'application/pdf'), kind: 'pdf' },
         { ...media('newer'), kind: 'image' }
      ];
      const wrapper = mountMedia();
      const picker = wrapper.findComponent(MediaPickerDialog);

      picker.vm.$emit('picked', [api.library[1], api.library[2], api.library[0]]);
      await flushPromises();

      expect(api.link).toHaveBeenCalledWith(
         expect.objectContaining({
            tenantId: 't-record',
            links: [
               { mediaId: 'sheet', role: 'attachment' },
               { mediaId: 'newer', role: 'primary_image' },
               { mediaId: 'older', role: 'gallery' }
            ]
         })
      );
      // The picker offers only files the record's tenant can link.
      expect(picker.props('tenantId')).toBe('t-record');
   });
});

describe('MediaPickerDialog', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   // The dialog's body and footer in place, without its teleport.
   const DialogStub = { template: '<div><slot /><slot name="footer" /></div>' };

   it('offers the library minus the excluded files, of the kinds asked, and emits the picks in order', async () => {
      api.library = [media('a'), media('b'), media('c')];
      const wrapper = mount(MediaPickerDialog, {
         props: {
            visible: true,
            customerId: 'c1',
            tenantId: 't1',
            excludeIds: ['b'],
            kinds: ['image', 'video']
         },
         global: { plugins: [i18NPlugin, PrimeVue], stubs: { Dialog: DialogStub } }
      });

      expect(api.libraryFilters).toEqual({
         tenantId: 't1',
         customerId: 'c1',
         includeShared: true,
         kind: ['image', 'video']
      });
      const items = wrapper.findAll('[data-picker-item]');
      expect(items.map((item) => item.text())).toEqual(['a.png', 'c.png']);

      await items[1].trigger('click');
      await items[0].trigger('click');
      await wrapper.get('[data-action="pick"]').trigger('click');

      expect(wrapper.emitted('picked')?.[0]?.[0]).toEqual([api.library[2], api.library[0]]);
      expect(wrapper.emitted('update:visible')?.[0]).toEqual([false]);
   });

   it('queries the library only while open', async () => {
      const wrapper = mount(MediaPickerDialog, {
         props: { visible: false },
         global: { plugins: [i18NPlugin, PrimeVue], stubs: { Dialog: DialogStub } }
      });
      const enabled = () => toValue(api.libraryOptions?.enabled as MaybeRefOrGetter<boolean>);

      expect(enabled()).toBe(false);
      await wrapper.setProps({ visible: true });
      expect(enabled()).toBe(true);
   });
});
