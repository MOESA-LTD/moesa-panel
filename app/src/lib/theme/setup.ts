import { useThemeStore } from '@/store/theme';
import { locale } from '@plugins/i18n';
import { $t, updatePreset, updateSurfacePalette } from '@primeuix/themes';
import { effectScope, watch, watchEffect } from 'vue';
import { isRtlLocale } from './direction';
import { findPalette, presetExtension, SURFACES } from './palettes';
import { loadPreset } from './presets';

/**
 * Applies the theme settings to PrimeVue and the document, now and whenever they change. Resolves
 * once the chosen preset is loaded, so main.ts can mount without a flash of the default one.
 * Needs Pinia installed.
 */
export function setupTheme() {
   const theme = useThemeStore();
   const root = document.documentElement;

   // A preset that finishes loading after a newer one was picked is dropped.
   let latest = 0;
   const applyPreset = async () => {
      const request = ++latest;
      const preset = await loadPreset(theme.profile.preset);
      if (request !== latest) return;

      $t()
         .preset(preset)
         .preset(presetExtension(theme.profile.primary))
         .surfacePalette(findPalette(SURFACES, theme.profile.surface))
         .use({ useDefaultOptions: true });
   };

   // Lives as long as the app; detached from whichever component happens to run first.
   effectScope(true).run(() => {
      watch(() => theme.profile.preset, applyPreset);
      watch(
         () => theme.profile.primary,
         (primary) => updatePreset(presetExtension(primary))
      );
      watch(
         () => theme.profile.surface,
         (surface) => updateSurfacePalette(findPalette(SURFACES, surface))
      );
      watchEffect(() => root.style.setProperty('--ui-scale', String(theme.profile.uiScale)));
      watchEffect(() => root.setAttribute('dir', isRtlLocale(locale.value) ? 'rtl' : 'ltr'));
   });

   return applyPreset();
}
