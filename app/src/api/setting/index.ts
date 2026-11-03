import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

export type SettingRow = Pick<Tables['setting']['Row'], 'id' | 'key' | 'value' | 'description'>;
export type SettingInput = Pick<Tables['setting']['Row'], 'id' | 'value'>;

export const settingRepository = {
   async list(signal: AbortSignal) {
      const { data } = await supabase
         .from('setting')
         .select('id, key, value, description')
         .abortSignal(signal)
         .throwOnError();
      return (data ?? []) as SettingRow[];
   },

   /** Only the value can be changed (the column-level grant allows nothing else). */
   async save({ id, value }: SettingInput) {
      await supabase.from('setting').update({ value }).eq('id', id).throwOnError();
   }
};

/** The company's setting rows, as stored. */
export function useSettingRows() {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.list(tenantId.value, 'setting')),
      queryFn: ({ signal }) => settingRepository.list(signal)
   });
}

/** The company's settings by key. */
export function useSettings() {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.list(tenantId.value, 'setting')),
      queryFn: ({ signal }) => settingRepository.list(signal),
      select: (rows): Record<string, Json> =>
         Object.fromEntries(rows.map(({ key, value }) => [key, value]))
   });
}

/** A setting's value, or `fallback` while the settings load or when the key is not stored. */
export function useSetting<T>(key: string, fallback: T) {
   const { data } = useSettings();
   return computed<T>(() => (data.value?.[key] as T | undefined) ?? fallback);
}

export function useSaveSetting() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: settingRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['setting'])
   });
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** How a setting's value is edited, from its JSON type. */
export type SettingKind = 'boolean' | 'number' | 'date' | 'text';

export const settingKind = (value: Json): SettingKind => {
   if (typeof value === 'boolean') return 'boolean';
   if (typeof value === 'number') return 'number';
   if (typeof value === 'string' && DATE.test(value)) return 'date';
   return 'text';
};

/** A stored `YYYY-MM-DD` as a local date for a date picker. */
export const toPickerDate = (value: string): Date => {
   const [, year, month, day] = DATE.exec(value) ?? [];
   return new Date(Number(year), Number(month) - 1, Number(day));
};

/** A picked local date back as `YYYY-MM-DD`. */
export const fromPickerDate = (date: Date): string =>
   [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
   ].join('-');
