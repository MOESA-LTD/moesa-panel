import { describe, expect, it } from 'vitest';
import { syncLocales } from '../../src/script/sync-locales.mjs';

describe('syncLocales', () => {
   const source = {
      common: { save: 'Save', cancel: 'Cancel' },
      setting: { title: 'Settings' }
   };

   it('adds keys missing from the target with the source value', () => {
      expect(syncLocales(source, { common: { save: 'Kaydet' } })).toEqual({
         common: { save: 'Kaydet', cancel: 'Cancel' },
         setting: { title: 'Settings' }
      });
   });

   it('removes keys the source does not have', () => {
      expect(
         syncLocales(source, {
            common: { save: 'Kaydet', cancel: 'İptal', old: 'Eski' },
            gone: { title: 'Yok' },
            setting: { title: 'Ayarlar' }
         })
      ).toEqual({
         common: { save: 'Kaydet', cancel: 'İptal' },
         setting: { title: 'Ayarlar' }
      });
   });

   it("keeps existing translations in the target's key order, adding new keys last", () => {
      const result = syncLocales(source, {
         setting: { title: 'Ayarlar' },
         common: { cancel: 'İptal' }
      });
      expect(result).toEqual({
         common: { save: 'Save', cancel: 'İptal' },
         setting: { title: 'Ayarlar' }
      });
      expect(Object.keys(result)).toEqual(['setting', 'common']);
      expect(Object.keys(result.common)).toEqual(['cancel', 'save']);
   });

   it('replaces a value whose shape differs from the source', () => {
      expect(syncLocales(source, { common: 'Ortak', setting: { title: { x: 'y' } } })).toEqual(
         source
      );
   });

   it('does not change its arguments', () => {
      const target = { common: { save: 'Kaydet' } };
      syncLocales(source, target);
      expect(target).toEqual({ common: { save: 'Kaydet' } });
   });
});
