import { buildAccountMenu } from '@/components/service-components/account/accountMenu';
import en from '@/plugins/i18n/locales/en/index.json';
import type { NavigationItem } from '@/router/menu';
import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const item = (key: string) => ({ key, label: key }) as NavigationItem;

describe('buildAccountMenu', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('adds a separator and the logout action after the menu items', () => {
      const menu = buildAccountMenu([item('a'), item('b')], () => {});
      expect(menu).toHaveLength(4);
      expect(menu.slice(0, 2).map(({ key }) => key)).toEqual(['a', 'b']);
      expect(menu[2]).toEqual({ separator: true });
      expect(menu[3]).toMatchObject({
         key: 'logout',
         label: i18n.t('account.logout'),
         icon: PrimeIcons.SIGN_OUT
      });
   });

   it('runs the passed function from the logout command', () => {
      const logout = vi.fn();
      const menu = buildAccountMenu([item('a')], logout);
      menu.at(-1)!.command!({} as never);
      expect(logout).toHaveBeenCalledOnce();
   });

   it('is only the logout action without menu items', () => {
      const menu = buildAccountMenu(undefined, () => {});
      expect(menu.map(({ key }) => key)).toEqual(['logout']);
   });
});
