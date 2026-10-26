<script setup lang="ts" generic="T = any">
import { Form } from '@/lib/Form';

export declare type FormBoxProps<T = any> = {
   legend?: string;
   /** Legacy Form instance; forms built with useForm pass `dirty` instead. */
   form?: Form<T>;
   /** Whether there are unsaved changes; enables the reset and save buttons. */
   dirty?: boolean;
   /** Shows the save button as busy while the form is being submitted. */
   submitting?: boolean;
   readonly?: boolean;
   invalid?: boolean;
   error?: string | boolean;
   printable?: boolean;
   submitText?: string;
   resetText?: string;
};

// Without an explicit undefined default Vue casts an absent boolean to false, which would
// hide the legacy `form` fallback.
const props = withDefaults(defineProps<FormBoxProps<T>>(), { dirty: undefined });

const boxElement = ref<HTMLElement | null>(null);
</script>

<template>
   <template v-if="_isNil(legend)">
      <form
         :invalid="invalid || !!error"
         class="form_box"
         @submit.prevent
         ref="boxElement"
         autocomplete="on"
      >
         <BlockUI
            :blocked="readonly === true"
            :pt="{
               root: { class: 'contents' },
               mask: {
                  class: '!bg-[transparent]'
               }
            }"
         >
            <slot v-bind="$props" />

            <slot name="form-actions" v-bind="$props">
               <div v-if="!readonly" class="form_box__actions-bar">
                  <span class="form_box__button-container">
                     <Button
                        :label="resetText || $t('action.reset')"
                        severity="secondary"
                        class="form_box__button"
                        :disabled="!(dirty ?? form?._isChanged)"
                        type="reset"
                     />
                     <Button
                        :label="submitText || $t('action.save')"
                        class="form_box__button"
                        :disabled="!(dirty ?? form?._isChanged)"
                        :loading="submitting"
                        type="submit"
                     />
                     <PrintElementButton
                        v-if="printable"
                        :element="boxElement"
                        class="form_box__print-button"
                     />
                     <ErrorBadge v-if="error" :error="error" class="form_box__error-badge" />
                  </span>
               </div>
            </slot>
         </BlockUI>
      </form>
   </template>
   <template v-else>
      <Fieldset
         :invalid="invalid || !!error"
         :legend="legend"
         :pt="{
            content: {
               class: 'form_box'
            }
         }"
         :ref="(el) => (boxElement = (el as ComponentPublicInstance)?.$el)"
      >
         <slot />
         <template #legend="slotProps">
            <slot name="header" v-bind="$props">
               <div class="form_box__header-container">
                  <slot name="legend" v-bind="$props">
                     <label v-text="legend" v-bind="slotProps" class="form_box__legend" />
                  </slot>
                  <div class="form_box__header-actions">
                     <slot name="actions" />
                  </div>
                  <div class="form_box__header-actions">
                     <PrintElementButton
                        v-if="printable"
                        :element="boxElement"
                        class="form_box__print-button"
                     />
                     <ErrorBadge v-if="error" :error="error" class="form_box__error-badge" />
                  </div>
               </div>
            </slot>
         </template>
      </Fieldset>
   </template>
</template>

<style lang="scss">
.form_box {
   @apply flex-1 flex flex-wrap gap-2 items-start !relative;

   &:has(&) {
      @apply gap-4;
   }

   &[invalid='true'] {
      @apply border-[var(--p-button-danger-border-color)];
   }

   &__header {
      &-container {
         @apply flex items-center gap-2;
      }
      &-actions {
         @apply print:!hidden empty:hidden;
      }
   }
   &__legend {
      @apply first-letter:uppercase;
   }

   & > .form_box {
      @apply self-start;
   }

   &__actions-bar {
      @apply w-full flex justify-end items-center sticky bottom-0 bg-transparent pointer-events-none print:!hidden;

      & * {
         @apply pointer-events-auto;
      }
   }

   &__button-container {
      @apply flex flex-wrap items-center gap-4 p-4 justify-end rounded-[var(--content-border-radius)] backdrop-blur-sm;
   }

   &__button {
      @apply flex-1 w-48;
   }
}
</style>
