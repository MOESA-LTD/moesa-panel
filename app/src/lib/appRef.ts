import type { App } from 'vue';

// The app instance, set by main.ts once it exists. Modules that need it (the i18n locale loader
// reads PrimeVue's locale config) take it from here instead of importing main, which would start
// the whole app, router included, from a unit test.
let current: App | null = null;

export const setApp = (app: App): void => {
   current = app;
};

export const getApp = (): App | null => current;
