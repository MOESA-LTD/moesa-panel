import '../setup/mockMain';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import Platforms from '@/views/pages/ops/customer/tabs/Platforms.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

// The customer's Platforms tab: the Amazon row's connection state and its Connect / Disconnect
// actions, and the toast of the OAuth callback's return (?amazon=connected|error&reason=…).
const api = vi.hoisted(() => ({
   connect: vi.fn(),
   disconnect: vi.fn(),
   toast: vi.fn(),
   confirm: vi.fn(),
   replace: vi.fn(),
   route: { query: {} as Record<string, string> },
   rows: [] as Record<string, unknown>[]
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => api.route,
   useRouter: () => ({
      push: vi.fn(),
      replace: api.replace,
      resolve: ({ params }: { params: { id: string } }) => ({
         fullPath: `/ops/customers/${params.id}/manage/platforms`
      })
   })
}));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: api.toast }) }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: api.confirm }) }));
vi.mock('@/composables/useDeleteAction', () => ({ useDeleteAction: () => ({}) }));
vi.mock('@/api/customer', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/customer')>()),
      usePlatformOptions: () => ({
         data: ref([
            { id: 'amazon', display_name: 'Amazon', countries: ['DE'] },
            { id: 'ebay', display_name: 'eBay', countries: ['DE'] }
         ])
      })
   };
});
vi.mock('@/api/amazon', async (importOriginal) => {
   const { ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/amazon')>()),
      useConnectAmazon: () => ({ mutateAsync: api.connect, isPending: ref(false) }),
      useDisconnectAmazon: () => ({ mutateAsync: api.disconnect, isPending: ref(false) })
   };
});

// The table is a stand-in: its header, and the connection and date cells of each row.
const Table = defineComponent({
   name: 'ResourceTable',
   props: { columns: { type: Array, default: () => [] } },
   setup:
      (_props, { slots }) =>
      () =>
         h('div', [
            slots.header?.(),
            ...api.rows.map((data) =>
               h('div', { 'data-row': data.id }, [
                  h(
                     'span',
                     { 'data-col': 'api_connection' },
                     slots.api_connection_body?.({ data })
                  ),
                  h('span', { 'data-col': 'authorized_at' }, slots.authorized_at_body?.({ data }))
               ])
            )
         ])
});

const account = (id: string, platform_id: string, extra: Record<string, unknown> = {}) => ({
   id,
   customer_id: 'k1',
   platform_id,
   countries: ['DE'],
   access: 'none',
   api_connection: 'none',
   authorized_at: null,
   seller_id: null,
   ...extra
});

const mountTab = async () => {
   const wrapper = mount(Platforms, {
      props: { id: 'k1' },
      global: {
         plugins: [i18NPlugin, PrimeVue, [abilitiesPlugin, ability, { useGlobalProperties: true }]],
         directives: { tooltip: Tooltip },
         stubs: { ResourceTable: Table, CustomLink: true }
      }
   });
   await flushPromises();
   return wrapper;
};

type Wrapper = Awaited<ReturnType<typeof mountTab>>;
const row = (wrapper: Wrapper, id: string) => wrapper.get(`[data-row="${id}"]`);
const buttonNamed = (wrapper: Pick<Wrapper, 'findAll'>, label: string) =>
   wrapper.findAll('button').filter((button) => button.text() === label);

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.route.query = {};
   api.rows = [account('a1', 'amazon'), account('e1', 'ebay')];
});

describe('Platforms tab: Connect Amazon', () => {
   it('heads the connection and the authorization date', async () => {
      const wrapper = await mountTab();
      const headers = (wrapper.getComponent(Table).props('columns') as { header: string }[]).map(
         (column) => column.header
      );
      expect(headers).toContain(en.ops.amazon.platform.api_connection);
      expect(headers).toContain(en.ops.amazon.platform.authorized_at);
   });

   it('shows Connect Amazon only on the amazon account', async () => {
      const wrapper = await mountTab();
      expect(buttonNamed(row(wrapper, 'a1'), en.ops.amazon.connect.button)).toHaveLength(1);
      expect(row(wrapper, 'a1').get('[data-api-connection]').text()).toBe(
         en.ops.amazon.api_connection.none
      );
      expect(row(wrapper, 'e1').find('button').exists()).toBe(false);
      expect(row(wrapper, 'e1').find('[data-api-connection]').exists()).toBe(false);
   });

   it('offers no action without the right to update the customer', async () => {
      ability.update([{ action: 'select', subject: 'customer' }]);
      const wrapper = await mountTab();
      expect(row(wrapper, 'a1').find('button').exists()).toBe(false);
      expect(row(wrapper, 'a1').find('[data-api-connection]').exists()).toBe(true);
   });

   it('Connect Amazon sends the browser to the consent URL', async () => {
      const consent = 'https://sellercentral-europe.amazon.com/apps/authorize/consent?state=s';
      api.connect.mockResolvedValue({ redirect: consent });
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      const wrapper = await mountTab();

      await buttonNamed(row(wrapper, 'a1'), en.ops.amazon.connect.button)[0]!.trigger('click');
      await flushPromises();

      expect(api.connect).toHaveBeenCalledWith({
         accountId: 'a1',
         returnTo: '/ops/customers/k1/manage/platforms'
      });
      expect(assign).toHaveBeenCalledWith(consent);
   });

   it('a sandbox connect shows the connected badge at once', async () => {
      api.connect.mockResolvedValue({
         account: account('a1', 'amazon', {
            api_connection: 'connected',
            authorized_at: '2026-11-06T09:30:00Z',
            seller_id: 'A2SANDBOX'
         })
      });
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      const wrapper = await mountTab();

      await buttonNamed(row(wrapper, 'a1'), en.ops.amazon.connect.button)[0]!.trigger('click');
      await flushPromises();

      expect(assign).not.toHaveBeenCalled();
      const cell = row(wrapper, 'a1');
      expect(cell.get('[data-api-connection]').text()).toBe(en.ops.amazon.api_connection.connected);
      expect(cell.text()).toContain('A2SANDBOX');
      expect(buttonNamed(cell, en.ops.amazon.connect.disconnect)).toHaveLength(1);
      expect(buttonNamed(cell, en.ops.amazon.connect.button)).toHaveLength(0);
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({
            severity: 'success',
            detail: en.ops.amazon.connect.result.connected
         })
      );
   });

   it('shows the authorization date and disconnects after a confirmation', async () => {
      api.rows = [
         account('a1', 'amazon', {
            api_connection: 'connected',
            authorized_at: '2026-11-06T09:30:00Z',
            seller_id: 'A2SELLER'
         })
      ];
      api.disconnect.mockResolvedValue(undefined);
      const wrapper = await mountTab();
      expect(row(wrapper, 'a1').get('[data-col="authorized_at"]').text()).toContain('2026-11-06');

      await buttonNamed(row(wrapper, 'a1'), en.ops.amazon.connect.disconnect)[0]!.trigger('click');
      expect(api.disconnect).not.toHaveBeenCalled();
      const { accept } = api.confirm.mock.calls[0]![0] as { accept: () => Promise<void> };
      await accept();
      expect(api.disconnect).toHaveBeenCalledWith('a1');
   });

   it('offers Reconnect on a revoked account', async () => {
      api.rows = [account('a1', 'amazon', { api_connection: 'revoked' })];
      const wrapper = await mountTab();
      expect(row(wrapper, 'a1').get('[data-api-connection]').text()).toBe(
         en.ops.amazon.api_connection.revoked
      );
      expect(buttonNamed(row(wrapper, 'a1'), en.ops.amazon.connect.reconnect)).toHaveLength(1);
   });

   it('shows ?amazon=connected as a success toast and drops the query', async () => {
      api.route.query = { amazon: 'connected', tab: 'x' };
      await mountTab();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({
            severity: 'success',
            detail: en.ops.amazon.connect.result.connected
         })
      );
      expect(api.replace).toHaveBeenCalledWith({ query: { tab: 'x' } });
   });

   it('shows ?amazon=error as an error toast', async () => {
      api.route.query = { amazon: 'error', reason: 'amazon_auth_failed' };
      await mountTab();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({
            severity: 'error',
            summary: en.ops.amazon.connect.result.error,
            detail: en.errors.amazon_auth_failed
         })
      );
      expect(api.replace).toHaveBeenCalledWith({ query: {} });
   });

   it('shows an error without a known reason with the generic text', async () => {
      api.route.query = { amazon: 'error', reason: 'something_else' };
      await mountTab();
      expect(api.toast).toHaveBeenCalledWith(
         expect.objectContaining({ severity: 'error', summary: en.ops.amazon.connect.result.error })
      );
   });
});
