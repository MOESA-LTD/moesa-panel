import type { MarketCellOverviewRow } from '@/api/marketMatrix';
import MarketMatrixGrid from '@/components/service-components/market-matrix-grid/MarketMatrixGrid.vue';
import { EMPTY_VALUE } from '@/constants/format';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
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

const mountGrid = (canCreate = true, cells = CELLS) =>
   mount(MarketMatrixGrid, {
      props: { cells, canCreate },
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

   it('warns of a red compliance', () => {
      const red = [{ ...CELLS[2]!, compliance: 'red' } as MarketCellOverviewRow];
      const icon = bodyCell(mountGrid(true, red), 0, 0).get('.pi-exclamation-triangle');
      expect(icon.attributes('aria-label')).toBe(i18n.t('ops.market.compliance.red'));
   });
});
