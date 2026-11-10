import { appErrorHandler } from '@/lib/appErrorHandler';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n from '@plugins/i18n';
import ToastEventBus from 'primevue/toasteventbus';
import { beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const refreshAccess = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ refreshAccess }) }));

// The toasts the handler adds, through the bus behind useToast().
const toasts = () => emit.mock.calls.filter(([type]) => type === 'add').map(([, toast]) => toast);
let emit: MockInstance<(type: string, event?: unknown) => void>;

describe('appErrorHandler', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      emit = vi.spyOn(ToastEventBus, 'emit').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
   });

   it('shows a plain Error with its message under a generic summary', async () => {
      await appErrorHandler(new Error('upload failed'));

      expect(toasts()).toEqual([
         expect.objectContaining({ summary: i18n.t('errors.unknown'), detail: 'upload failed' })
      ]);
   });

   it('shows a network failure (status 0, no code)', async () => {
      const error = Object.assign(new Error('Failed to fetch'), {
         name: 'AuthRetryableFetchError',
         status: 0
      });

      await appErrorHandler(error);

      expect(toasts()).toEqual([
         expect.objectContaining({ summary: i18n.t('errors.unknown'), detail: 'Failed to fetch' })
      ]);
   });

   it('shows only the generic text for an Error without a message', async () => {
      await appErrorHandler(new Error());

      expect(toasts()).toEqual([
         expect.objectContaining({ summary: i18n.t('errors.unknown'), detail: '' })
      ]);
   });

   it('keeps translating a database error by its message key', async () => {
      await appErrorHandler({ code: '23505', message: 'unique_violation' });

      expect(toasts()).toEqual([
         expect.objectContaining({ detail: i18n.t('errors.unique_violation') })
      ]);
   });

   it('titles a PostgREST refusal with a neutral summary, not the class name', async () => {
      const error = Object.assign(new Error('transfer_product_in_use'), {
         name: 'PostgrestError',
         code: 'P0001',
         details: '',
         hint: ''
      });

      await appErrorHandler(error);

      expect(toasts()).toEqual([
         expect.objectContaining({
            summary: en.errors.request_failed,
            detail: i18n.t('errors.transfer_product_in_use')
         })
      ]);
      expect(en.errors.request_failed).toBe('Request failed');
   });

   it('titles an Amazon function refusal with a neutral summary, not the class name', async () => {
      const { AmazonApiError } = await import('@/api/amazon');
      await appErrorHandler(new AmazonApiError('amazon_schema_missing'));

      expect(toasts()).toEqual([
         expect.objectContaining({
            summary: en.errors.request_failed,
            detail: i18n.t('errors.amazon_schema_missing')
         })
      ]);
   });

   it('keeps the name of another classified error as its summary', async () => {
      await appErrorHandler({ name: 'AuthApiError', status: 400, message: 'invalid_credentials' });

      expect(toasts()).toEqual([
         expect.objectContaining({
            summary: 'AuthApiError',
            detail: i18n.t('errors.invalid_credentials')
         })
      ]);
   });

   it('stays silent for a value that is neither an Error nor carries a status or code', async () => {
      await appErrorHandler({ reason: 'whatever' });

      expect(toasts()).toEqual([]);
   });

   describe('stale bundle (permission denied for a public relation)', () => {
      const reload = vi.fn();
      const denied = { code: '42501', message: 'permission denied for table product' };

      beforeEach(() => {
         sessionStorage.clear();
         refreshAccess.mockClear();
         reload.mockClear();
         vi.stubGlobal('location', { reload });
      });

      it('reloads the page instead of refreshing access', async () => {
         await appErrorHandler(denied);

         expect(reload).toHaveBeenCalledTimes(1);
         expect(refreshAccess).not.toHaveBeenCalled();
      });

      it('reloads at most once a minute (a view error counts too), then falls back to refreshing', async () => {
         await appErrorHandler(denied);
         await appErrorHandler({
            code: '42501',
            message: 'permission denied for view tenant_member'
         });

         expect(reload).toHaveBeenCalledTimes(1);
         expect(refreshAccess).toHaveBeenCalledTimes(1);
      });

      it('reloads again after a minute', async () => {
         sessionStorage.setItem('staleBundleReloadAt', String(Date.now() - 61_000));

         await appErrorHandler(denied);

         expect(reload).toHaveBeenCalledTimes(1);
      });

      it('keeps refreshing access for any other 42501', async () => {
         await appErrorHandler({ code: '42501', message: 'field_write_forbidden' });

         expect(reload).not.toHaveBeenCalled();
         expect(refreshAccess).toHaveBeenCalledTimes(1);
      });
   });
});
