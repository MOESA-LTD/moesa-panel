import { createApp } from 'vue';
import { setApp } from '@/lib/appRef';
import App from './App.vue';

import { i18NPlugin } from '@/plugins/i18n';
import Aura from '@primeuix/themes/aura';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';

import '@/assets/style/styles.scss';
import '@/assets/style/tailwind.css';
import { abilitiesPlugin, Can } from '@casl/vue';
import { appErrorHandler } from '@lib/appErrorHandler';
import { setupTheme } from '@lib/theme/setup';
import { ability } from '@plugins/casl';
import { queryClient } from '@plugins/tanstack-query';
import { VueQueryPlugin } from '@tanstack/vue-query';
import DialogService from 'primevue/dialogservice';
import FocusTrap from 'primevue/focustrap';
import KeyFilter from 'primevue/keyfilter';
import Ripple from 'primevue/ripple';
import Tooltip from 'primevue/tooltip';
import router from './router';

export const app = createApp(App);
setApp(app);

app.config.errorHandler = appErrorHandler;

app.use(abilitiesPlugin, ability, { useGlobalProperties: true }).component(Can.name as string, Can);
app.use(createPinia());
app.use(i18NPlugin);
app.use(PrimeVue, {
   ripple: true,
   theme: {
      preset: Aura,
      options: {
         darkModeSelector: '.dark',
         order: 'tailwind-base, primevue, tailwind-utilities'
      }
   }
});

app.use(VueQueryPlugin, { queryClient });

app.use(DialogService);
app.use(ToastService);
app.use(ConfirmationService);
app.directive('keyfilter', KeyFilter);
app.directive('focustrap', FocusTrap);
app.directive('ripple', Ripple);
app.directive('tooltip', Tooltip);
app.use(router);

// The chosen preset is loaded before the first paint.
await setupTheme();

app.mount('#app');
