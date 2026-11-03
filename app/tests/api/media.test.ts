import {
   defaultLinkRole,
   defaultLinkRoles,
   mediaKind,
   mediaLinkRows,
   mediaPath,
   mediaSchema,
   safeFileName,
   thumbPath,
   toMediaFormValues,
   toMediaPayload,
   useDeleteMedia,
   validateMediaFile,
   type MediaRow
} from '@/api/media';
import { MediaFileError, uploadMedia } from '@/api/media/upload';
import i18n from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const LIMIT = 26214400;

// The storage bucket and the media table, recording what uploadMedia asks of them.
const mock = vi.hoisted(() => ({
   upload: vi.fn(),
   remove: vi.fn(),
   insert: vi.fn(),
   delete: vi.fn(),
   insertResult: { data: null as unknown, error: null as unknown }
}));

vi.mock('@/lib/supabase', () => ({
   supabase: {
      storage: { from: () => ({ upload: mock.upload, remove: mock.remove }) },
      from: () => ({
         insert: (row: unknown) => {
            mock.insert(row);
            return { select: () => ({ single: () => Promise.resolve(mock.insertResult) }) };
         },
         delete: () => ({
            eq: (column: string, value: unknown) => ({
               throwOnError: () => Promise.resolve(mock.delete(column, value))
            })
         })
      })
   }
}));

beforeEach(() => {
   mock.upload.mockReset().mockResolvedValue({ data: {}, error: null });
   mock.remove.mockReset().mockResolvedValue({ data: [], error: null });
   mock.insert.mockReset();
   mock.delete.mockReset().mockReturnValue({ data: null, error: null });
   mock.insertResult = { data: { id: 'saved' }, error: null };
});

afterEach(() => vi.unstubAllGlobals());

describe('safeFileName', () => {
   it('makes a lower-case ASCII name with the extension kept', () => {
      expect(safeFileName('Ürün Fotoğrafı (1).JPG')).toBe('urun-fotografi-1.jpg');
      expect(safeFileName('ŞĞÜÇÖİ ı.png')).toBe('sgucoi-i.png');
   });

   it('drops path separators and names an empty base "file"', () => {
      expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
      expect(safeFileName('.png')).toBe('file.png');
      expect(safeFileName('')).toBe('file');
   });

   it('caps the base at 80 characters', () => {
      expect(safeFileName(`${'a'.repeat(100)}.pdf`)).toBe(`${'a'.repeat(80)}.pdf`);
   });
});

describe('media helpers', () => {
   it('builds the storage path from the tenant, the id and the safe name', () => {
      expect(mediaPath('t1', 'm1', 'A B.webp')).toBe('t1/m1/a-b.webp');
   });

   it('accepts the five types up to the limit', () => {
      expect(validateMediaFile({ type: 'image/svg+xml', size: 10 }, LIMIT)).toBe(
         'media_type_not_allowed'
      );
      expect(validateMediaFile({ type: 'image/png', size: LIMIT + 1 }, LIMIT)).toBe(
         'media_too_large'
      );
      expect(validateMediaFile({ type: 'image/png', size: LIMIT }, LIMIT)).toBeNull();
      expect(validateMediaFile({ type: 'video/mp4', size: 1 }, LIMIT)).toBeNull();
   });

   it('tells the kind from the type', () => {
      expect(mediaKind('image/webp')).toBe('image');
      expect(mediaKind('application/pdf')).toBe('pdf');
      expect(mediaKind('video/mp4')).toBe('video');
   });

   it('shows an image by its thumbnail, else the image itself; other files have none', () => {
      const image = { mime_type: 'image/png', storage_path: 't/m/a.png' };
      expect(thumbPath({ ...image, thumbnail_path: 't/m/thumb/thumb.webp' })).toBe(
         't/m/thumb/thumb.webp'
      );
      expect(thumbPath({ ...image, thumbnail_path: null })).toBe('t/m/a.png');
      expect(
         thumbPath({
            mime_type: 'application/pdf',
            storage_path: 't/m/a.pdf',
            thumbnail_path: null
         })
      ).toBeNull();
   });
});

describe('defaultLinkRole', () => {
   it('makes an image the primary of a product without one', () => {
      expect(defaultLinkRole({ kind: 'image', entityType: 'product', hasPrimary: false })).toBe(
         'primary_image'
      );
      expect(defaultLinkRole({ kind: 'image', entityType: 'product', hasPrimary: true })).toBe(
         'gallery'
      );
      expect(defaultLinkRole({ kind: 'image', entityType: 'customer', hasPrimary: false })).toBe(
         'gallery'
      );
      expect(defaultLinkRole({ kind: 'pdf', entityType: 'product', hasPrimary: false })).toBe(
         'attachment'
      );
   });

   it('makes only the first image of a batch the primary', () => {
      expect(defaultLinkRoles(['pdf', 'image', 'image', 'video'], 'product', false)).toEqual([
         'attachment',
         'primary_image',
         'gallery',
         'attachment'
      ]);
      expect(defaultLinkRoles(['image', 'image'], 'product', true)).toEqual(['gallery', 'gallery']);
   });
});

describe('mediaLinkRows', () => {
   it("numbers the links from the start, in the record's tenant", () => {
      const rows = mediaLinkRows(
         {
            entityType: 'product',
            entityId: 'p1',
            tenantId: 'branch',
            links: [
               { mediaId: 'm1', role: 'primary_image' },
               { mediaId: 'm2', role: 'gallery' }
            ]
         },
         3
      );
      expect(rows).toEqual([
         {
            tenant_id: 'branch',
            media_id: 'm1',
            entity_type: 'product',
            entity_id: 'p1',
            role: 'primary_image',
            position: 3
         },
         {
            tenant_id: 'branch',
            media_id: 'm2',
            entity_type: 'product',
            entity_id: 'p1',
            role: 'gallery',
            position: 4
         }
      ]);
   });
});

describe('uploadMedia', () => {
   const ctx = { tenantId: 't1', customerId: 'c1', maxBytes: LIMIT };
   const pdf = () => new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
   const uploadedPath = (call: number) => mock.upload.mock.calls[call]![0] as string;

   it('uploads the file under a new id, then inserts its row', async () => {
      await expect(uploadMedia(pdf(), ctx)).resolves.toEqual({ id: 'saved' });

      const path = uploadedPath(0);
      expect(path).toMatch(/^t1\/[0-9a-f-]{36}\/a\.pdf$/);
      expect(mock.upload).toHaveBeenCalledTimes(1);
      expect(mock.upload).toHaveBeenCalledWith(path, expect.any(File), {
         contentType: 'application/pdf',
         upsert: false
      });
      expect(mock.insert).toHaveBeenCalledWith({
         id: path.split('/')[1],
         tenant_id: 't1',
         customer_id: 'c1',
         storage_path: path,
         thumbnail_path: null,
         file_name: 'a.pdf',
         mime_type: 'application/pdf',
         size_bytes: 4,
         width: null,
         height: null,
         title: 'a'
      });
   });

   it('uploads a webp thumbnail of an image beside it and records the image size', async () => {
      vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 400, close() {} }));
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
         drawImage
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
         done(new Blob(['webp'], { type: 'image/webp' }))
      );

      await uploadMedia(new File(['png'], 'Shelf.PNG', { type: 'image/png' }), ctx);

      const [path, thumb] = [uploadedPath(0), uploadedPath(1)];
      const id = path.split('/')[1];
      expect(path).toBe(`t1/${id}/shelf.png`);
      expect(thumb).toBe(`t1/${id}/thumb/thumb.webp`);
      expect(mock.upload).toHaveBeenLastCalledWith(thumb, expect.any(Blob), {
         contentType: 'image/webp',
         upsert: false
      });
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 200);
      expect(mock.insert).toHaveBeenCalledWith(
         expect.objectContaining({ thumbnail_path: thumb, width: 800, height: 400, title: 'Shelf' })
      );

      mock.insertResult = { data: null, error: { code: '23503' } };
      mock.upload.mockClear();
      await expect(
         uploadMedia(new File(['png'], 'a.png', { type: 'image/png' }), ctx)
      ).rejects.toEqual({ code: '23503' });
      expect(mock.remove).toHaveBeenCalledWith([uploadedPath(0), uploadedPath(1)]);
   });

   it('gives two files of the same name their own ids', async () => {
      await uploadMedia(pdf(), ctx);
      await uploadMedia(pdf(), ctx);
      expect(uploadedPath(0)).not.toBe(uploadedPath(1));
   });

   it('removes the uploaded file when the row is refused', async () => {
      const error = { code: '23514', message: 'media_too_large' };
      mock.insertResult = { data: null, error };

      await expect(uploadMedia(pdf(), ctx)).rejects.toBe(error);
      expect(mock.remove).toHaveBeenCalledWith([uploadedPath(0)]);
   });

   it('refuses a file of another type before uploading it', async () => {
      const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });

      const result = uploadMedia(svg, ctx);
      await expect(result).rejects.toBeInstanceOf(MediaFileError);
      await expect(result).rejects.toMatchObject({ code: 'media_type_not_allowed' });
      expect(mock.upload).not.toHaveBeenCalled();
   });

   it('refuses a file over the limit before uploading it', async () => {
      await expect(uploadMedia(pdf(), { ...ctx, maxBytes: 3 })).rejects.toMatchObject({
         code: 'media_too_large'
      });
      expect(mock.upload).not.toHaveBeenCalled();
   });

   it('names the limit in MB when it refuses a file over it', async () => {
      const big = new File([new Uint8Array(1048577)], 'big.png', { type: 'image/png' });

      await expect(uploadMedia(big, { ...ctx, maxBytes: 1048576 })).rejects.toMatchObject({
         code: 'media_too_large',
         message: expect.stringContaining('up to 1 MB')
      });
      expect(i18n.te(`errors.${new MediaFileError('media_type_not_allowed').name}`)).toBe(true);
   });

   it('stops when the file cannot be uploaded', async () => {
      const error = new Error('storage down');
      mock.upload.mockResolvedValue({ data: null, error });

      await expect(uploadMedia(pdf(), ctx)).rejects.toBe(error);
      expect(mock.insert).not.toHaveBeenCalled();
   });

   it('gives a refused upload a status, so the error handler shows it', async () => {
      // Storage returns its JSON body as the error: no `status` and no `code`.
      const body = {
         statusCode: '409',
         error: 'Duplicate',
         message: 'The resource already exists'
      };
      mock.upload.mockResolvedValue({ data: null, error: body });

      await expect(uploadMedia(pdf(), ctx)).rejects.toMatchObject({
         name: 'MediaFileError',
         status: 409,
         message: 'The resource already exists'
      });
      expect(mock.insert).not.toHaveBeenCalled();
   });
});

describe('mediaSchema', () => {
   const values = (overrides: Record<string, unknown> = {}) => ({
      title: 'Front',
      alt_text: '',
      tags: [],
      customer_id: null,
      ...overrides
   });

   it('trims and lower-cases the tags', () => {
      const parsed = mediaSchema.parse(values({ tags: [' Mop ', 'mop'] }));
      expect(parsed.tags).toEqual(['mop', 'mop']);
      // An emptied optional field is stored as null.
      expect(parsed.alt_text).toBeNull();
   });

   it('refuses a title over 200 characters on the title', () => {
      const result = mediaSchema.safeParse(values({ title: 'x'.repeat(201) }));
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ path }) => path)).toEqual([['title']]);
   });

   it('saves only the form fields', () => {
      const row = {
         id: 'm1',
         tenant_id: 't1',
         customer_id: 'c1',
         title: 'Front',
         alt_text: 'A mop',
         tags: ['mop'],
         storage_path: 't1/m1/front.png',
         thumbnail_path: 't1/m1/thumb/thumb.webp',
         file_name: 'front.png',
         mime_type: 'image/png',
         size_bytes: 10
      } as unknown as MediaRow;
      const payload = toMediaPayload(mediaSchema.parse(toMediaFormValues(row)));

      expect(payload).toEqual({
         id: 'm1',
         title: 'Front',
         alt_text: 'A mop',
         tags: ['mop'],
         customer_id: 'c1'
      });
   });
});

describe('useDeleteMedia', () => {
   const mountDelete = () => {
      let remove!: ReturnType<typeof useDeleteMedia>;
      mount(
         defineComponent({
            setup() {
               remove = useDeleteMedia();
               return () => h('div');
            }
         }),
         { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
      );
      return remove;
   };
   const file = { id: 'm1', storage_path: 't1/m1/a.png', thumbnail_path: null };

   it('deletes the row, then its objects', async () => {
      await mountDelete().mutateAsync({ media: file });

      expect(mock.delete).toHaveBeenCalledWith('id', 'm1');
      expect(mock.remove).toHaveBeenCalledWith(['t1/m1/a.png']);
   });

   it('logs, without failing, an object storage refuses to remove', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const refused = new Error('denied');
      mock.remove.mockResolvedValue({ data: null, error: refused });

      await expect(mountDelete().mutateAsync({ media: file })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Media file left in storage', 'm1', refused);
      warn.mockRestore();
   });
});
