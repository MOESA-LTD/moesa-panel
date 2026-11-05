import '../setup/mockMain';
import type { TransferRow } from '@/api/transfer';
import TransferFilesNotice from '@/components/service-components/transfer/TransferFilesNotice.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ retry: vi.fn(), errorHandler: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/api/transfer', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/transfer')>()),
      useRetryTransferFiles: () => ({ mutateAsync: api.retry, isPending: ref(false) })
   };
});

const row = (overrides: Partial<TransferRow> = {}): TransferRow => ({
   id: 'tr',
   tenant_id: 't',
   source_tenant_id: 's',
   customer_id: 'c',
   target_customer_id: 'c2',
   product_ids: null,
   mode: 'copy',
   path: 'copy',
   started_by: 'u',
   report: {},
   decisions: {},
   id_map: {},
   files: [],
   files_status: 'pending',
   missing_files: [],
   audit_transaction_ids: [],
   xact_id: null,
   created_at: '',
   updated_at: '',
   ...overrides
});

const mountNotice = (transfer: TransferRow, heading = false) =>
   mount(TransferFilesNotice, {
      props: { transfer, heading },
      // A failed retry is rethrown for the app's error toast.
      global: { plugins: [i18NPlugin, PrimeVue], config: { errorHandler: api.errorHandler } }
   });

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   api.retry.mockReset();
   api.errorHandler.mockReset();
});

describe('TransferFilesNotice', () => {
   it('counts the missing files and retries the copy', async () => {
      const transfer = row({ files_status: 'partial', missing_files: ['t/a', 't/b'] });
      api.retry.mockResolvedValueOnce(row({ files_status: 'done' }));
      const wrapper = mountNotice(transfer);

      expect(wrapper.find('[data-files-status]').text()).toBe('2 files could not be copied.');
      await wrapper.find('[data-retry] button').trigger('click');
      await flushPromises();
      expect(api.retry).toHaveBeenCalledWith(transfer);
   });

   it('says one file in the singular', () => {
      const wrapper = mountNotice(row({ files_status: 'partial', missing_files: ['t/a'] }));
      expect(wrapper.find('[data-files-status]').text()).toBe('1 file could not be copied.');
   });

   it('offers no retry once every file is copied', () => {
      const wrapper = mountNotice(row({ files_status: 'done' }));
      expect(wrapper.find('[data-files-status]').text()).toBe(en.ops.transfer.files.done);
      expect(wrapper.find('[data-retry]').exists()).toBe(false);
   });

   it('names what is missing under a heading', () => {
      const wrapper = mountNotice(row({ files_status: 'pending' }), true);
      expect(wrapper.find('[data-files-heading]').text()).toBe(en.ops.transfer.files.notice);
      expect(wrapper.find('[data-files-status]').text()).toBe(en.ops.transfer.files.pending);
      expect(mountNotice(row()).find('[data-files-heading]').exists()).toBe(false);
   });

   it('shows a failed retry in the notice', async () => {
      const failure = { message: 'transfer_report_stale' };
      api.retry.mockRejectedValueOnce(failure);
      const wrapper = mountNotice(row({ files_status: 'partial', missing_files: ['t/a'] }));

      await wrapper.find('[data-retry] button').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-files-error]').text()).toBe(en.errors.transfer_report_stale);
      expect(api.errorHandler).toHaveBeenCalledWith(failure, expect.anything(), expect.anything());
   });
});
