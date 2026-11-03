import { logoutBeforeEnter } from '@/router/middlewares/before-enter/logout';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';

const confirmLogout = vi.fn();
vi.mock('@/composables/useLogout', () => ({ useLogout: () => ({ confirmLogout }) }));

const auth = { isSignedIn: false, initialized: Promise.resolve() };
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));

const run = (to: string, fromMatched: object[] = [{}]) =>
   (logoutBeforeEnter as (...args: unknown[]) => unknown).call(
      undefined,
      { name: to } as RouteLocationNormalized,
      { matched: fromMatched } as RouteLocationNormalized,
      () => {}
   );

describe('logoutBeforeEnter', () => {
   beforeEach(() => {
      confirmLogout.mockReset();
      auth.isSignedIn = false;
   });

   it('lets a signed-out user through without asking', async () => {
      expect(await run('auth-login')).toBe(true);
      expect(confirmLogout).not.toHaveBeenCalled();
   });

   it('ends on the login page once a signed-in user confirms', async () => {
      auth.isSignedIn = true;
      confirmLogout.mockResolvedValue(true);
      expect(await run('auth-login')).toBe(true);
      expect(await run('auth-register')).toEqual({ name: 'auth-login' });
   });

   it('stays put when declined, or opens the profile on a first load', async () => {
      auth.isSignedIn = true;
      confirmLogout.mockResolvedValue(false);
      expect(await run('auth-login', [{}])).toBe(false);
      expect(await run('auth-login', [])).toEqual({ name: 'account-profile' });
   });
});
