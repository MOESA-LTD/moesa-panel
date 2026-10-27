import type { Preset } from '@primeuix/themes/types';

/** PrimeVue presets the user can pick; each is loaded when first used. */
const PRESETS = {
   aura: () => import('@primeuix/themes/aura'),
   lara: () => import('@primeuix/themes/lara'),
   material: () => import('@primeuix/themes/material'),
   nora: () => import('@primeuix/themes/nora')
} satisfies Record<string, () => Promise<{ default: Preset }>>;

export type PresetName = keyof typeof PRESETS;

export const PRESET_NAMES = Object.keys(PRESETS) as [PresetName, ...PresetName[]];

export const loadPreset = async (name: PresetName): Promise<Preset> =>
   (await PRESETS[name]()).default;
