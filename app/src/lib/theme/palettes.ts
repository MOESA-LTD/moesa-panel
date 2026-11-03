import tailwindConfig from '@/../tailwind.config.js';
import tailwindColors from 'tailwindcss/colors';

/** A colour scale, e.g. `{ 50: '#…', …, 950: '#…' }`. */
export type Palette = Record<string, string>;
export type NamedPalette = { name: string; palette: Palette };

// Renamed in Tailwind 3; reading them logs a deprecation warning.
const DEPRECATED = ['lightBlue', 'warmGray', 'trueGray', 'coolGray', 'blueGray'];
const NOT_SCALES = ['white', 'black', 'transparent', 'current', 'inherit'];

const extendedColors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, Palette>;
const builtInColors = tailwindColors as unknown as Record<string, Palette>;

/** The project's colours (tailwind.config.js) first, then Tailwind's; neither module is changed. */
const scales: NamedPalette[] = [
   ...new Set([...Object.keys(extendedColors), ...Object.keys(builtInColors)])
]
   .filter((name) => !DEPRECATED.includes(name) && !NOT_SCALES.includes(name))
   .map((name) => ({
      name,
      palette: { ...builtInColors[name], ...extendedColors[name] }
   }));

/** "noir" uses the surface colours as primary (see presetExtension). */
export const NOIR = 'noir';

export const PRIMARY_COLORS: NamedPalette[] = [
   { name: NOIR, palette: {} },
   ...scales.map(({ name, palette }) => ({ name, palette: { 0: '#ffffff', ...palette } }))
];

export const SURFACES: NamedPalette[] = PRIMARY_COLORS.filter(({ name }) => name !== NOIR);

export const findPalette = (colors: NamedPalette[], name: string) =>
   colors.find((color) => color.name === name)?.palette;

const surfaceScale = Object.fromEntries(
   ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((shade) => [
      shade,
      `{surface.${shade}}`
   ])
);

/** The preset changes that make `primary` the primary colour. */
export function presetExtension(primary: string) {
   if (primary === NOIR) {
      return {
         semantic: {
            primary: surfaceScale,
            colorScheme: {
               light: {
                  primary: {
                     color: '{primary.950}',
                     contrastColor: '#ffffff',
                     hoverColor: '{primary.800}',
                     activeColor: '{primary.700}'
                  },
                  highlight: {
                     background: '{primary.950}',
                     focusBackground: '{primary.700}',
                     color: '#ffffff',
                     focusColor: '#ffffff'
                  }
               },
               dark: {
                  primary: {
                     color: '{primary.50}',
                     contrastColor: '{primary.950}',
                     hoverColor: '{primary.200}',
                     activeColor: '{primary.300}'
                  },
                  highlight: {
                     background: '{primary.50}',
                     focusBackground: '{primary.300}',
                     color: '{primary.950}',
                     focusColor: '{primary.950}'
                  }
               }
            }
         }
      };
   }

   return {
      semantic: {
         primary: findPalette(PRIMARY_COLORS, primary),
         colorScheme: {
            light: {
               primary: {
                  color: '{primary.500}',
                  contrastColor: '#ffffff',
                  hoverColor: '{primary.600}',
                  activeColor: '{primary.700}'
               },
               highlight: {
                  background: '{primary.50}',
                  focusBackground: '{primary.100}',
                  color: '{primary.700}',
                  focusColor: '{primary.800}'
               }
            },
            dark: {
               primary: {
                  color: '{primary.400}',
                  contrastColor: '{surface.900}',
                  hoverColor: '{primary.300}',
                  activeColor: '{primary.200}'
               },
               highlight: {
                  background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
                  focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
                  color: 'rgba(255,255,255,.87)',
                  focusColor: 'rgba(255,255,255,.87)'
               }
            }
         }
      }
   };
}
