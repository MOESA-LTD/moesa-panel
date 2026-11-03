// Brings every locale's messages in line with the source locale (en): keys missing from a locale
// are added with the English text, keys the source no longer has are removed, translations are
// kept. Only `tr` is translated by hand; the others are filled in later (i18n-build).
//
// Usage (from app/): pnpm i18n-sync
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_LOCALE = 'en';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The target's messages with exactly the source's keys: a key the target translates keeps its
 * translation, any other takes the source value. The target's key order is kept (so a sync only
 * shows the keys it added or removed); added keys come last. Neither argument is changed.
 */
export function syncLocales(source, target) {
   const translated = isObject(target) ? target : {};
   const keys = [
      ...Object.keys(translated).filter((key) => Object.hasOwn(source, key)),
      ...Object.keys(source).filter((key) => !Object.hasOwn(translated, key))
   ];
   return Object.fromEntries(
      keys.map((key) => {
         const sourceValue = source[key];
         const targetValue = translated[key];
         if (isObject(sourceValue)) {
            return [key, syncLocales(sourceValue, targetValue)];
         }
         return [
            key,
            targetValue !== undefined && !isObject(targetValue) ? targetValue : sourceValue
         ];
      })
   );
}

function main(localesDir) {
   const readMessages = (locale) =>
      JSON.parse(readFileSync(join(localesDir, locale, 'index.json'), 'utf-8'));
   const source = readMessages(SOURCE_LOCALE);
   const locales = readdirSync(localesDir).filter(
      (name) => name !== SOURCE_LOCALE && statSync(join(localesDir, name)).isDirectory()
   );

   for (const locale of locales) {
      const current = readMessages(locale);
      const synced = syncLocales(source, current);
      if (JSON.stringify(synced) === JSON.stringify(current)) continue;
      writeFileSync(join(localesDir, locale, 'index.json'), `${JSON.stringify(synced, null, 3)}\n`);
      console.log(`${locale}: synced`);
   }
}

// Run as a script (node src/script/sync-locales.mjs), not when imported (e.g. by the tests).
const scriptPath = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : null;
if (scriptPath && process.argv[1] && resolve(process.argv[1]) === scriptPath) {
   main(resolve(scriptPath, '../../plugins/i18n/locales'));
}
