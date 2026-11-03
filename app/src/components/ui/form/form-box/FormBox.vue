<script setup lang="ts" generic="T = any">
export declare type FormBoxProps<T = any> = {
   legend?: string;
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
   /** A restored draft (see useFormDraft): shows a note with a way to discard it. */
   draft?: { restored: boolean; stale: boolean };
};

const props = defineProps<FormBoxProps<T>>();

const boxElement = ref<HTMLElement | null>(null);
</script>

<template>
   <template v-if="_isNil(legend)">
      <form
         :invalid="invalid || !!error"
         class="form_box"
         @submit.prevent
         @reset.prevent
         ref="boxElement"
         autocomplete="on"
      >
         <!-- @reset.prevent: the browser's own reset would blank inputs whose value did not change
              (Vue does not re-render them); the parent's @reset resets the form state instead.
              (Kept inside the form: a comment next to it would make the root a fragment.) -->
         <BlockUI
            :blocked="readonly === true"
            :pt="{
               root: { class: 'contents' },
               mask: {
                  class: '!bg-[transparent]'
               }
            }"
         >
            <Message
               v-if="draft?.restored && !readonly"
               :severity="draft.stale ? 'warn' : 'info'"
               :icon="draft.stale ? PrimeIcons.EXCLAMATION_TRIANGLE : PrimeIcons.HISTORY"
               class="form_box__draft"
            >
               <span class="form_box__draft-content">
                  <span>
                     {{ $t('form.draft.restored') }}
                     <template v-if="draft.stale">{{ $t('form.draft.stale') }}</template>
                  </span>
                  <!-- A form reset discards the draft along with the edits. -->
                  <Button :label="$t('form.draft.discard')" size="small" text type="reset" />
               </span>
            </Message>

            <slot v-bind="$props" />

            <slot name="form-actions" v-bind="$props">
               <div v-if="!readonly" class="form_box__actions-bar">
                  <span class="form_box__button-container">
                     <Button
                        :label="resetText || $t('action.reset')"
                        severity="secondary"
                        class="form_box__button"
                        :disabled="!dirty"
                        type="reset"
                     />
                     <Button
                        :label="submitText || $t('action.save')"
                        class="form_box__button"
                        :disabled="!dirty"
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

   &__draft {
      @apply w-full;

      &-content {
         @apply flex flex-wrap items-center justify-between gap-2 w-full;
      }
   }
}
</style>
