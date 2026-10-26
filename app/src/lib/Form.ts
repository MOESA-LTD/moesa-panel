// app/src/lib/Form.ts

import Validator from '@/plugins/validatorjs';
import { detailedDiff, diff, updatedDiff } from 'deep-object-diff';
import { PropertyName } from 'lodash';
import { Errors, Rules } from 'validatorjs';
import ValidatorErrors from 'validatorjs/src/errors';
import Collection from './Collection';

export class Form<T = any> extends Collection<T> {
   _rules = reactive({});
   _errors = reactive<Errors>(new ValidatorErrors());
   _isValid = ref(false) as unknown as boolean;
   _autoValidate = ref(false);
   _useDialogForm = ref(false);
   _customAttributeNames = reactive<{ [key: PropertyName]: '' }>({});

   readonly _changedData = computed(() =>
      diff(
         (this._defaults as unknown as Ref<Partial<T & object>>).value,
         (this._data as Ref<T & object>).value
      )
   ) as unknown as Partial<T>;

   readonly _isChanged = computed(
      () => _size((this._changedData as unknown as ComputedRef<T & object>).value) > 0
   );
   readonly _detailedChagedData = computed(() =>
      detailedDiff(
         (this._defaults as unknown as Ref<Partial<T & object>>).value,
         (this._data as Ref<T & object>).value
      )
   );

   constructor({
      data = {} as T,
      rules = {},
      autoValidate = [],
      useDialogForm = true
   }: {
      data?: T;
      rules?: Rules;
      autoValidate?: Array<keyof T> | boolean;
      useDialogForm?: boolean;
   } = {}) {
      super(data);

      _set(this, '_autoValidate', autoValidate);
      _set(this, '_useDialogForm', useDialogForm);

      this._setRules(rules);

      if (this._useDialogForm) this._initDialogForm();

      return this;
   }

   _initWatcher() {
      watch(
         () => [this._autoValidate, this._data, this._rules],
         ([validateAttributes, changedData, changedRules]) => {
            if (validateAttributes === true) {
               this._validate(_keys(updatedDiff(changedData, changedRules)) as (keyof T)[]);
               return;
            }

            if (_isArray(validateAttributes) && _size(validateAttributes) > 0) {
               const rules = _pick(changedRules, validateAttributes) as Rules;
               this._validate(null, rules);
            }
         },
         { deep: true }
      );
      return this;
   }

   private _initDialogForm() {
      const dialogRef = inject<any>('dialogRef', false);

      if (dialogRef) {
         this._merge(dialogRef?.data?.form);

         watch(
            () => this._toJson,
            () => {
               _set(dialogRef, 'data.form', this._data);
            },
            { immediate: true }
         );
      }
      return this;
   }

   _validate(keys: Array<keyof T> | null = null, rules: Rules = this._rules): boolean {
      let values: Partial<T> = this._data;

      if (_isArray(keys)) {
         values = _pick(this._data, keys);
         rules = _pick(rules, keys);
      }

      const validation = new Validator(values, rules);

      validation.setAttributeNames(this._customAttributeNames);

      // Custom rules (see plugins/validatorjs) read sibling values through `validator.form`.
      Object.assign(validation, { form: this });

      const passed = validation.passes() as boolean;

      _assign(this._errors, validation.errors);

      this._isValid = passed;

      return this._isValid;
   }

   _reset(attrs = this._defaults as T): this {
      super._reset(attrs);

      this._errors = reactive<Errors>(new ValidatorErrors());

      return this;
   }

   _setRules(rules = {}): this {
      this._rules = reactive(rules);
      return this;
   }

   _setCustomAttributeNames(names: { [key: PropertyName]: string }): void {
      _assign(this._customAttributeNames, names);
   }

   static create<T = any>(...args: ConstructorParameters<typeof Form<T>>) {
      const proxy = super.create<T>(
         ...(args as unknown as ConstructorParameters<typeof Collection<T>>)
      ) as Form<T> & Form<T>['_data'];
      return proxy._initWatcher();
   }
}
