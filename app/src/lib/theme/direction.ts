/** Whether a locale is written right to left: the Arabic ones (`ar-…`). */
export const isRtlLocale = (locale: string): boolean => locale.startsWith('ar-');
