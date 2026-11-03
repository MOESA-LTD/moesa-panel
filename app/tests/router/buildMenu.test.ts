import { buildMenu } from '@/router/buildMenu';
import accountRoutes from '@/router/routes/account';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
   createMemoryHistory,
   createRouter,
   type RouteMeta,
   type RouteRecordNormalized
} from 'vue-router';

vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ isSignedIn: true }) }));

const record = (
   path: string,
   name: string,
   meta: RouteMeta = {},
   extra: Partial<RouteRecordNormalized> = {}
) => ({ path, name, meta, ...extra }) as RouteRecordNormalized;

const build = (records: RouteRecordNormalized[], granted: string[] = []) =>
   buildMenu(records, {
      can: (action, subject) => granted.includes(`${action}:${subject}`),
      t: (key) => `t(${key})`
   });

const read = (subject: string) => ({ requiredPermissions: [{ action: 'read', subject }] });

describe('buildMenu', () => {
   it('nests routes by path segment, leaving params out', () => {
      const menu = build(
         [
            record('/:locale/client/list', 'client-list', read('client')),
            record('/:locale/client', 'client'),
            record('/:locale/client/:id/manage', 'client-manage', { visible: false })
         ],
         ['read:client']
      );

      expect(menu.map((item) => item.name)).toEqual(['client']);
      // The params-free path of client-manage is client/manage.
      expect(menu[0].items?.map((item) => item.name)).toEqual(['client-list']);
   });

   it('keys entries by route name, so remembered expanded entries survive reordering', () => {
      const [client] = build([record('/client', 'client', { visible: true })]);
      expect(client.key).toBe('client');
   });

   it('orders by meta.index, counting on from the previous sibling and from the parent', () => {
      const menu = build([
         record('/b', 'b', { visible: true }),
         record('/a', 'a', { visible: true, index: -1 }),
         record('/c', 'c', { visible: true, index: Infinity }),
         record('/b/x', 'b-x', { visible: true }),
         record('/b/y', 'b-y', { visible: true, index: 0 })
      ]);

      expect(menu.map((item) => [item.name, item.index])).toEqual([
         ['a', -1],
         ['b', 1],
         ['c', Infinity]
      ]);
      expect(menu[1].items?.map((item) => [item.name, item.index])).toEqual([
         ['b-y', 0],
         ['b-x', 2]
      ]);
   });

   describe('visibility', () => {
      it('follows meta.visible first, also as a getter', () => {
         const [shown, hidden] = build([
            record('/shown', 'shown', { visible: () => true, ...read('nothing') }),
            record('/hidden', 'hidden', { visible: false })
         ]);
         expect(shown.visible).toBe(true);
         expect(hidden.visible).toBe(false);
      });

      it('needs every required permission', () => {
         const menu = build(
            [
               record('/one', 'one', read('client')),
               record('/both', 'both', {
                  requiredPermissions: [
                     { action: 'read', subject: 'client' },
                     { action: 'read', subject: 'stock' }
                  ]
               })
            ],
            ['read:client']
         );
         expect(menu.map((item) => item.visible)).toEqual([true, false]);
      });

      it('shows a section with visible children and drops its hidden children', () => {
         const [section] = build(
            [
               record('/section', 'section'),
               record('/section/allowed', 'allowed', read('client')),
               record('/section/denied', 'denied', read('stock'))
            ],
            ['read:client']
         );
         expect(section.visible).toBe(true);
         expect(section.items?.map((item) => item.name)).toEqual(['allowed']);
      });

      it('hides an empty top-level section but shows a nested entry without rules', () => {
         const menu = build([
            record('/section', 'section'),
            record('/section/denied', 'denied', read('stock')),
            record('/other', 'other'),
            record('/other/free', 'free')
         ]);
         const section = menu.find((item) => item.name === 'section')!;
         const other = menu.find((item) => item.name === 'other')!;
         expect(section.visible).toBe(false);
         expect(section.items).toBeUndefined();
         expect(other.visible).toBe(true);
         expect(other.items?.map((item) => item.name)).toEqual(['free']);
      });
   });

   it('skips alias records, which repeat their route', () => {
      const otp = record('/otp', 'auth-otp', { visible: false });
      const menu = build([
         otp,
         record('/forgot-password', 'auth-otp', { visible: false }, { aliasOf: otp })
      ]);
      expect(menu).toHaveLength(1);
   });

   it('translates the label, falling back to the path segment', () => {
      const [labelled, plain] = build([
         record('/a', 'a', { visible: true, label: 'route.label.a' }),
         record('/b', 'b', { visible: true })
      ]);
      expect(labelled.label).toBe('t(route.label.a)');
      expect(plain.label).toBe('t(b)');
   });

   it('resolves context menu items given as a ref or getter', () => {
      const items = [{ label: 'x' }];
      const [plain, fromRef, none] = build([
         record('/a', 'a', { visible: true, index: 1, contextMenuItems: items }),
         record('/b', 'b', { visible: true, index: 2, contextMenuItems: ref(items) }),
         record('/c', 'c', { visible: true, index: 3 })
      ]);
      expect(plain.contextMenuItems).toEqual(items);
      expect(fromRef.contextMenuItems).toEqual(items);
      expect(none.contextMenuItems).toEqual([]);
   });

   it('passes meta.replace on to the link', () => {
      const [item] = build([record('/login', 'login', { visible: false, replace: true })]);
      expect(item.route.replace).toBe(true);
   });
   it('shows an entry of a module outside the plan locked, without its children', () => {
      const menu = buildMenu(
         [
            record('/stock', 'stock', read('stock')),
            record('/stock/list', 'stock-list', read('stock')),
            record('/stock/add', 'stock-add', { visible: false, ...read('stock') }),
            record('/client', 'client', read('client'))
         ],
         {
            can: () => false,
            t: (key) => key,
            lockedModule: (subject) => (subject === 'stock' ? 'stock' : null)
         }
      );

      expect(menu.map(({ name, visible, locked }) => [name, visible, locked])).toEqual([
         ['stock', true, 'stock'],
         ['client', false, undefined]
      ]);
      expect(menu[0]!.items).toBeUndefined();
   });
});

describe('account section', () => {
   const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', children: accountRoutes }]
   });
   const routeAt = (path: string) => router.getRoutes().find((route) => route.path === path)!;

   it('has the Profile and Security sections, without the old settings links', () => {
      const account = build(router.getRoutes()).find((item) => item.name === 'account')!;
      expect(account.items?.map((item) => item.name)).toEqual([
         'account-profile',
         'account-security'
      ]);
   });

   it('sends the old settings links to their sections', () => {
      expect(routeAt('/account/settings/update-password').redirect).toEqual({
         name: 'account-security'
      });
      expect(routeAt('/account/settings/update-profile').redirect).toEqual({
         name: 'account-profile'
      });
      expect(routeAt('/account/settings').redirect).toEqual({ name: 'account-profile' });
   });

   it('opens Profile at /account', () => {
      expect(routeAt('/account').redirect).toEqual({ name: 'account-profile' });
   });
});
