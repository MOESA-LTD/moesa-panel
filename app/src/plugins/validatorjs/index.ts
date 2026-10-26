import { isValidPhoneNumber } from 'libphonenumber-js';
import Validator from 'validatorjs';

export const formAttributeFormatter = (attr: string) => {
   const words = i18n
      .t(attr)
      .split?.(/[\.\s]/g)
      .map?.((e) => {
         if (Number.isNaN(Number.parseInt(e))) return e;
      })
      .filter(Boolean);

   const field = _last(words) === 'display_name' ? 'name' : _last(words);
   const attributeName = i18n.t('fields.' + field);
   return attributeName;
};

Validator.setAttributeFormatter(formAttributeFormatter);

Validator.register('phone', (value) => {
   if (_isString(value) && !_startsWith(value, '+')) value = '+' + value;
   return isValidPhoneNumber(value as string);
});

Validator.register(
   'lte',
   function (this: any, value, requirement) {
      const val = _get(this.validator?.input, requirement, requirement);
      this.ruleValue = val;
      return this.inputValue <= val;
   },
   ':attribute <= :lte'
);

Validator.register(
   'gte',
   function (this: any, value, requirement) {
      const val = _get(this.validator?.input, requirement, requirement);
      this.ruleValue = val;
      return this.inputValue >= val;
   },
   ':attribute >= :gte'
);

Validator.register(
   'lt',
   function (this: any, value, requirement) {
      const val = _get(this.validator?.input, requirement, requirement);
      this.ruleValue = val;
      return this.inputValue < val;
   },
   ':attribute < :lt'
);

Validator.register(
   'gt',
   function (this: any, value, requirement) {
      const val = _get(this.validator?.input, requirement, requirement);
      this.ruleValue = val;
      return this.inputValue > val;
   },
   ':attribute > :gt'
);

export default Validator;
