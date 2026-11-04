import { appErrorHandler } from '@/lib/appErrorHandler';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n from '@plugins/i18n';
import ToastEventBus from 'primevue/toasteventbus';
import { beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

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

   it('stays silent for a value that is neither an Error nor carries a status or code', async () => {
      await appErrorHandler({ reason: 'whatever' });

      expect(toasts()).toEqual([]);
   });
});
