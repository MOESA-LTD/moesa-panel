import type { NavigationGuardWithThis } from 'vue-router';

/** Loads the messages of the locale in the URL, or redirects to the fallback locale. */
export const i18NBeforeEach: NavigationGuardWithThis<undefined> = async (to) => {
   const toLocale = to.params.locale as string;

   if (!SUPPORTED_LOCALES.value.find((lang) => lang.value === toLocale)) {
      return { ...to, params: { ...to.params, locale: i18n.fallbackLocale.value as string } };
   }

   await loadLocaleMessages(toLocale);

   locale.value = toLocale;
};
