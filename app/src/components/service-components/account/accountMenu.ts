import type { NavigationItem } from '@/router/menu';
import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import type { MenuItem } from 'primevue/menuitem';

/** The account popover's menu: the account section's pages, then the logout action. */
export const buildAccountMenu = (
   items: NavigationItem[] | undefined,
   logout: () => void
): MenuItem[] => [
   ...(items?.length ? [...items, { separator: true }] : []),
   { key: 'logout', label: i18n.t('account.logout'), icon: PrimeIcons.SIGN_OUT, command: logout }
];
