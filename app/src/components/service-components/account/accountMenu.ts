import type { NavigationItem } from '@/router/menu';
import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import type { MenuItem } from 'primevue/menuitem';

/**
 * The account popover's menu: the account section's pages, then the system guide and the logout
 * action. The guide opens through a command, as its route is kept out of the menus and the
 * popover's route links would not render it.
 */
export const buildAccountMenu = (
   items: NavigationItem[] | undefined,
   logout: () => void,
   openGuide: () => void
): MenuItem[] => [
   ...(items?.length ? [...items, { separator: true }] : []),
   {
      key: 'guide',
      label: i18n.t('route.label.guide'),
      icon: PrimeIcons.BOOK,
      route: { name: 'guide' },
      command: openGuide
   },
   { key: 'logout', label: i18n.t('account.logout'), icon: PrimeIcons.SIGN_OUT, command: logout }
];
