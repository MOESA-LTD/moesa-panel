import { currencies } from '@/constants/form/common';

const COUNTRY_CURRENCY: Record<string, string> = {
   ...Object.fromEntries(
      'DE FR IT ES NL BE AT IE FI PT GR LU SK SI EE LV LT HR CY MT'
         .split(' ')
         .map((c) => [c, 'EUR'])
   ),
   PL: 'PLN',
   SE: 'SEK',
   GB: 'GBP',
   CZ: 'CZK',
   HU: 'HUF',
   RO: 'RON',
   DK: 'DKK',
   BG: 'BGN',
   CH: 'CHF',
   NO: 'NOK',
   TR: 'TRY',
   US: 'USD'
};

/** The currency a market cell lists in by default for its country; null when none is assumed. */
export const defaultCurrencyFor = (country?: string | null): string | null => {
   const code = COUNTRY_CURRENCY[country?.trim().toUpperCase() ?? ''];
   return code && currencies.includes(code) ? code : null;
};
