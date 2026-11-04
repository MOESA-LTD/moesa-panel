<script setup>
// Dark mode, and whether light and dark mode share one set of theme settings.
const theme = useThemeStore();
const { settings, isDark } = storeToRefs(theme);
</script>

<template>
   <ToggleButton
      @change="theme.toggleDark()"
      :modelValue="isDark"
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
      v-model="settings.linked"
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
         value: $t('app_config.language.you_can_configure_different_options_for_each_light_modes')
      }"
   />
</template>
