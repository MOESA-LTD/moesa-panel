<script setup lang="ts">
import LanguageField from '@/components/layout/app-config/LanguageField.vue';
import ThemeFields from '@/components/layout/app-config/ThemeFields.vue';
import ThemeModeToggles from '@/components/layout/app-config/ThemeModeToggles.vue';

// The top bar configurator's language and theme controls; they keep their values in this browser.
const { t } = useI18n();
</script>

<template>
   <div class="flex flex-col gap-4">
      <FormBox :legend="t('account.preferences.language_legend')">
         <LanguageField />
      </FormBox>

      <FormBox :legend="t('account.preferences.appearance_legend')">
         <template #legend="{ legend }">
            <div class="flex gap-2 items-center">
               <span v-text="legend" />
               <ThemeModeToggles />
            </div>
         </template>
         <ThemeFields />
      </FormBox>

      <small class="text-muted-color">{{ t('account.preferences.stored_locally') }}</small>
   </div>
</template>
