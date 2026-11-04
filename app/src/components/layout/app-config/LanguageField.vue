<script setup>
// The interface language: the locale lives in the URL; the i18n plugin keeps it in localStorage.
</script>

<template>
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
                  <span class="app-configurator__language-flag flag" :class="`flag-${value}`" />
               </div>
            </template>
         </Select>
      </FormField>
   </div>
</template>

<style lang="scss">
.app-configurator {
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
}
</style>
