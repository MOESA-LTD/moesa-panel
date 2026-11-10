import {
   asIdMap,
   asTransferFiles,
   asTransferReport,
   copyTransferFiles,
   fetchTransferOptions,
   idMapCsv,
   rehearseTransfer,
   runTransfer,
   usePendingTransfers,
   useRunTransfer,
   useTransfer,
   type TransferArgs,
   type TransferRow
} from '@/api/transfer';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
import { ZodError } from 'zod';

// The RPCs and the media bucket, recording what the API asks of them.
const mock = vi.hoisted(() => ({
   rpc: vi.fn(),
   rpcResults: {} as Record<string, unknown>,
   rpcErrors: {} as Record<string, Error>,
   // The table reads, as the builder calls each makes: [method, ...args].
   calls: [] as unknown[][],
   tableResult: null as unknown,
   copy: vi.fn(),
   remove: vi.fn(),
   bucket: vi.fn()
}));

vi.mock('@/lib/supabase', () => {
   const supabase = {
      rpc: (name: string, args: unknown) => {
         mock.rpc(name, args);
         return {
            throwOnError: () =>
               mock.rpcErrors[name]
                  ? Promise.reject(mock.rpcErrors[name])
                  : Promise.resolve({ data: mock.rpcResults[name] })
         };
      },
      from: (table: string) => {
         mock.calls.push(['from', table]);
         const builder: Record<string, unknown> = new Proxy(
            {},
            {
               get: (_target, method: string) =>
                  method === 'throwOnError'
                     ? () => Promise.resolve({ data: mock.tableResult })
                     : method === 'then'
                       ? undefined
                       : (...rest: unknown[]) => {
                            mock.calls.push([
                               method,
                               ...rest.filter((a) => !(a instanceof AbortSignal))
                            ]);
                            return builder;
                         }
            }
         );
         return builder;
      },
      storage: {
         from: (bucket: string) => {
            mock.bucket(bucket);
            return { copy: mock.copy, remove: mock.remove };
         }
      }
   };
   return { supabase, publicSchema: supabase };
});

vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => computed(() => 's') }));

const args: TransferArgs = {
   source_tenant: 's',
   target_tenant: 't',
   customer_id: 'c',
   mode: 'copy',
   decisions: { 'customer:c': { action: 'new_code', code: 'ABC' } },
   product_ids: null
};

const report = {
   customer: { id: 'c', code: 'ACM', display_name: 'Acme' },
   path: 'copy',
   mode: 'copy',
   counts: { customer: 1, product: 2 },
   conflicts: [
      {
         key: 'customer:c',
         kind: 'customer_code',
         table: 'customer',
         source_id: 'c',
         label: 'ACM',
         existing_id: 'x',
         actions: ['map', 'new_code']
      },
      {
         key: 'media_link:l',
         kind: 'media_link',
         table: 'media_link',
         source_id: 'l',
         label: 'a.png primary_image',
         existing_id: 'y',
         actions: ['map', 'demote', 'skip'],
         skip_drops: { media: 1 }
      }
   ],
   users: [{ user_id: 'u', display_name: 'Ayşe', columns: ['owner_id'], rows: 2 }],
   left_behind: [
      {
         table: 'product',
         source_id: 'p',
         column: 'project_id',
         label: 'SKU1',
         refers_to: 'project',
         refers_to_id: 'q',
         refers_to_label: null
      }
   ],
   settings_gaps: [
      { rule: 'spec_sheet_required', table: 'product', source_id: 'p', label: 'SKU1' }
   ],
   files: 2,
   unresolved: 1,
   report_hash: 'h'
};

const row = (overrides: Partial<TransferRow> = {}): TransferRow => ({
   id: 'tr',
   tenant_id: 't',
   source_tenant_id: 's',
   customer_id: 'c',
   target_customer_id: 'c2',
   product_ids: null,
   mode: 'move',
   path: 'copy',
   started_by: 'u',
   report: {},
   decisions: {},
   id_map: {},
   files: [
      { media_id: 'm1', from: 's/a', to: 't/a', keep_source: false },
      { media_id: 'm2', from: 's/b', to: 't/b', keep_source: true },
      { media_id: 'm3', from: 's/c', to: 't/c', keep_source: false }
   ],
   files_status: 'pending',
   missing_files: [],
   audit_transaction_ids: [],
   xact_id: null,
   created_at: '',
   updated_at: '',
   ...overrides
});

beforeEach(() => {
   mock.rpc.mockReset();
   mock.rpcResults = {};
   mock.rpcErrors = {};
   mock.calls = [];
   mock.tableResult = null;
   mock.copy.mockReset().mockResolvedValue({ data: {}, error: null });
   mock.remove.mockReset().mockResolvedValue({ data: [], error: null });
   mock.bucket.mockReset();
});

describe('fetchTransferOptions', () => {
   it('asks for the targets of a customer, so a refusal about that customer comes too', async () => {
      mock.rpcResults.transfer_options = { source_writable: true, targets: [] };

      await fetchTransferOptions('s', 'c');
      expect(mock.rpc).toHaveBeenCalledWith('transfer_options', {
         source_tenant: 's',
         customer_id: 'c'
      });
   });
});

describe('rehearseTransfer and runTransfer', () => {
   it('rehearses as a dry run without a hash', async () => {
      mock.rpcResults.transfer_customer = report;

      await expect(rehearseTransfer(args)).resolves.toEqual(report);
      expect(mock.rpc).toHaveBeenCalledWith('transfer_customer', {
         source_tenant: 's',
         target_tenant: 't',
         customer_id: 'c',
         mode: 'copy',
         decisions: args.decisions,
         dry_run: true,
         report_hash: null,
         product_ids: null
      });
   });

   it('runs with the report hash', async () => {
      mock.rpcResults.transfer_customer = row();

      await expect(runTransfer({ ...args, product_ids: ['p'] }, 'h')).resolves.toEqual(row());
      expect(mock.rpc).toHaveBeenCalledWith(
         'transfer_customer',
         expect.objectContaining({ dry_run: false, report_hash: 'h', product_ids: ['p'] })
      );
   });
});

describe('copyTransferFiles', () => {
   it('copies only the missing files of a partial transfer, then checks them', async () => {
      const partial = row({ mode: 'copy', files_status: 'partial', missing_files: ['t/b'] });
      mock.rpcResults.transfer_check_files = {
         ...partial,
         files_status: 'done',
         missing_files: []
      };

      const checked = await copyTransferFiles(partial);

      expect(mock.bucket).toHaveBeenCalledWith('media');
      expect(mock.copy.mock.calls).toEqual([['s/b', 't/b']]);
      expect(mock.rpc).toHaveBeenCalledWith('transfer_check_files', { transfer_id: 'tr' });
      expect(checked.files_status).toBe('done');
      expect(mock.remove).not.toHaveBeenCalled();
   });

   it('copies every file of a pending transfer', async () => {
      mock.rpcResults.transfer_check_files = row({ mode: 'copy', files_status: 'done' });

      await copyTransferFiles(row({ mode: 'copy' }));

      expect(mock.copy.mock.calls).toEqual([
         ['s/a', 't/a'],
         ['s/b', 't/b'],
         ['s/c', 't/c']
      ]);
      expect(mock.remove).not.toHaveBeenCalled();
   });

   it('keeps the source files while the copy is partial', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mock.copy.mockImplementation((from: string) =>
         Promise.resolve({ data: null, error: from === 's/c' ? new Error('denied') : null })
      );
      mock.rpcResults.transfer_check_files = row({
         files_status: 'partial',
         missing_files: ['t/c']
      });

      const checked = await copyTransferFiles(row());

      expect(checked.missing_files).toEqual(['t/c']);
      expect(mock.remove).not.toHaveBeenCalled();
      // The failed copy is reported.
      expect(warn).toHaveBeenCalledWith('Transfer files not copied', 'tr', [
         { file: expect.objectContaining({ from: 's/c' }), error: new Error('denied') }
      ]);
      warn.mockRestore();
   });

   it('removes, once done, only the moved sources not kept', async () => {
      mock.rpcResults.transfer_check_files = row({ files_status: 'done' });

      await copyTransferFiles(row());

      expect(mock.remove).toHaveBeenCalledTimes(1);
      expect(mock.remove).toHaveBeenCalledWith(['s/a', 's/c']);
   });

   it('removes the sources in batches of 1000', async () => {
      const files = Array.from({ length: 1001 }, (_, i) => ({
         media_id: `m${i}`,
         from: `s/${i}`,
         to: `t/${i}`,
         keep_source: false
      }));
      mock.rpcResults.transfer_check_files = row({ files, files_status: 'done' });

      await copyTransferFiles(row({ files, files_status: 'done' }));

      expect(mock.remove.mock.calls.map(([paths]) => paths.length)).toEqual([1000, 1]);
   });

   it('never removes the sources of a copy', async () => {
      mock.rpcResults.transfer_check_files = row({ mode: 'copy', files_status: 'done' });

      await copyTransferFiles(row({ mode: 'copy' }));

      expect(mock.remove).not.toHaveBeenCalled();
   });

   it('counts an object already there as copied, and never throws on another error', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mock.copy
         .mockResolvedValueOnce({ data: null, error: { message: 'The resource already exists' } })
         .mockResolvedValueOnce({ data: null, error: { message: 'Bucket not reachable' } })
         .mockRejectedValueOnce(new Error('network'));
      mock.rpcResults.transfer_check_files = row({
         files_status: 'partial',
         missing_files: ['t/b']
      });

      await expect(copyTransferFiles(row())).resolves.toMatchObject({ files_status: 'partial' });
      expect(mock.copy).toHaveBeenCalledTimes(3);
      expect(mock.rpc).toHaveBeenCalledWith('transfer_check_files', { transfer_id: 'tr' });
      const [, , failed] = warn.mock.calls[0]!;
      expect((failed as { file: { from: string } }[]).map(({ file }) => file.from)).toEqual([
         's/b',
         's/c'
      ]);
      warn.mockRestore();
   });

   it('throws on malformed files before copying', async () => {
      await expect(copyTransferFiles(row({ files: [{ to: 't' }] }))).rejects.toBeInstanceOf(
         ZodError
      );
      expect(mock.copy).not.toHaveBeenCalled();
   });
});

const mountHook = <T>(hook: () => T, queryClient = new QueryClient()): T => {
   let result!: T;
   mount(
      defineComponent({
         setup() {
            result = hook();
            return () => h('div');
         }
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } }
   );
   return result;
};

describe('useRunTransfer', () => {
   it('runs, copies, and marks both tenants stale', async () => {
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      let run!: ReturnType<typeof useRunTransfer>;
      mount(
         defineComponent({
            setup() {
               run = useRunTransfer();
               return () => h('div');
            }
         }),
         { global: { plugins: [[VueQueryPlugin, { queryClient }]] } }
      );
      mock.rpcResults.transfer_customer = row({ mode: 'copy' });
      mock.rpcResults.transfer_check_files = row({ mode: 'copy', files_status: 'done' });

      const result = await run.mutateAsync({ args, reportHash: 'h' });

      expect(result.files_status).toBe('done');
      expect(mock.copy).toHaveBeenCalledTimes(3);
      const { predicate } = invalidate.mock.calls[0]![0] as unknown as {
         predicate: (query: { queryKey: unknown[] }) => boolean;
      };
      const stale = (key: unknown[]) => predicate({ queryKey: key });
      expect(stale(['tenant', 's', 'customer'])).toBe(true);
      expect(stale(['tenant', 'x,t', 'product'])).toBe(true);
      expect(stale(['tenant', 'x', 'product'])).toBe(false);
   });

   it('returns the committed run row when the file check fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ran = row({ mode: 'copy' });
      mock.rpcResults.transfer_customer = ran;
      mock.rpcErrors.transfer_check_files = new Error('check down');

      await expect(
         mountHook(useRunTransfer).mutateAsync({ args, reportHash: 'h' })
      ).resolves.toEqual(ran);
      expect(warn).toHaveBeenCalledWith(
         'Transfer files not checked',
         'tr',
         new Error('check down')
      );
      warn.mockRestore();
   });
});

describe('transfer reads', () => {
   it('reads a transfer as its target tenant alone, keyed by it', async () => {
      const queryClient = new QueryClient();
      mock.tableResult = row();
      const query = mountHook(() => useTransfer('tr', 't'), queryClient);

      await vi.waitFor(() => expect(query.data.value).toEqual(row()));
      expect(mock.calls).toEqual([
         ['from', 'transfer'],
         ['select', '*'],
         ['eq', 'id', 'tr'],
         ['abortSignal'],
         ['setHeader', 'x-tenant-id', 't'],
         ['setHeader', 'x-tenant-ids', 't'],
         ['maybeSingle']
      ]);
      expect(queryClient.getQueryData(['tenant', 't', 'transfer', 'detail', 'tr'])).toEqual(row());
   });

   it('waits for the target tenant', () => {
      const query = mountHook(() => useTransfer('tr', null));
      expect(query.isFetching.value).toBe(false);
      expect(mock.calls).toEqual([]);
   });

   it('lists the transfers into a customer whose files are not done, newest first', async () => {
      mock.tableResult = [row()];
      const query = mountHook(() => usePendingTransfers('c2'));

      await vi.waitFor(() => expect(query.data.value).toEqual([row()]));
      expect(mock.calls).toEqual([
         ['from', 'transfer'],
         ['select', '*'],
         ['eq', 'target_customer_id', 'c2'],
         ['neq', 'files_status', 'done'],
         ['order', 'created_at', { ascending: false }],
         ['abortSignal']
      ]);
   });
});

describe('idMapCsv', () => {
   it('writes the map by table, then source id', () => {
      expect(idMapCsv({ product: { b: '2', a: '1' }, customer: { c: '3' } })).toBe(
         'table,source_id,target_id\r\ncustomer,c,3\r\nproduct,a,1\r\nproduct,b,2\r\n'
      );
   });
});

describe('narrowing the Json columns', () => {
   it('reads a valid id map unchanged and throws on a malformed one', () => {
      expect(asIdMap({ customer: { a: 'b' } })).toEqual({ customer: { a: 'b' } });
      expect(() => asIdMap({ customer: 'x' })).toThrow(ZodError);
   });

   it('reads valid files unchanged and throws on malformed ones', () => {
      const files = [{ media_id: 'm', from: 'f', to: 't', keep_source: false }];
      expect(asTransferFiles(files)).toEqual(files);
      expect(() => asTransferFiles([{ to: 't' }])).toThrow(ZodError);
   });

   it('reads a report, an unknown conflict kind and action included', () => {
      expect(asTransferReport(report)).toEqual(report);

      const newer = {
         ...report,
         conflicts: [{ ...report.conflicts[0]!, kind: 'warp_drive', actions: ['map', 'teleport'] }]
      };
      expect(asTransferReport(newer).conflicts[0]).toMatchObject({
         kind: 'unknown',
         actions: ['map']
      });
   });

   it('throws on a report of another shape', () => {
      expect(() => asTransferReport({ ...report, report_hash: null })).toThrow(ZodError);
      expect(() => asTransferReport({ ...report, conflicts: [{ key: 'k' }] })).toThrow(ZodError);
   });
});
