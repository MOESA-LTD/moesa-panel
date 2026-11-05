import '../setup/mockMain';
import ScopeControls from '@/layouts/dashboard/ScopeControls.vue';
import Sidebar from '@/layouts/dashboard/Sidebar.vue';
import Topbar from '@/layouts/dashboard/Topbar.vue';
import { ability } from '@/plugins/casl';
import { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

const signedIn = ref(true);

vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({
      isSignedIn: signedIn,
      currentLogoPath: ref(null),
      currentTenant: ref(null)
   })
}));
vi.mock('@/store/customerFilter/useCustomerOptions', () => ({
   useCustomerOptions: () => ({ data: ref([]) })
}));
vi.mock('@/router/menu', () => ({ useNavigationMenu: () => ({ menu: ref([]) }) }));

const BranchPicker = defineComponent({ template: '<div data-test="branch" />' });
const CustomerFilter = defineComponent({ template: '<div data-test="customer" />' });
const ScopeStub = defineComponent({
   props: { layout: { type: String, default: 'row' } },
   template: '<div data-test="scope" :data-layout="layout" />'
});

const global = () => ({
   plugins: [
      createPinia(),
      i18NPlugin,
      PrimeVue,
      [abilitiesPlugin, ability, { useGlobalProperties: true }]
   ] as never,
   stubs: {
      BranchPicker,
      CustomerFilter,
      teleport: true,
      PanelMenu: true,
      Button: true,
      AccountPopover: true,
      Popover: true,
      AppConfigurator: true,
      RouterLink: true,
      'router-link': true
   }
});

describe('ScopeControls', () => {
   beforeEach(() => {
      setActivePinia(createPinia());
      signedIn.value = true;
      ability.update([{ action: 'read', subject: 'customer' }]);
   });

   const mountControls = (layout: 'row' | 'column' = 'row') =>
      mount(ScopeControls, { props: { layout }, global: global() });

   it('shows both pickers when signed in and allowed to read customers', () => {
      const wrapper = mountControls();
      expect(wrapper.find('[data-test="branch"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="customer"]').exists()).toBe(true);
   });

   it('shows only the branch picker without the customer permission', () => {
      ability.update([]);
      const wrapper = mountControls();
      expect(wrapper.find('[data-test="branch"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="customer"]').exists()).toBe(false);
   });

   it('shows nothing when signed out', () => {
      signedIn.value = false;
      const wrapper = mountControls();
      expect(wrapper.find('[data-test="branch"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="customer"]').exists()).toBe(false);
   });

   it('stacks full width in the column layout', () => {
      const classes = mountControls('column').classes();
      expect(classes).toContain('flex-col');
      expect(classes).not.toContain('flex-row');
   });
});

describe('where ScopeControls renders', () => {
   beforeEach(() => {
      setActivePinia(createPinia());
      signedIn.value = true;
   });

   const stubbed = () => ({ ...global(), stubs: { ...global().stubs, ScopeControls: ScopeStub } });

   it('is a wide-screen row in the topbar', () => {
      const scope = mount(Topbar, { global: stubbed() }).find('[data-test="scope"]');
      expect(scope.classes()).toEqual(expect.arrayContaining(['hidden', 'md:flex']));
      expect(scope.attributes('data-layout')).toBe('row');
   });

   it('is a narrow-screen column in the sidebar', () => {
      const scope = mount(Sidebar, { global: stubbed() }).find('[data-test="scope"]');
      expect(scope.classes()).toContain('md:hidden');
      expect(scope.attributes('data-layout')).toBe('column');
   });
});
