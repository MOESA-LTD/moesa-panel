import '../setup/mockMain';
import { guideForRoute } from '@/constants/guide';
import {
   SYSTEM_GUIDE_TOPICS,
   TERM_CODES,
   TERM_SECTIONS,
   termSlug,
   termsOf
} from '@/constants/terms';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import SystemGuide from '@/views/pages/guide/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

enableAutoUnmount(afterEach);

let pinia: Pinia;
let router: Router;

const mountGuide = () =>
   mount(SystemGuide, {
      attachTo: document.body,
      global: {
         plugins: [pinia, router, i18NPlugin, PrimeVue] as never,
         directives: { tooltip: Tooltip }
      }
   });

describe('System guide', () => {
   beforeAll(() => {
      i18n.setLocaleMessage('en', en);
      Element.prototype.scrollIntoView = vi.fn();
   });
   beforeEach(() => {
      pinia = createPinia();
      setActivePinia(pinia);
      router = createRouter({
         history: createMemoryHistory(),
         routes: [{ path: '/guide', name: 'guide', component: SystemGuide }]
      });
      vi.mocked(Element.prototype.scrollIntoView).mockClear();
   });

   it('lists every term under its section', async () => {
      await router.push('/guide');
      await router.isReady();
      const wrapper = mountGuide();

      for (const section of TERM_SECTIONS) {
         const el = wrapper.find(`[id="section-${section.id}"]`);
         expect(el.exists()).toBe(true);
         for (const code of section.categories.flatMap((c) => termsOf(c))) {
            expect(el.find(`article[id="term-${termSlug(code)}"]`).exists()).toBe(true);
         }
      }
      expect(wrapper.findAll('article')).toHaveLength(TERM_CODES.length);
   });

   it('explains how the panel works', async () => {
      await router.push('/guide');
      await router.isReady();
      const text = mountGuide().text();

      for (const topic of SYSTEM_GUIDE_TOPICS) {
         expect(text).toContain(i18n.t(`system_guide.topics.${topic}.title`));
      }
   });

   it('opens a term from the address', async () => {
      await router.push('/guide#term-L_G1');
      await router.isReady();
      mountGuide();
      await flushPromises();

      const scroll = vi.mocked(Element.prototype.scrollIntoView);
      expect(scroll).toHaveBeenCalled();
      expect(scroll.mock.contexts).toContain(document.getElementById('term-L_G1'));
   });

   it('opens at its top without a term in the address', async () => {
      await router.push('/guide');
      await router.isReady();
      const wrapper = mountGuide();
      await flushPromises();

      const scroll = vi.mocked(Element.prototype.scrollIntoView);
      expect(scroll.mock.contexts).toContain(wrapper.element);
   });

   it('moves to a term clicked on the page', async () => {
      await router.push('/guide');
      await router.isReady();
      const wrapper = mountGuide();

      await wrapper.find('#term-S09 abbr[data-term="PI"]').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.hash).toBe('#term-PI');
      expect(useGuideStore().open).toBe(false);
   });

   it('has no page guide', () => {
      expect(guideForRoute([{ name: 'guide' }])).toBeNull();
   });
});
