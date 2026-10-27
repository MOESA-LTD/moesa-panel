import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { RECORD_STATUSES, RECORD_TYPES } from '@/constants/form/record';
import { optional, required, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';
import { saveRow } from '@/api/saveRow';

type StockCategory = { id?: string; display_name: string };

export type RecordStock = Views['stock_view']['Row'] & {
   product?: { category?: StockCategory[] } | null;
};

/** A record as the form loads it: with its stock (and the stock's product categories) and client. */
export type RecordWithRelations = Tables['record']['Row'] & {
   stock?: RecordStock | null;
   client?: { id: string; display_name: string; email?: string | null } | null;
};

export type RecordInput = Omit<Tables['record']['Insert'], 'tenant_id'>;

const DETAIL_SELECT =
   '*, stock:stock_view!inner(*, product(category:product_category(id,display_name))), client!inner(id,display_name)';

export const recordRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('record')
         .select(DETAIL_SELECT)
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as RecordWithRelations | null;
   },

   async save(values: RecordInput) {
      const data = await saveRow<{ id: string }>('record', values, 'id');

      return recordRepository.get(data.id, new AbortController().signal);
   }
};

export function useRecord(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'record', toValue(id))),
      queryFn: ({ signal }) => recordRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

export function useSaveRecord() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: recordRepository.save,
      // stock_view's available quantity is derived from records.
      onSuccess: () => invalidateTables(queryClient, ['record'])
   });
}

/** The stock's product is a hearing device, which needs the side it is fitted to. */
export const isDeviceStock = (stock?: RecordStock | null) =>
   !!stock?.product?.category?.some((category) => category.display_name === 'device');

const rearEarDevice = z.looseObject({
   type: requiredText(),
   model: requiredText(),
   side: requiredText(),
   ventilation: z.number(),
   speaker_size: z.number(),
   speaker_power: requiredText()
});

const innerEarDevice = z.looseObject({
   side: requiredText(),
   model: requiredText(),
   ventilation: z.number(),
   speaker_power: requiredText(),
   has_bluetooth: z.boolean().optional(),
   has_button: z.boolean().optional()
});

const amount = () => z.number().min(0);
const optionalAmount = () => amount().nullish();

export type RecordSchemaContext = {
   /** How much of the selected stock this record may use. */
   maxQuantity: number;
   /** Pieces are counted in whole units. */
   unitType?: string | null;
};

export const createRecordSchema = ({ maxQuantity, unitType }: RecordSchemaContext) =>
   z
      .object({
         id: z.string().optional(),
         client_id: requiredText(),
         stock_id: requiredText(),
         /** Joined relations; only used by the form. */
         stock: z.custom<RecordStock>().optional(),
         client: z.custom<RecordWithRelations['client']>().optional(),
         record_type: required(
            z.enum(RECORD_TYPES.value.map(({ value }) => value) as [string, ...string[]])
         ),
         record_status: requiredText(),
         quantity: required(
            z
               .number()
               .min(unitType === 'pcs' ? 1 : 0.01)
               .max(maxQuantity)
         ),
         payment_type: optional(z.string()),
         currency_code: requiredText(),
         bid: amount(),
         bid_discount: amount(),
         tax: amount(),
         details: optional(z.string()),
         attributes: z.looseObject({
            device_side: optional(z.string()),
            repair_fee: optionalAmount(),
            insurance_type: optional(z.string()),
            insurance_contribution: optionalAmount(),
            client_insurance_contribution: optionalAmount(),
            rear_ear_devices: z.array(rearEarDevice).optional(),
            inner_ear_devices: z.array(innerEarDevice).optional()
         })
      })
      .superRefine((record, ctx) => {
         const require = (path: (string | number)[]) =>
            ctx.addIssue({ code: 'invalid_type', expected: 'string', input: null, path });

         const statuses = (RECORD_STATUSES.value[record.record_type] ?? []).map(
            ({ value }: { value: string }) => value
         );
         if (record.record_status && !statuses.includes(record.record_status)) {
            ctx.addIssue({
               code: 'invalid_value',
               values: statuses,
               input: record.record_status,
               path: ['record_status']
            });
         }

         if (record.bid_discount > record.bid) {
            ctx.addIssue({
               code: 'too_big',
               origin: 'number',
               maximum: record.bid,
               inclusive: true,
               input: record.bid_discount,
               path: ['bid_discount']
            });
         }

         if (record.bid > 0 && !record.payment_type) require(['payment_type']);

         if (isDeviceStock(record.stock) && !record.attributes.device_side) {
            require(['attributes', 'device_side']);
         }

         if (record.record_type === 'repair' && record.attributes.repair_fee == null) {
            require(['attributes', 'repair_fee']);
         }

         // "None" is a valid insurance type; contributions only apply to an insured sale.
         if (record.attributes.insurance_type) {
            if (record.attributes.insurance_contribution == null) {
               require(['attributes', 'insurance_contribution']);
            }
            if (record.attributes.client_insurance_contribution == null) {
               require(['attributes', 'client_insurance_contribution']);
            }
         }
      });

export type RecordSchema = ReturnType<typeof createRecordSchema>;
export type RecordFormValues = z.input<RecordSchema>;

export const toRecordFormValues = (
   record?: Partial<RecordWithRelations> | null
): RecordFormValues => ({
   id: record?.id ?? undefined,
   client_id: record?.client_id ?? '',
   stock_id: record?.stock_id ?? '',
   stock: record?.stock ?? undefined,
   client: record?.client ?? undefined,
   record_type: record?.record_type ?? null,
   record_status: record?.record_status ?? '',
   quantity: record?.quantity != null ? Number(record.quantity) : null,
   payment_type: record?.payment_type ?? '',
   currency_code: record?.currency_code ?? 'TRY',
   bid: Number(record?.bid ?? 0),
   bid_discount: Number(record?.bid_discount ?? 0),
   tax: Number(record?.tax ?? 0),
   details: record?.details ?? '',
   attributes: {
      // Present from the start so that adding and removing a device leaves the form clean.
      rear_ear_devices: [],
      inner_ear_devices: [],
      ...((record?.attributes as Record<string, unknown>) ?? {})
   }
});

export const toRecordPayload = ({
   stock: _stock,
   client: _client,
   attributes,
   ...record
}: z.output<RecordSchema>): RecordInput => ({
   ...record,
   // A jsonb column; the schema keeps unknown keys, which zod types as `unknown`.
   attributes: attributes as Json
});
