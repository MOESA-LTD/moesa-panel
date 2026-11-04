/** S05's mark for a value that is not there, e.g. a market cell that is not opened. */
export const EMPTY_VALUE = '—';

/** The value, or EMPTY_VALUE when it is empty. */
export const formatEmpty = (value?: string | null): string =>
   value != null && value.trim() !== '' ? value : EMPTY_VALUE;
