<script setup lang="ts">
import {
   AMAZON_LANGUAGE_TAGS,
   amazonErrorText,
   amazonSchemaOf,
   issueField,
   LISTING_STATES,
   listingStateLabel,
   listingStateSeverity,
   marketplaceIdFor,
   PUBLISHABLE_STATES,
   shownListingState,
   useAmazonAccounts,
   useCellCheck,
   useDefinition,
   useDeleteListing,
   useListingSubmissions,
   usePublishCell,
   useValidateCell,
   type AmazonIssue,
   type CellPublication,
   type ListingState,
   type ListingSubmissionRow,
   type ValidateResult
} from '@/api/amazon';
import { glossaryKey } from '@/api/glossary';
import { marketCellResource, STOCK_SOURCES } from '@/api/marketMatrix';
import { productResource } from '@/api/product';
import type { ResourceInput } from '@/api/defineResource';
import { invalidateTables } from '@/api/queryKeys';
import { appErrorHandler } from '@/lib/appErrorHandler';
import {
   languageTag as defaultLanguageTag,
   missingAttributes,
   serverProvided,
   type Attributes,
   type PropertyGroups
} from '@edge-shared/listingCompleteness';
import { useAbility } from '@casl/vue';
import { ToastSeverity } from '@primevue/core/api';
import { useQueryClient } from '@tanstack/vue-query';
import dayjs from 'dayjs';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

// The Amazon side of a market cell, opened from the cell's dialog: whether the customer's account
// is connected, what the product still misses for THIS marketplace and language, the cell's
// marketplace fields, Amazon's catalogue match and restriction, the submissions with Amazon's
// issues verbatim, and the actions. Every Amazon call goes through the API module (which sends
// the tenant header). A cell whose customer is not connected is shown as draft (ruling N2).
const props = defineProps<{ cellId: string }>();

/** The locale of the schema's titles (Amazon's own text), as on the product's Amazon tab. */
const SCHEMA_LOCALE = 'en_GB';
/** A check older than this runs again when the drawer opens. */
const CHECK_STALE_MS = 60 * 60 * 1000;

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const ability = useAbility();
const queryClient = useQueryClient();

const canSubmit = computed(() => ability.can('create', 'listing_submission'));
const canEditCell = computed(() => ability.can('update', 'market_cell'));

// --- the cell, its product and its customer's account ---

const { data: cellData } = marketCellResource.useOne(() => props.cellId);
const cell = computed(() => cellData.value ?? null);
const { data: product } = productResource.useOne(() => cell.value?.product_id ?? null);
const { data: accounts } = useAmazonAccounts(() =>
   cell.value ? { customerId: cell.value.customer_id } : null
);
const account = computed(() => accounts.value?.[0] ?? null);
const apiConnection = computed(() => account.value?.api_connection ?? 'none');
const connected = computed(() => apiConnection.value === 'connected');

/**
 * The state a publish, a removal or a check answered, until the cell is loaded again (with the
 * state they wrote); the latest answer wins.
 */
const answeredState = ref<string | null>(null);
watch(cell, () => (answeredState.value = null));
/** The submission the last publish or removal of this drawer made. */
const sent = ref<CellPublication['submission'] | null>(null);
const answer = ({ cell: row, submission }: CellPublication) => {
   answeredState.value = row.listing_state;
   sent.value = submission;
};

const state = computed(
   () =>
      shownListingState(
         answeredState.value ?? cell.value?.listing_state ?? null,
         connected.value
      ) ?? 'draft'
);

// --- completeness for this marketplace and language ---

const country = computed(() => cell.value?.country ?? '');
const marketplaceId = computed(() => marketplaceIdFor(country.value));
const language = computed(() => defaultLanguageTag(country.value, cell.value?.listing_language));
const productType = computed(() => product.value?.amazon_product_type ?? null);

const { data: definition, error: definitionError } = useDefinition(() =>
   productType.value && product.value && marketplaceId.value
      ? {
           productType: productType.value,
           country: country.value,
           locale: SCHEMA_LOCALE,
           customerId: product.value.customer_id
        }
      : null
);
const schema = computed(() => (definition.value ? amazonSchemaOf(definition.value) : null));

/** The required fields still missing (the server's rule: the GTIN and the price provide some); null while unknown. */
const missing = computed(() => {
   if (!definition.value || !schema.value || !product.value || !cell.value) return null;
   if (!marketplaceId.value || !language.value) return null;
   return missingAttributes(
      schema.value,
      definition.value.property_groups as PropertyGroups,
      (product.value.listing_attributes ?? {}) as unknown as Attributes,
      {
         marketplaceId: marketplaceId.value,
         languageTag: language.value,
         provided: serverProvided(product.value, cell.value)
      }
   );
});

const fieldTitle = (attribute: string) => schema.value?.properties[attribute]?.title ?? attribute;

/** The product's Amazon tab, opened on a field (an issue may name a part: `a[...]`, `a.b`). */
const amazonTab = (field?: string) => ({
   name: 'ops-product-manage-amazon',
   params: { id: cell.value?.product_id },
   ...(field ? { query: { field: field.split(/[[.]/)[0] } } : {})
});

// --- marketplace fields, saved through the cell ---

type MarketplaceFields = Pick<
   ResourceInput<'market_cell'>,
   'price' | 'currency' | 'listing_language' | 'fulfillment_channel' | 'stock_source'
>;
const fieldsOf = (row: typeof cell.value): MarketplaceFields => ({
   price: row?.price ?? null,
   currency: row?.currency ?? null,
   listing_language: row?.listing_language ?? null,
   fulfillment_channel: row?.fulfillment_channel ?? null,
   stock_source: row?.stock_source ?? null
});
const fields = ref<MarketplaceFields>(fieldsOf(cell.value));
// A reload replaces the fields unless they were edited here.
watch(cell, (row, before) => {
   if (_isEqual(fields.value, fieldsOf(before ?? null))) fields.value = fieldsOf(row);
});
const fieldsDirty = computed(() => !_isEqual(fields.value, fieldsOf(cell.value)));

const FULFILLMENT_OPTIONS = computed(() =>
   ['fbm', 'fba'].map((value) => ({ value, label: t(`ops.amazon.cell.fulfillment.${value}`) }))
);

const { mutateAsync: saveCell, isPending: savingFields } = marketCellResource.useSave();
const saveFields = async () => {
   // Kept as saved, so the reloaded cell matches the fields.
   fields.value.currency = fields.value.currency?.trim().toUpperCase() || null;
   try {
      await saveCell({ id: props.cellId, ...fields.value } as ResourceInput<'market_cell'>);
      toast.add({
         life: 3000,
         severity: ToastSeverity.SUCCESS,
         summary: t('toast.success'),
         detail: t('toast.saved')
      });
   } catch (error) {
      appErrorHandler(error);
   }
};

// --- catalogue match and restriction ---

// Asked for when the drawer opens on a check older than an hour, and by the Check button. Once
// asked, the check stays on for the drawer and runs again after a publish (it keeps the state).
const checkAsked = ref(false);
const {
   data: checked,
   dataUpdatedAt: checkedAt,
   error: checkError,
   isFetching: checking,
   refetch: refetchCheck
} = useCellCheck(() => (canSubmit.value && checkAsked.value ? props.cellId : null));
const checkOpened = ref(false);
watch(
   cell,
   (row) => {
      if (!row || checkOpened.value) return;
      checkOpened.value = true;
      const at = row.listing_checked_at;
      if (canSubmit.value && (!at || dayjs().diff(dayjs(at)) > CHECK_STALE_MS))
         checkAsked.value = true;
   },
   { immediate: true }
);
const runCheck = () => {
   if (checkAsked.value) refetchCheck();
   else checkAsked.value = true;
};
// The check wrote the state and the match: the cell and the matrix read them again.
// Only the cell's own row: the check itself is a market_cell query, and must not run again.
watch(checkedAt, () => {
   if (checked.value) answeredState.value = checked.value.state;
   queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
         queryKey[2] === 'market_cell' && queryKey[3] === 'detail' && queryKey[4] === props.cellId
   });
   // The poll may have settled a submission since: the history is read again too.
   invalidateTables(queryClient, ['market_cell_overview', 'listing_submission']);
});

type Match = { asin: string | null; restricted: boolean; reasons: string[] };
const match = computed(
   () => (checked.value ? checked.value.match : (cell.value?.listing_match ?? null)) as Match | null
);

// --- history ---

const { data: submissions } = useListingSubmissions(() => props.cellId);
/** The listing exists on Amazon after a done create or update that no done removal followed. */
const listed = computed(() => {
   const latest = submissions.value?.find((submission) => submission.status === 'done');
   return !!latest && latest.kind !== 'delete';
});

const STATUS_SEVERITY: Record<ListingSubmissionRow['status'], string> = {
   accepted: 'info',
   processing: 'warn',
   done: 'success',
   invalid: 'danger',
   failed: 'danger',
   unknown: 'secondary'
};
const ISSUE_SEVERITY: Record<AmazonIssue['severity'], string> = {
   ERROR: 'danger',
   WARNING: 'warn',
   INFO: 'info',
   unknown: 'secondary'
};
const time = (value: string | null | undefined) =>
   value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';

// --- actions ---

type Blocked = 'not_connected' | 'product_type' | 'missing' | 'unsaved' | 'submitted' | 'unchecked';
/** Why Publish is held back, the first reason first; null when it may go. */
const blocked = computed<Blocked | null>(() => {
   if (!connected.value) return 'not_connected';
   if (!productType.value) return 'product_type';
   if (missing.value?.length) return 'missing';
   if (fieldsDirty.value) return 'unsaved';
   if (state.value === 'submitted') return 'submitted';
   if (!PUBLISHABLE_STATES.includes(state.value as ListingState)) return 'unchecked';
   return null;
});

const { mutateAsync: publish, isPending: publishing } = usePublishCell();
const { mutateAsync: validate, isPending: validating } = useValidateCell();
const { mutateAsync: removeListing, isPending: removing } = useDeleteListing();
const busy = computed(() => publishing.value || removing.value);

const fail = (error: unknown) =>
   toast.add({
      life: 8000,
      severity: ToastSeverity.ERROR,
      summary: t('ops.amazon.cell.title'),
      detail: amazonErrorText(error)
   });

const runPublish = async () => {
   try {
      answer(await publish(props.cellId));
   } catch (error) {
      fail(error);
   }
};

const validated = ref<ValidateResult | null>(null);
const runValidate = async () => {
   try {
      validated.value = await validate(props.cellId);
   } catch (error) {
      fail(error);
   }
};

const askRemove = () =>
   confirm.require({
      header: t('ops.amazon.cell.delete'),
      message: t('ops.amazon.cell.delete_confirm'),
      acceptProps: { label: t('ops.amazon.cell.delete'), severity: 'danger', outlined: true },
      rejectProps: { label: t('action.no'), severity: 'secondary', outlined: true },
      accept: async () => {
         try {
            answer(await removeListing(props.cellId));
         } catch (error) {
            fail(error);
         }
      }
   });
</script>

<template>
   <div v-if="cell" class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-2">
         <span class="font-semibold">
            {{ cell.product?.sku }} · {{ cell.country }} ({{ marketplaceId ?? '—' }})
         </span>
         <Tag
            :data-state="state"
            :value="listingStateLabel(state)"
            :severity="listingStateSeverity(state)"
            v-tooltip.bottom="
               LISTING_STATES.includes(state as ListingState)
                  ? $t(glossaryKey('listing_state', state))
                  : undefined
            "
         />
      </div>

      <!-- 1. connection -->
      <section class="flex flex-col gap-2" data-section="connection">
         <h3 class="m-0 text-base font-semibold">{{ $t('ops.amazon.cell.connection') }}</h3>
         <span class="flex flex-wrap items-center gap-2">
            <Tag
               data-api-connection
               :value="$t(`ops.amazon.api_connection.${apiConnection}`)"
               :severity="
                  connected ? 'success' : apiConnection === 'revoked' ? 'danger' : 'secondary'
               "
            />
            <small v-if="connected && account?.authorized_at" class="text-muted-color">
               {{
                  $t('ops.amazon.connect.connected_on', {
                     date: dayjs(account.authorized_at).format('YYYY-MM-DD')
                  })
               }}
            </small>
            <small v-if="connected && account?.seller_id" class="text-muted-color">
               {{ $t('ops.amazon.connect.seller_id', { id: account.seller_id }) }}
            </small>
         </span>
         <Message v-if="!connected" severity="warn" class="w-full">
            {{ $t('ops.amazon.cell.not_connected') }}
            <RouterLink
               :to="{ name: 'ops-customer-manage-platforms', params: { id: cell.customer_id } }"
            >
               {{ $t('ops.amazon.cell.open_platforms') }}
            </RouterLink>
         </Message>
      </section>

      <!-- 2. completeness -->
      <section class="flex flex-col gap-2" data-section="completeness">
         <h3 class="m-0 text-base font-semibold">
            {{ $t('ops.amazon.cell.completeness') }}
            <small class="font-normal text-muted-color">{{ language }}</small>
         </h3>
         <Message v-if="!productType" severity="warn" class="w-full">
            {{ $t('ops.amazon.cell.product_type_missing') }}
            <RouterLink :to="amazonTab()">{{ $t('ops.amazon.cell.open_tab') }}</RouterLink>
         </Message>
         <Message v-else-if="definitionError" severity="error" class="w-full">
            {{ amazonErrorText(definitionError) }}
         </Message>
         <template v-else-if="missing">
            <ul v-if="missing.length" class="m-0 flex flex-col gap-1 pl-5">
               <li v-for="field in missing" :key="field.attribute" :data-missing="field.attribute">
                  <RouterLink :to="amazonTab(field.attribute)">
                     {{
                        $t('ops.amazon.cell.missing_link', { field: fieldTitle(field.attribute) })
                     }}
                  </RouterLink>
               </li>
            </ul>
            <small v-else class="text-muted-color">{{ $t('ops.amazon.cell.missing_none') }}</small>
         </template>
      </section>

      <!-- 3. marketplace fields -->
      <section class="flex flex-col gap-2" data-section="marketplace">
         <h3 class="m-0 text-base font-semibold">{{ $t('ops.amazon.cell.marketplace') }}</h3>
         <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField fluid :label="$t('ops.market.fields.price')" v-slot="slotProps">
               <InputNumber
                  v-bind="slotProps"
                  v-model="fields.price"
                  :min="0"
                  :minFractionDigits="2"
                  :maxFractionDigits="2"
                  :disabled="!canEditCell"
               />
            </FormField>
            <FormField fluid :label="$t('ops.market.fields.currency')" v-slot="slotProps">
               <InputText
                  v-bind="slotProps"
                  v-model="fields.currency"
                  maxlength="3"
                  :disabled="!canEditCell"
               />
            </FormField>
            <FormField fluid :label="$t('ops.amazon.cell.listing_language')" v-slot="slotProps">
               <Select
                  v-bind="slotProps"
                  v-model="fields.listing_language"
                  data-field="listing_language"
                  :options="[...AMAZON_LANGUAGE_TAGS]"
                  :placeholder="defaultLanguageTag(cell.country) ?? undefined"
                  showClear
                  :disabled="!canEditCell"
               />
            </FormField>
            <FormField fluid :label="$t('ops.amazon.cell.fulfillment_channel')" v-slot="slotProps">
               <Select
                  v-bind="slotProps"
                  v-model="fields.fulfillment_channel"
                  data-field="fulfillment_channel"
                  :options="FULFILLMENT_OPTIONS"
                  optionValue="value"
                  optionLabel="label"
                  showClear
                  :disabled="!canEditCell"
               />
            </FormField>
            <FormField fluid :label="$t('ops.market.fields.stock_source')" v-slot="slotProps">
               <SelectEnum
                  v-bind="slotProps"
                  v-model="fields.stock_source"
                  :values="STOCK_SOURCES"
                  i18n-prefix="ops.market.stock_source"
                  glossary="stock_source"
                  showClear
                  :disabled="!canEditCell"
               />
            </FormField>
         </div>
         <span v-if="canEditCell">
            <Button
               data-action="save-fields"
               size="small"
               :label="$t('ops.amazon.cell.fields_save')"
               :disabled="!fieldsDirty"
               :loading="savingFields"
               @click="saveFields"
            />
         </span>
      </section>

      <!-- 4. catalogue match and restriction -->
      <section class="flex flex-col gap-2" data-section="match">
         <h3 class="m-0 text-base font-semibold">{{ $t('ops.amazon.cell.catalogue') }}</h3>
         <span v-if="!match">{{ $t('ops.amazon.cell.match.none') }}</span>
         <template v-else>
            <span>
               {{
                  match.asin
                     ? $t('ops.amazon.cell.match.found', { asin: match.asin })
                     : $t('ops.amazon.cell.match.new')
               }}
            </span>
            <span :class="{ 'text-red-500': match.restricted }">
               {{
                  match.restricted
                     ? $t('ops.amazon.cell.restriction.restricted', {
                          reasons: match.reasons.join(', ')
                       })
                     : $t('ops.amazon.cell.restriction.none')
               }}
            </span>
         </template>
         <small v-if="cell.listing_checked_at" class="text-muted-color">
            {{ $t('ops.amazon.cell.checked_at', { date: time(cell.listing_checked_at) }) }}
         </small>
         <Message v-if="checkError" severity="error" class="w-full">
            {{ amazonErrorText(checkError) }}
         </Message>
         <span v-if="canSubmit">
            <Button
               data-action="check"
               size="small"
               variant="outlined"
               :icon="PrimeIcons.REFRESH"
               :label="$t('ops.amazon.cell.check')"
               :loading="checking"
               @click="runCheck"
            />
         </span>
      </section>

      <!-- 5. history -->
      <section class="flex flex-col gap-2" data-section="history">
         <h3 class="m-0 text-base font-semibold">{{ $t('ops.amazon.cell.history') }}</h3>
         <small v-if="!submissions?.length" class="text-muted-color">
            {{ $t('ops.amazon.cell.history_empty') }}
         </small>
         <div
            v-for="submission in submissions"
            :key="submission.id"
            :data-submission="submission.id"
            class="flex flex-col gap-2 rounded border border-surface-200 p-3 dark:border-surface-700"
         >
            <span class="flex flex-wrap items-center gap-2">
               <span class="font-semibold">
                  {{ $t(`ops.amazon.submission.kind.${submission.kind}`) }}
               </span>
               <Tag
                  :value="$t(`ops.amazon.submission.status.${submission.status}`)"
                  :severity="STATUS_SEVERITY[submission.status]"
               />
               <small class="text-muted-color">{{ time(submission.created_at) }}</small>
            </span>
            <ul v-if="submission.issues.length" class="m-0 flex flex-col gap-2 pl-0">
               <li
                  v-for="(issue, index) in submission.issues"
                  :key="index"
                  data-issue
                  class="flex list-none flex-col gap-1"
               >
                  <span class="flex flex-wrap items-center gap-2">
                     <Tag :value="issue.code" :severity="ISSUE_SEVERITY[issue.severity]" />
                     <strong data-issue-field>{{
                        issueField(issue, schema) ?? $t('ops.amazon.cell.issue_general')
                     }}</strong>
                     <RouterLink
                        v-if="issue.attributeNames[0]"
                        :to="amazonTab(issue.attributeNames[0])"
                     >
                        {{ $t('ops.amazon.cell.open_tab') }}
                     </RouterLink>
                  </span>
                  <span>{{ issue.message }}</span>
               </li>
            </ul>
         </div>
      </section>

      <!-- 6. actions -->
      <section v-if="canSubmit" class="flex flex-col gap-2" data-section="actions">
         <span class="flex flex-wrap gap-2">
            <Button
               data-action="validate"
               variant="outlined"
               :label="$t('ops.amazon.cell.validate')"
               :disabled="!connected || !productType || busy"
               :loading="validating"
               @click="runValidate"
            />
            <Button
               data-action="publish"
               :icon="PrimeIcons.AMAZON"
               :label="$t(listed ? 'ops.amazon.cell.update' : 'ops.amazon.cell.publish')"
               :disabled="blocked !== null || missing === null || busy"
               :loading="publishing"
               @click="runPublish"
            />
            <Button
               v-if="listed"
               data-action="delete"
               variant="outlined"
               severity="danger"
               :label="$t('ops.amazon.cell.delete')"
               :disabled="!connected || busy"
               :loading="removing"
               @click="askRemove"
            />
         </span>
         <small v-if="blocked" data-blocked class="text-muted-color">{{
            $t(`ops.amazon.cell.publish_blocked.${blocked}`)
         }}</small>
         <Message v-if="sent" data-published severity="info" class="w-full">
            {{
               $t('ops.amazon.cell.published', {
                  status: $t(`ops.amazon.submission.status.${sent.status}`)
               })
            }}
         </Message>
         <Message
            v-if="validated"
            data-validated
            :severity="validated.status === 'VALID' ? 'success' : 'warn'"
            class="w-full"
         >
            <p class="m-0">{{ $t(`ops.amazon.cell.validated.${validated.status}`) }}</p>
            <ul v-if="validated.issues.length" class="m-0 mt-2 flex flex-col gap-1 pl-5">
               <li v-for="(issue, index) in validated.issues" :key="index" data-issue>
                  <strong data-issue-field>{{
                     issueField(issue, schema) ?? $t('ops.amazon.cell.issue_general')
                  }}</strong>
                  — {{ issue.code }}: {{ issue.message }}
               </li>
            </ul>
         </Message>
      </section>
   </div>
</template>
