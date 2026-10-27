import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export const dateFormats = [
   'LT',
   'LTS',
   'L',
   'L LT',
   'L LTs',
   'LL',
   'LL LT',
   'LL LTS',
   'LLL',
   'LLLL',
   'l',
   'l LT',
   'l LTs',
   'll',
   'll LT',
   'll LTS',
   'lll',
   'llll',
   'D MMM',
   'D MMMM',
   'MMM D',
   'MMMM D',
   'MMM',
   'MMMM',
   'YYYY-MM-DD',
   'YYYY-MM-DD HH:mm:ss',
   'YYYY-MM-DDTHH:mm:ssZ',
   'YYYY-MM-DDTHH:mm:ss[Z]',
   'YYYY-MM-DDTHH:mm:ssZ[Z]',
   'YYYY-MM-DDTHH:mm:ss.S',
   'YYYY-MM-DDTHH:mm:ss.SS',
   'YYYY-MM-DDTHH:mm:ss.SSS',
   'YYYY-MM-DDTHH:mm:ss.SZ',
   'YYYY-MM-DDTHH:mm:ss.SSZ',
   'YYYY-MM-DDTHH:mm:ss.SSSZ',
   'YYYY-MM-DDTHH:mm:ss.S[Z]',
   'YYYY-MM-DDTHH:mm:ss.SS[Z]',
   'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
   'YYYY-MM-DDTHH:mm:ss.SZ[Z]',
   'YYYY-MM-DDTHH:mm:ss.SSZ[Z]',
   'YYYY-MM-DDTHH:mm:ss.SSSZ[Z]'
];

interface DateConfig {
   value: any;
   lang?: string;
   formats?: string | string[];
   returnFormat?: string;
   validate?: boolean;
}

export const isValidDate = ({
   value,
   lang = locale.value,
   formats = dateFormats
}: DateConfig): boolean => {
   dayjs.locale(lang);
   const utc = dayjs.utc(value, undefined, true);
   if (utc.isValid()) {
      return true;
   }
   return dayjs(value?.replace?.(/(\.\d{1,6})/, ''), formats, lang, true)?.isValid();
};

export const parseDayjs = ({
   value,
   lang = locale.value,
   formats = dateFormats,
   validate = true
}: DateConfig): Dayjs => {
   if (validate && !isValidDate({ value, lang, formats })) return value;

   const utc = dayjs.utc(value);
   if (utc.isValid()) return utc.local(); // Treat as UTC, convert to local

   return dayjs(value, formats, lang, true); // Treat as local
};

export const localeDateString = ({
   value,
   lang = locale.value,
   formats = dateFormats,
   returnFormat = '',
   validate = true
}: DateConfig): string | any => {
   const date = parseDayjs({ value, lang, formats, validate });

   if (date === value) return value;

   const format =
      returnFormat ||
      (date.hour() !== 0 || date.minute() !== 0 || date.second() !== 0 ? 'lll' : 'll');
   return date.format(format);
};
