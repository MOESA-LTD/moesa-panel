import tailwindConfig from '@/../tailwind.config.js';
import router from '@/router';
import { $t, updatePreset, updateSurfacePalette } from '@primeuix/themes';
import aura from '@primeuix/themes/aura';
import lara from '@primeuix/themes/lara';
import material from '@primeuix/themes/material';
import nora from '@primeuix/themes/nora';
import { breakpointsTailwind } from '@vueuse/core';
import tailwindColors from 'tailwindcss/colors';

delete tailwindColors.lightBlue;
delete tailwindColors.warmGray;
delete tailwindColors.trueGray;
delete tailwindColors.coolGray;
delete tailwindColors.blueGray;

const colors = _merge(tailwindConfig.theme?.extend?.colors, tailwindColors);

const layoutStorage = useLocalStorage(
   'app-state',
   {
      isDark: usePreferredDark(),
      isLinked: true,
      sidebarActive: false,
      activeMenuItem: {},
      sidebarMode: 'static',
      sidebarModeDesktop: 'static',
      preset: 'aura',
      primary: 'orange',
      surface: 'viva',
      UIScale: 1,
      dark: {
         preset: 'aura',
         primary: 'orange',
         surface: 'viva',
         UIScale: 1,
         sidebarMode: 'static',
         sidebarModeDesktop: 'static'
      }
   },
   { writeDefaults: true, mergeDefaults: true }
);

const layoutState = new Proxy(layoutStorage.value, {
   get(target, prop) {
      if (!target.isLinked && target.isDark && _has(target.dark, prop))
         return _get(target, `dark.${prop}`, _get(target, prop));
      return _get(target, prop);
   },
   set(target, prop, newValue) {
      if (!target.isLinked && target.isDark && _has(target.dark, prop))
         return _set(target, `dark.${prop}`, newValue);
      return _set(target, prop, newValue);
   }
});

const breakpoints = useBreakpoints(breakpointsTailwind);

const isDarkTheme = computed(() => layoutState.isDark);

const getPrimaryColor = computed(() => colors[layoutState.primary]);

const getSurfaceColor = computed(() => colors[layoutState.surface]);

const setPrimary = (value) => {
   layoutState.primary = value;
};

const setSurface = (value) => {
   layoutState.surface = value;
};

const setPreset = (value) => {
   layoutState.preset = value;
};

const setActiveMenuItem = (item) => {
   layoutState.activeMenuItem = item?.value || item;
};

const sidebarModeOptions = computed(() => [
   { label: i18n.t('app_config.sidebar.modes.static'), value: 'static' },
   { label: i18n.t('app_config.sidebar.modes.auto'), value: 'auto' },
   { label: i18n.t('app_config.sidebar.modes.mini'), value: 'mini' },
   { label: i18n.t('app_config.sidebar.modes.reveal'), value: 'reveal' },
   { label: i18n.t('app_config.sidebar.modes.overlay'), value: 'overlay' }
]);

const setSidebarMode = (mode) => {
   layoutState.sidebarModeDesktop = mode;
   if (mode === 'overlay') {
      layoutState.sidebarModeDesktop = null;
   }
   layoutState.sidebarMode = mode;
   layoutState.sidebarModeDesktop = mode;
};

const toggleDark = useToggle(
   useDark({
      selector: ':root',
      valueDark: 'dark',
      valueLight: '',
      storageKey: 'color-scheme',
      onChanged: (isDark, defaultHandler, mode) => {
         _set(layoutState, 'isDark', isDark);
         defaultHandler(mode);
      }
   })
);
const toggleDarkMode = (e, value = !isDarkTheme.value) => {
   if (!document.startViewTransition) {
      toggleDark(value);

      return;
   }

   return document.startViewTransition(() => toggleDark(value));
};

const sidebarToggle = () => {
   layoutState.sidebarActive = !layoutState.sidebarActive;
};

const resetSidebar = () => {
   layoutState.sidebarActive = false;
};

const primaryColors = _toPairs(
   _omit(colors, ['white', 'black', 'transparent', 'current', 'inherit'])
).reduce(
   (acc, [name, palette]) => {
      acc.push({ name, palette: { 0: '#ffffff', ...palette } });
      return acc;
   },
   [{ name: 'noir', palette: {} }]
);

const surfaces = ref(primaryColors.filter(({ name }) => name !== 'noir'));

const presets = {
   aura,
   lara,
   material,
   nora
};

const getPresetExt = () => {
   const color = primaryColors.find((c) => c.name === layoutState.primary);

   if (color.name === 'noir') {
      return {
         semantic: {
            primary: {
               50: '{surface.50}',
               100: '{surface.100}',
               200: '{surface.200}',
               300: '{surface.300}',
               400: '{surface.400}',
               500: '{surface.500}',
               600: '{surface.600}',
               700: '{surface.700}',
               800: '{surface.800}',
               900: '{surface.900}',
               950: '{surface.950}'
            },
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
   } else {
      return {
         semantic: {
            primary: color.palette,
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
};

const updateColors = (type, color) => {
   if (type === 'primary') {
      setPrimary(color.name);
   } else if (type === 'surface') {
      setSurface(color.name);
   }

   applyTheme(type, color);
};

function applyTheme(type, color) {
   if (type === 'primary') {
      updatePreset(getPresetExt());
   } else if (type === 'surface') {
      updateSurfacePalette(color.palette);
   }
}

nextTick(() => {
   watch(
      () => layoutState,
      (newlayoutState) => {
         localStorage.setItem('app-state', JSON.stringify(newlayoutState));
      },
      { immediate: true }
   );

   watch(
      () => layoutState.preset,
      (value) => {
         const presetValue = presets[value];
         const surfacePalette = surfaces.value.find((s) => s.name === layoutState.surface)?.palette;

         $t()
            .preset(presetValue)
            .preset(getPresetExt())
            .surfacePalette(surfacePalette)
            .use({ useDefaultOptions: true });
      },
      { immediate: true }
   );

   watch(
      () => layoutState.primary,
      (value) =>
         applyTheme(
            'primary',
            primaryColors.find(({ name }) => name === value)
         ),
      { immediate: true }
   );

   watch(
      () => layoutState.surface,
      (value) =>
         applyTheme(
            'surface',
            surfaces.value.find(({ name }) => name === value)
         ),
      { immediate: true }
   );

   watch(
      () => layoutState.UIScale,
      (newScale) => {
         if (newScale > 0) document.documentElement.style.setProperty('--ui-scale', newScale);
      },
      { immediate: true }
   );

   watch(
      () => [breakpoints.sm.value === false, layoutState.isDark],
      ([isMobileView]) => {
         if (isMobileView) {
            if (layoutState.sidebarMode !== 'overlay') {
               layoutState.sidebarModeDesktop = layoutState.sidebarMode;
               layoutState.sidebarMode = 'overlay';
            }
            return;
         }
         if (!breakpoints.current().value.includes('sm')) {
            return;
         }
         if (layoutState.sidebarModeDesktop) {
            layoutState.sidebarMode = layoutState.sidebarModeDesktop;
         }
      },
      {
         immediate: true
      }
   );

   watch(
      () => locale.value,
      (newLocale) => {
         if (newLocale.startsWith('ar-'))
            return document.documentElement.setAttribute('dir', 'rtl');
         return document.documentElement.setAttribute('dir', 'ltr');
      },
      { immediate: true }
   );
});

export default () => {
   const {
      ability: { can }
   } = useAuthStore();

   const routes = computed(() => {
      function routesToNestedObject(routes) {
         const root = {};

         routes
            .sort((a, b) => a.path?.length - b.path?.length)
            .forEach((route) => {
               const cleanedPath = route.path.replace(/\/:[^/]+/g, '');
               const segments = cleanedPath?.split('/').filter(Boolean);

               let current = root;
               segments?.forEach((segment) => {
                  if (!current[segment]) {
                     current[segment] = { route, items: {} };
                  }
                  current = current[segment].items;
               });
            });

         function toNestedArray(obj, parentKey = '', isVisible = false, lastIndex = 0) {
            return _toPairs(obj)
               .map(([key, { items, route }], i) => {
                  const { meta, name } = route;
                  const currentKey = parentKey ? `${parentKey}_${i + 1}` : `${i}`;
                  const index = meta.index || ++lastIndex;
                  let visible = toValue(meta?.visible);

                  const children = toNestedArray(items, currentKey, visible || true, index).filter(
                     (c) => c.visible
                  );

                  visible ??= meta?.requiredPermissions?.every?.(({ action, subject }) =>
                     can?.(action, subject)
                  );

                  visible ??= children.length > 0 ? true : isVisible;
                  return {
                     key: currentKey,
                     name,
                     label: i18n.t(meta.label || key),
                     icon: meta.icon,
                     visible,
                     route: { ...route, replace: meta?.replace },
                     index,
                     ...(_size(children) > 0 && {
                        items: children
                     })
                  };
               })
               .sort((a, b) => a.index - b.index);
         }

         return toNestedArray(root);
      }

      const routes = router?.getRoutes();

      const nestedRoutes = routesToNestedObject(routes);

      return nestedRoutes;
   });

   const namedRoutes = computed(() => {
      function renameItemsToChildren(acc, value) {
         if (value.items) {
            value.children ??= {};
            value.items.forEach((item) => {
               _merge(value.children, renameItemsToChildren({}, item));
            });
            delete value.items;
         }
         acc[value.route?.name || value.label] = value;
         return acc;
      }
      return routes.value.reduce(renameItemsToChildren, {});
   });

   return {
      layoutState: layoutState,
      surfaces: readonly(surfaces),
      primaryColors: readonly(primaryColors),
      isDarkTheme: readonly(isDarkTheme),
      getPrimaryColor: readonly(getPrimaryColor),
      getSurfaceColor: readonly(getSurfaceColor),
      presets: readonly(presets),
      sidebarModeOptions: readonly(sidebarModeOptions),
      routes: readonly(routes),
      namedRoutes: readonly(namedRoutes),
      breakpoints: readonly(breakpoints),
      sidebarToggle,
      setActiveMenuItem,
      toggleDarkMode,
      setPrimary,
      setSurface,
      setSidebarMode,
      setPreset,
      resetSidebar,
      updateColors,
      getPresetExt
   };
};
