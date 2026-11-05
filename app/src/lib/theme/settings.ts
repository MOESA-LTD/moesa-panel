import { getStorage } from '@/lib/storage';
import * as z from 'zod';
import { PRIMARY_COLORS, SURFACES } from './palettes';
import { PRESET_NAMES } from './presets';

export const SETTINGS_KEY = 'app-settings';
/** Where the former useLayout composable kept them, read once by migrateLegacySettings. */
export const LEGACY_SETTINGS_KEY = 'app-state';

export const SIDEBAR_MODES = ['static', 'auto', 'mini', 'reveal', 'overlay'] as const;
export type SidebarMode = (typeof SIDEBAR_MODES)[number];

const colorName = (colors: { name: string }[]) =>
   z.string().refine((name) => colors.some((color) => color.name === name));

const DEFAULT_PROFILE = {
   preset: 'aura',
   primary: 'orange',
   surface: 'viva',
   uiScale: 1,
   sidebarMode: 'static'
} as const;

// Each field falls back to its default on its own, so one bad value does not reset the rest.
const profileSchema = z.object({
   preset: z.enum(PRESET_NAMES).catch(DEFAULT_PROFILE.preset),
   primary: colorName(PRIMARY_COLORS).catch(DEFAULT_PROFILE.primary),
   surface: colorName(SURFACES).catch(DEFAULT_PROFILE.surface),
   uiScale: z.number().min(0.5).max(1.5).catch(DEFAULT_PROFILE.uiScale),
   /** The chosen mode; small screens show the sidebar as an overlay without changing it. */
   sidebarMode: z.enum(SIDEBAR_MODES).catch(DEFAULT_PROFILE.sidebarMode)
});

/** The look and layout choices; `light` and `dark` differ only while they are not linked. */
export const settingsSchema = z.object({
   linked: z.boolean().catch(true),
   // Factories: each profile (and each parse) gets its own object, never a shared default.
   light: profileSchema.catch(() => ({ ...DEFAULT_PROFILE })),
   dark: profileSchema.catch(() => ({ ...DEFAULT_PROFILE })),
   sidebarActive: z.boolean().catch(false),
   /** Expanded sidebar groups, by route name. */
   expandedMenu: z.record(z.string(), z.boolean()).catch(() => ({}))
});

export type ThemeProfile = z.infer<typeof profileSchema>;
export type Settings = z.infer<typeof settingsSchema>;

/** Fresh default settings; a new object on every call. */
export const defaultSettings = (): Settings => settingsSchema.parse({});

/** For comparisons only; use defaultSettings() for settings that will change. */
export const DEFAULT_SETTINGS: Readonly<Settings> = defaultSettings();

/** Stored text to settings; anything unreadable falls back to the defaults. */
export function parseSettings(raw: string | null): Settings {
   try {
      return settingsSchema.parse(raw ? JSON.parse(raw) : {});
   } catch {
      return defaultSettings();
   }
}

type LegacyProfile = {
   preset?: unknown;
   primary?: unknown;
   surface?: unknown;
   UIScale?: unknown;
   sidebarMode?: unknown;
   sidebarModeDesktop?: unknown;
};

/** A profile in app-state; on small screens sidebarMode had been replaced with 'overlay'. */
const fromLegacyProfile = (profile: LegacyProfile = {}) => ({
   preset: profile.preset,
   primary: profile.primary,
   surface: profile.surface,
   uiScale: profile.UIScale,
   sidebarMode: profile.sidebarModeDesktop ?? profile.sidebarMode
});

/** Positional keys ("1_2") from before menu entries were keyed by route name. */
const POSITIONAL_KEY = /^\d+(_\d+)*$/;

/** Moves app-state to the current settings once, then removes it. */
export function migrateLegacySettings(storage: Storage | null = getStorage()) {
   if (!storage) return;
   const raw = storage.getItem(LEGACY_SETTINGS_KEY);
   if (raw === null) return;

   if (storage.getItem(SETTINGS_KEY) === null) {
      let legacy: LegacyProfile & {
         isLinked?: unknown;
         sidebarActive?: unknown;
         activeMenuItem?: Record<string, unknown>;
         dark?: LegacyProfile;
      } = {};
      try {
         legacy = JSON.parse(raw) ?? {};
      } catch {
         // Unreadable: start from the defaults.
      }

      const settings = settingsSchema.parse({
         linked: legacy.isLinked,
         light: fromLegacyProfile(legacy),
         dark: fromLegacyProfile(legacy.dark),
         sidebarActive: legacy.sidebarActive,
         expandedMenu: Object.fromEntries(
            Object.entries(legacy.activeMenuItem ?? {}).filter(
               ([key, expanded]) => !POSITIONAL_KEY.test(key) && typeof expanded === 'boolean'
            )
         )
      });
      storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
   }

   storage.removeItem(LEGACY_SETTINGS_KEY);
}
