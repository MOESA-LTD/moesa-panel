<script setup>
import LanguageField from '@/components/layout/app-config/LanguageField.vue';
import ThemeFields from '@/components/layout/app-config/ThemeFields.vue';
import ThemeModeToggles from '@/components/layout/app-config/ThemeModeToggles.vue';
</script>

<template>
   <div class="app-configurator">
      <FormBox :legend="$t('app_config.app_settings')" class="app-configurator__form">
         <template #legend="{ legend }">
            <div class="app-configurator__header">
               <span v-text="legend" />
               <ThemeModeToggles />
            </div>
         </template>
         <LanguageField />
         <ThemeFields />
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
}
</style>
