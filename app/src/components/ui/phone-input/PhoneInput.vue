<script setup>
import {
   getCountries,
   getCountryCallingCode,
   isSupportedCountry,
   parsePhoneNumberWithError
} from 'libphonenumber-js';
import { InputText } from 'primevue';

defineOptions({ inheritAttrs: false });

defineProps({
   ...InputText.props,
   readonly: Boolean,
   loading: Boolean,
   invalid: Boolean
});

const modelValue = defineModel('modelValue', {
   get: (value) => value || '',
   set: (value) => value || ''
});

const parsedPhone = computed(() => {
   try {
      const value =
         modelValue.value && !_startsWith(modelValue.value, '+')
            ? '+' + modelValue.value
            : modelValue.value;
      return parsePhoneNumberWithError(value);
   } catch {
      return null;
   }
});

const countryPhoneCodes = computed(() =>
   getCountries()
      .map((countryCode) => ({
         countryCode,
         countryCallingCode: Number(getCountryCallingCode(countryCode))
      }))
      .filter((c) => isSupportedCountry(c.countryCode))
      .toSorted((a, b) => a.countryCallingCode - b.countryCallingCode)
);

const selectedCountry = ref(null);

watchEffect(() => {
   if (parsedPhone.value) {
      selectedCountry.value = {
         countryCode: parsedPhone.value.country,
         countryCallingCode: parsedPhone.value.countryCallingCode
      };
      return;
   }

   selectedCountry.value = {
      countryCode: null,
      countryCallingCode: null
   };
});

function onCountryChange(value) {
   if (!value) return;
   const national = parsedPhone.value.nationalNumber || '';
   modelValue.value = `+${value.countryCallingCode}${national}`;
}

function onInputChange(val) {
   const national = val?.replace(/\D/g, '') || '';
   // A calling code alone is not a number; clearing the input clears the value.
   if (!national) {
      modelValue.value = '';
      return;
   }
   const callingCode = selectedCountry.value?.countryCallingCode;
   if (callingCode) {
      modelValue.value = `+${callingCode}${national}`;
   } else {
      modelValue.value = `+${national}`;
   }
}
</script>

<template>
   <InputGroup :class="$attrs.class" class="phone_input__container">
      <InputGroupAddon class="phone_input__addon">
         <Select
            v-model="selectedCountry"
            :options="countryPhoneCodes"
            option-label="countryCode"
            filter
            :filter-fields="['countryCode', 'countryCallingCode']"
            class="phone_input__select"
            :disabled="readonly"
            :loading="loading"
            :invalid="invalid"
            @update:model-value="onCountryChange"
         >
            <template #value="{ value }">
               <span class="phone_input__selected-value">
                  {{ [value?.countryCode, value?.countryCallingCode].filter(Boolean).join(' | ') }}
               </span>
            </template>
            <template #option="{ option }">
               <span class="phone_input__option">
                  {{
                     [option?.countryCode, option?.countryCallingCode].filter(Boolean).join(' | ')
                  }}
               </span>
            </template>
         </Select>
      </InputGroupAddon>
      <InputMask
         v-bind="_omit({ ...$attrs, ...$props }, ['class', 'modelValue'])"
         class="phone_input__text"
         :model-value="parsedPhone?.nationalNumber"
         @value-change="onInputChange"
         mask="(9?99) 999-9999"
         unmask
         :readonly="readonly"
         :disabled="readonly"
         :invalid="invalid"
      />
   </InputGroup>
</template>

<style lang="scss">
.phone_input {
   &__select {
      @apply max-h-none !h-full !rounded-[inherit] -me-[1px];
   }

   &__selected-value,
   &__option {
      @apply block;
   }

   &__addon {
      @apply max-h-none !p-0 !border-0;
   }
}
</style>
