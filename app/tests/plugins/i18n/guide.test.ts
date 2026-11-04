import { GUIDE_PAGES, PAGE_GUIDES, visibleTasks } from '@/constants/guide';
import opsRoutes from '@/router/routes/ops';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouteRecordRaw } from 'vue-router';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');

type Tree = { [k: string]: Tree | string };

const messages = (locale: string) =>
   JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'index.json'), 'utf-8')) as Tree;

const lookup = (tree: Tree, path: string): unknown =>
   path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);

const isText = (value: unknown) => typeof value === 'string' && value !== '';

/** Every named route with its label, the dashboard included. */
const labels = (routes: RouteRecordRaw[]): [string, unknown][] =>
   routes.flatMap((route) => [
      ...(typeof route.name === 'string'
         ? [[route.name, route.meta?.label] as [string, unknown]]
         : []),
      ...labels(route.children ?? [])
   ]);

describe('page guide copy', () => {
   it.each(['en', 'tr'])('%s has the copy of every guide', (locale) => {
      const tree = messages(locale);
      const missing = GUIDE_PAGES.flatMap((page) => {
         const base = `guide.pages.${page}`;
         const keys = [`${base}.purpose`];
         const extra: string[] = [];
         for (const task of PAGE_GUIDES[page].tasks) {
            const prefix = `${base}.tasks.${task.id}`;
            keys.push(`${prefix}.title`);
            for (let n = 1; n <= task.steps; n++) keys.push(`${prefix}.steps.${n}`);
            if (lookup(tree, `${prefix}.steps.${task.steps + 1}`) !== undefined) {
               extra.push(`${prefix}.steps.${task.steps + 1}`);
            }
         }
         return [...keys.filter((key) => !isText(lookup(tree, key))), ...extra];
      });
      expect(missing).toEqual([]);
   });

   it('links only to labelled routes', () => {
      const routes = new Map([
         ['dashboard', 'route.label.dashboard'] as [string, unknown],
         ...labels(opsRoutes)
      ]);
      const unlabelled = GUIDE_PAGES.flatMap((page) =>
         [PAGE_GUIDES[page].route, ...PAGE_GUIDES[page].related].filter(
            (name) => !isText(routes.get(name))
         )
      );
      expect(unlabelled).toEqual([]);
   });

   it('gives every page at least two tasks', () => {
      expect(GUIDE_PAGES.filter((p) => PAGE_GUIDES[p].tasks.length < 2)).toEqual([]);
   });

   it('labels every needed permission', () => {
      const fields = (lookup(messages('en'), 'fields') ?? {}) as Tree;
      const missing = GUIDE_PAGES.flatMap((page) =>
         PAGE_GUIDES[page].tasks
            .map((t) => t.permission.subject)
            .filter((subject) => !isText(fields[subject] ?? lookup(fields, `${subject}.label`)))
      );
      expect(missing).toEqual([]);
   });

   it('gives the settings page one task per role', () => {
      expect(visibleTasks(PAGE_GUIDES.setting, (a) => a === 'read').map((t) => t.id)).toEqual([
         'read_setting'
      ]);
   });
});
