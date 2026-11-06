import type { MarketCellOverviewRow } from '@/api/marketMatrix';
import MarketMatrixGrid from '@/components/service-components/market-matrix-grid/MarketMatrixGrid.vue';
import { EMPTY_VALUE } from '@/constants/format';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DataTable from 'primevue/datatable';
import Tag from 'primevue/tag';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// The S05 pivot: THO-MOP (p1) on Amazon DE and FR, THO-TIPS (p2) on eBay DE.
const cell = (
   id: string,
   product: string,
   sku: string,
   platform: string,
   name: string,
   country: string
) =>
   ({
      id,
      product_id: product,
      sku,
      product_name: sku,
      platform_id: platform,
      platform_name: name,
      country,
      cell_key: `${platform}_${country}`,
      status: 'candidate',
      compliance: 'pending'
   }) as MarketCellOverviewRow;

const CELLS = [
   cell('c1', 'p2', 'THO-TIPS', 'ebay', 'eBay', 'DE'),
   cell('c2', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'FR'),
   cell('c3', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'DE')
];

const mountGrid = (
   canCreate = true,
   cells = CELLS,
   state: { loading?: boolean; error?: boolean } = {}
) =>
   mount(MarketMatrixGrid, {
      props: { cells, canCreate, ...state },
      global: { plugins: [i18NPlugin, PrimeVue], directives: { tooltip: Tooltip } }
   });

/** The body cell of a row (0 = THO-MOP, 1 = THO-TIPS) and matrix column (0 = Amazon DE). */
const bodyCell = (wrapper: ReturnType<typeof mountGrid>, row: number, column: number) =>
   wrapper.findAll('tbody tr')[row]!.findAll('td')[column + 1]!;

enableAutoUnmount(afterEach);

describe('MarketMatrixGrid', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('heads one column per platform and country', () => {
      const headers = mountGrid()
         .findAll('thead th')
         .map((th) => th.text().trim());
      expect(headers.slice(1)).toEqual(['Amazon DE', 'Amazon FR', 'eBay DE']);
   });

   it('marks a cell that is not opened', () => {
      expect(bodyCell(mountGrid(), 1, 0).text()).toBe('—');
      expect(EMPTY_VALUE).toBe('—');
   });

   it('asks to add an empty cell', async () => {
      const wrapper = mountGrid(true);
      await bodyCell(wrapper, 1, 0).get('button').trigger('click');
      expect(wrapper.emitted('add')).toEqual([
         [{ productId: 'p2', platformId: 'amazon', country: 'DE' }]
      ]);

      expect(bodyCell(mountGrid(false), 1, 0).find('button').exists()).toBe(false);
   });

   it('opens a cell', async () => {
      const wrapper = mountGrid();
      const tag = bodyCell(wrapper, 0, 0).getComponent(Tag);
      expect(tag.text()).toBe(i18n.t('ops.market.status.candidate'));
      await tag.trigger('click');
      expect(wrapper.emitted('open')).toEqual([['c3']]);
   });

   it('shows the loading state', () => {
      const wrapper = mountGrid(true, [], { loading: true });
      expect(wrapper.getComponent(DataTable).props('loading')).toBe(true);
      expect(mountGrid(true, []).getComponent(DataTable).props('loading')).toBe(false);
   });

   it('says the cells could not be loaded instead of the empty hint', () => {
      const failed = mountGrid(true, [], { error: true });
      expect(failed.get('[data-test="market-load-error"]').text()).toBe(
         i18n.t('ops.market.load_error')
      );
      expect(failed.text()).not.toContain(i18n.t('ops.market.no_cells'));

      const empty = mountGrid(true, []);
      expect(empty.find('[data-test="market-load-error"]').exists()).toBe(false);
      expect(empty.text()).toContain(i18n.t('ops.market.no_cells'));
   });

   it('shows the listing state of an API-managed cell', () => {
      const badge = (
         state: string | null,
         extra: Partial<MarketCellOverviewRow> = {},
         connected?: string[]
      ) => {
         const amazon = {
            ...CELLS[2]!,
            customer_id: 'k1',
            listing_state: state,
            ...extra
         } as MarketCellOverviewRow;
         const wrapper = mount(MarketMatrixGrid, {
            props: { cells: [amazon], canCreate: true, amazonConnected: connected },
            global: { plugins: [i18NPlugin, PrimeVue], directives: { tooltip: Tooltip } }
         });
         return bodyCell(wrapper, 0, 0).find('[data-listing-state]');
      };

      for (const [state, severity] of [
         ['draft', 'secondary'],
         ['ready', 'info'],
         ['submitted', 'warn'],
         ['live', 'success'],
         ['issues', 'danger']
      ] as const) {
         const tag = badge(state);
         expect(tag.text()).toBe(i18n.t(`ops.amazon.state.${state}`));
         expect(tag.attributes('data-listing-state')).toBe(state);
         expect(tag.classes()).toContain(`p-tag-${severity}`);
      }

      // A state of a newer database: named as unknown, not dropped.
      const unknown = badge('withdrawn');
      expect(unknown.text()).toBe(i18n.t('ops.amazon.cell.state_unknown'));
      expect(unknown.classes()).toContain('p-tag-secondary');

      // A cell without a state, and a cell of another platform, show no listing badge.
      expect(badge(null).exists()).toBe(false);
      expect(badge('live', { platform_id: 'ebay', cell_key: 'ebay_DE' }).exists()).toBe(false);

      // N2: a customer whose account is not connected shows draft whatever the stored state.
      expect(badge('live', {}, []).attributes('data-listing-state')).toBe('draft');
      expect(badge('live', {}, ['k1']).attributes('data-listing-state')).toBe('live');
   });

   it('warns of a red compliance', () => {
      const red = [{ ...CELLS[2]!, compliance: 'red' } as MarketCellOverviewRow];
      const icon = bodyCell(mountGrid(true, red), 0, 0).get('.pi-exclamation-triangle');
      expect(icon.attributes('aria-label')).toBe(i18n.t('ops.market.compliance.red'));
   });
});
