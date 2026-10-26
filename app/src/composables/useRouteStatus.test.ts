import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { provideRouteStatus, useRouteLoading, type RouteStatus } from './useRouteStatus';

const Consumer = defineComponent({
   setup() {
      const loading = useRouteLoading();
      return () => h('span', String(loading.value));
   }
});

const mountWithProvider = () => {
   let setStatus: (status: RouteStatus) => void = () => {};
   const wrapper = mount(
      defineComponent({
         setup() {
            setStatus = provideRouteStatus().setStatus;
            return () => h(Consumer);
         }
      })
   );
   return { wrapper, setStatus: (status: RouteStatus) => setStatus(status) };
};

describe('useRouteStatus', () => {
   it('is false outside of a provider', () => {
      expect(mount(Consumer).text()).toBe('false');
   });

   it('propagates status changes to descendants reactively', async () => {
      const { wrapper, setStatus } = mountWithProvider();
      expect(wrapper.text()).toBe('false');

      setStatus('pending');
      await nextTick();
      expect(wrapper.text()).toBe('true');

      setStatus('fallback');
      await nextTick();
      expect(wrapper.text()).toBe('true');

      setStatus('resolve');
      await nextTick();
      expect(wrapper.text()).toBe('false');
   });
});
