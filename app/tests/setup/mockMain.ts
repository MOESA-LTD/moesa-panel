import { vi } from 'vitest';

// The i18n locale loader imports `@/main` to reach PrimeVue's locale config. Loading the real app
// starts its router, whose auth guard loops when a view test mocks vue-router and the stores, and
// the run hangs. Import this file first in such tests: the app (and its router) stays out.
vi.mock('@/main', () => ({ app: undefined }));
