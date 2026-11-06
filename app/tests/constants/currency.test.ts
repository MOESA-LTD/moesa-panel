import { defaultCurrencyFor } from '@/constants/currency';
import { currencies } from '@/constants/form/common';
import { describe, expect, it } from 'vitest';

describe('defaultCurrencyFor', () => {
   it('maps a country to its listing currency', () => {
      expect(defaultCurrencyFor('DE')).toBe('EUR');
      expect(defaultCurrencyFor('PL')).toBe('PLN');
      expect(defaultCurrencyFor('GB')).toBe('GBP');
      expect(defaultCurrencyFor('US')).toBe('USD');
   });

   it('is none for an unknown or missing country', () => {
      expect(defaultCurrencyFor('ZZ')).toBeNull();
      expect(defaultCurrencyFor(null)).toBeNull();
   });

   it('only yields currencies the select offers', () => {
      const countries =
         'DE FR IT ES NL BE AT IE FI PT GR LU SK SI EE LV LT HR CY MT PL SE GB CZ HU RO DK BG CH NO TR US';
      for (const country of countries.split(' '))
         expect(currencies).toContain(defaultCurrencyFor(country));
   });
});
