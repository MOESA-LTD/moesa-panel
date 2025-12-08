<script setup>
const {
   layoutState,
   surfaces,
   primaryColors,
   presets,
   sidebarModeOptions,
   isDarkTheme,
   breakpoints,
   setSidebarMode,
   setPreset,
   updateColors,
   toggleDarkMode
} = useLayout();

const presetOptions = ref(Object.keys(presets));
const { isSignedIn } = storeToRefs(useAuthStore());
</script>

<template>
   <div class="app-configurator">
      <FormBox :legend="$t('app_config.app_settings')" class="app-configurator__form">
         <template #legend="{ legend }">
            <div class="app-configurator__header">
               <span v-text="legend" />
               <ToggleButton
                  @change="toggleDarkMode"
                  :modelValue="isDarkTheme"
                  :onIcon="PrimeIcons.MOON"
                  :offIcon="PrimeIcons.SUN"
                  onLabel=""
                  offLabel=""
                  :pt="{
                     label: {
                        class: 'hidden'
                     }
                  }"
                  :aria-label="$t('app_config.theme.dark_mode.toggle_dark_mode')"
               />
               <ToggleButton
                  v-model="layoutState.isLinked"
                  :on-icon="PrimeIcons.LOCK"
                  :off-icon="PrimeIcons.LOCK_OPEN"
                  onLabel=""
                  offLabel=""
                  :pt="{
                     label: {
                        class: 'hidden'
                     }
                  }"
                  v-tooltip.left="{
                     value: $t(
                        'app_config.language.you_can_configure_different_options_for_each_light_modes'
                     )
                  }"
               />
            </div>
         </template>
         <div class="app-configurator__language-section">
            <FormField :label="$t('app_config.language.select_language')" v-slot="slotProps">
               <Select
                  v-bind="slotProps"
                  :modelValue="$i18n.locale"
                  :options="SUPPORTED_LOCALES"
                  option-label="label"
                  option-value="value"
                  @change="$router.replace({ params: { locale: $event.value } })"
               >
                  <template #option="{ option }">
                     <div class="app-configurator__language-option">
                        <span
                           class="app-configurator__language-flag"
                           :class="`flag flag-${option.value}`"
                        />
                        <span v-text="option.label" />
                     </div>
                  </template>
                  <template #value="{ value }">
                     <div class="app-configurator__language-value">
                        <span
                           class="app-configurator__language-flag flag"
                           :class="`flag-${value}`"
                        />
                     </div>
                  </template>
               </Select>
            </FormField>
         </div>

         <FormField
            v-slot="slotProps"
            :label="$t('app_config.theme.ui_scale')"
            class="app-configurator__scale-field"
         >
            <Slider
               v-bind="slotProps"
               class="app-configurator__scale-slider"
               v-model:modelValue="layoutState.UIScale"
               :step="0.05"
               :min="0.75"
               :max="1.1"
               :aria-label="$t('app_config.theme.ui_scale')"
            />
         </FormField>

         <FormField fluid v-slot="slotProps" :label="$t('app_config.theme.primary_color')">
            <div class="app-configurator__color-buttons">
               <Button
                  v-bind="slotProps"
                  v-for="primaryColor of primaryColors"
                  :key="primaryColor.name"
                  :title="primaryColor.name"
                  class="app-configurator__color-button"
                  :class="{
                     'app-configurator__color-button--active':
                        layoutState.primary === primaryColor.name
                  }"
                  :raised="layoutState.primary === primaryColor.name"
                  @click="updateColors('primary', primaryColor)"
                  :style="{
                     backgroundColor: `${primaryColor.name === 'noir' ? (isDarkTheme ? 'var(--text-color)' : 'var(--p-slate-900)') : primaryColor.palette['500']}`
                  }"
               />
            </div>
         </FormField>

         <FormField fluid v-slot="slotProps" :label="$t('app_config.theme.surface_color')">
            <div class="app-configurator__color-buttons">
               <Button
                  v-for="s of surfaces"
                  v-bind="slotProps"
                  :key="s.name"
                  :title="s.name"
                  class="app-configurator__color-button"
                  :class="{
                     'app-configurator__color-button--active': layoutState.surface === s.name
                  }"
                  :raised="layoutState.surface === s.name"
                  @click="updateColors('surface', s)"
                  :style="{
                     outlineColor: layoutState.surface === s.name ? `var(--p-${s.name}-500)` : '',
                     backgroundColor: `${s.name === 'noir' ? (isDarkTheme ? 'var(--text-color)' : 'var(--p-slate-900)') : s.palette['500']}`
                  }"
               />
            </div>
         </FormField>

         <FormField fluid v-slot="slotProps" :label="$t('app_config.theme.preset.select_preset')">
            <SelectButton
               v-bind="slotProps"
               :modelValue="layoutState.preset"
               @change="({ value }) => setPreset(value)"
               :options="presetOptions"
               :allowEmpty="false"
               :aria-label="$t('app_config.theme.preset.select_preset')"
            />
         </FormField>

         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('app_config.sidebar.select_sidebar_mode')"
            v-if="isSignedIn && breakpoints.sm"
         >
            <Select
               v-bind="slotProps"
               :modelValue="layoutState.sidebarMode"
               @change="({ value }) => setSidebarMode(value)"
               :options="sidebarModeOptions"
               :allowEmpty="false"
               optionLabel="label"
               optionValue="value"
               :aria-label="$t('app_config.sidebar.select_sidebar_mode')"
            />
         </FormField>
      </FormBox>
   </div>
</template>

<style lang="scss">
.app-configurator {
   &__form {
      @apply border-0 !important;
   }

   &__header {
      @apply flex gap-2 items-center;
   }

   &__language-section {
      @apply flex gap-[inherit];
   }

   &__language-badge {
      @apply p-1 !important;
   }

   &__language-badge-icon {
      @apply text-sm !important;
   }

   &__language-option {
      @apply flex gap-2 items-center;
   }

   &__language-value {
      @apply flex gap-2 items-center;
   }

   &__language-flag {
      @apply aspect-[44/30] !w-8 !h-[unset] !important;
   }

   &__scale-field {
      @apply w-full;
   }

   &__scale-slider {
      @apply min-w-32 !important;
   }

   &__color-buttons {
      @apply flex gap-3 flex-wrap justify-center items-center;
   }

   &__color-button {
      @apply w-5 h-5 !p-0 !rounded-full !border-0 outline-none outline-offset-1 !important;

      &--active {
         @apply scale-150 m-1 !outline-primary-500/75;
      }
   }
}
</style>
