import '../setup/mockMain';
import TermText from '@/components/service-components/term/TermText.vue';
import { stripTerms, TERM_SELECT } from '@/constants/terms';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { h } from 'vue';

let pinia: Pinia;
let showTerm: MockInstance;

const globalOptions = (provide: Record<symbol, unknown> = {}) => ({
   plugins: [pinia, i18NPlugin, PrimeVue] as never,
   directives: { tooltip: Tooltip },
   provide
});

const mountText = (text: string, isStatic = false, provide: Record<symbol, unknown> = {}) =>
   mount(TermText, { props: { text, static: isStatic }, global: globalOptions(provide) });

const tooltipOf = (el: Element) => (el as unknown as { $_ptooltipValue: unknown }).$_ptooltipValue;

describe('TermText', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      pinia = createPinia();
      setActivePinia(pinia);
      showTerm = vi.spyOn(useGuideStore(), 'showTerm');
   });

   it('renders plain text and marked codes', () => {
      const wrapper = mountText('Check the [[PI]] ([[S09]]).');

      expect(wrapper.text()).toBe('Check the PI (S09).');
      expect(wrapper.findAll('abbr[data-term]').map((a) => a.attributes('data-term'))).toEqual([
         'PI',
         'S09'
      ]);
   });

   it('shows the short line as a tooltip', () => {
      const pi = mountText('[[PI]]').find('abbr[data-term="PI"]');
      expect(tooltipOf(pi.element)).toBe(stripTerms(i18n.t('terms.PI.short')));

      const ol = mountText('[[OL]]-09').find('abbr[data-term="OL"]');
      expect(tooltipOf(ol.element)).toBe(stripTerms(i18n.t('glossary.incident_family.ol')));
   });

   it('opens the guide panel on the term', async () => {
      const abbr = mountText('Check the [[PI]] ([[S09]]).').find('abbr[data-term="S09"]');

      await abbr.trigger('click');
      expect(showTerm).toHaveBeenCalledWith('S09');

      showTerm.mockClear();
      await abbr.trigger('keydown.enter');
      expect(showTerm).toHaveBeenCalledWith('S09');
   });

   it('names the term by its code and describes what it does', () => {
      const abbr = mountText('[[PI]]').find('abbr[data-term="PI"]');

      expect(abbr.attributes('role')).toBe('button');
      expect(abbr.attributes('aria-label')).toBeUndefined();
      expect(abbr.text()).toBe('PI');
      expect(abbr.attributes('aria-description')).toBe(
         i18n.t('guide.panel.term_open', { code: 'PI' })
      );
   });

   it('stops the click at the term', () => {
      const parentClick = vi.fn();
      const wrapper = mount(
         { render: () => h('div', { onClick: parentClick }, h(TermText, { text: '[[PI]]' })) },
         { global: globalOptions() }
      );
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });

      wrapper.find('abbr[data-term="PI"]').element.dispatchEvent(event);

      expect(parentClick).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
   });

   it('uses the page handler when one is provided', async () => {
      const select = vi.fn();
      const wrapper = mountText('[[PI]]', false, { [TERM_SELECT as symbol]: select });

      await wrapper.find('abbr[data-term="PI"]').trigger('click');

      expect(select).toHaveBeenCalledWith('PI');
      expect(showTerm).not.toHaveBeenCalled();
   });

   it('renders static terms without a button', async () => {
      const wrapper = mountText('Close [[PI]]', true);
      const abbr = wrapper.find('abbr[data-term="PI"]');

      expect(wrapper.text()).toBe('Close PI');
      expect(abbr.exists()).toBe(true);
      expect(abbr.attributes('role')).toBeUndefined();
      expect(abbr.attributes('tabindex')).toBeUndefined();
      expect(wrapper.find('[role="button"]').exists()).toBe(false);

      await abbr.trigger('click');
      expect(showTerm).not.toHaveBeenCalled();
   });

   it('leaves an unknown code as text', () => {
      const wrapper = mountText('[[XX]] here');

      expect(wrapper.text()).toBe('XX here');
      expect(wrapper.find('abbr').exists()).toBe(false);
   });
});
