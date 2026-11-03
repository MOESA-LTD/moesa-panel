import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../src');
const messages = JSON.parse(readFileSync(join(SRC, 'plugins/i18n/locales/en/index.json'), 'utf-8'));

const sourceFiles = (dir: string): string[] =>
   readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(vue|ts)$/.test(name) ? [path] : [];
   });

const lookup = (key: string) =>
   key
      .split('.')
      .reduce<unknown>(
         (node, part) =>
            node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
         messages
      );

describe('i18n keys used in the code', () => {
   it('every literal key passed to t / $t exists in the source locale', () => {
      const missing = sourceFiles(SRC).flatMap((file) =>
         [
            ...readFileSync(file, 'utf-8').matchAll(
               /\b(?:\$t|t)\(\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/gi
            )
         ]
            .map((match) => match[1])
            .filter((key) => lookup(key) === undefined)
            .map((key) => `${relative(SRC, file)}: ${key}`)
      );
      expect(missing).toEqual([]);
   });
});
