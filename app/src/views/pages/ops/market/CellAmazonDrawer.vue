<script setup lang="ts">
import {
   AMAZON_LANGUAGE_TAGS,
   AMAZON_SCHEMA_LOCALE,
   amazonErrorText,
   amazonSchemaOf,
   DEFAULT_AMAZON_LANGUAGE,
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
   useProductIsParent,
   usePublishCell,
   useRefreshCellStatus,
   useValidateCell,
   type AmazonIssue,
   type ApiConnection,
   type CellPublication,
   type ListingState,
   type ListingSubmissionRow,
   type ValidateResult
} from '@/api/amazon';
import { defaultCurrencyFor } from '@/constants/currency';
import { glossaryKey } from '@/api/glossary';
import { marketCellResource, STOCK_SOURCES } from '@/api/marketMatrix';
import { productResource } from '@/api/product';
import type { ResourceInput } from '@/api/defineResource';
import { invalidateTables } from '@/api/queryKeys';
import AmazonAttributeField from '@/components/service-components/amazon-form/AmazonAttributeField.vue';
import AmazonContentForm from '@/components/service-components/amazon-form/AmazonContentForm.vue';
import {
   badgeFor,
   baseAttribute,
   missingInFormOrder,
   NOTHING_PROVIDED
} from '@/components/service-components/amazon-form/amazonForm';
import { useAmazonContent } from '@/components/service-components/amazon-form/useAmazonContent';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { appErrorHandler } from '@/lib/appErrorHandler';
import {
   languageTag as defaultLanguageTag,
   missingAttributes,
   providedAttributes,
   requiredAttributes,
   type AmazonSchema,
   type PropertyGroups,
   type ProvidedAttributes
} from '@edge-shared/listingCompleteness';
import { useAbility } from '@casl/vue';
import { ToastSeverity } from '@primevue/core/api';
import { useQueryClient } from '@tanstack/vue-query';
import dayjs from 'dayjs';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

// The Amazon side of a market cell, opened from the cell's dialog, in two tabs. The listing tab:
// whether the customer's account is connected, what the product still misses for THIS marketplace
// and language, the cell's marketplace fields, Amazon's catalogue match and restriction, the
// submissions with Amazon's issues verbatim, and the actions. The content tab: the product's whole
// Amazon content, with the product's Amazon tab form. Both tabs edit one state of the product's
// attributes. Every Amazon call goes through the API module (which sends the tenant header). A
// cell whose customer is not connected is shown as draft (ruling N2).
type DrawerTab = 'listing' | 'content';
const props = defineProps<{ cellId: string }>();
/** The tab shown; the cell's dialog widens the drawer for the content tab. */
const tab = defineModel<DrawerTab>('tab', { default: 'listing' });
/** A check older than this runs again when the drawer opens. */
const CHECK_STALE_MS = 60 * 60 * 1000;

const { t, te } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const ability = useAbility();
const queryClient = useQueryClient();

const canSubmit = computed(() => ability.can('create', 'listing_submission'));
const canEditCell = computed(() => ability.can('update', 'market_cell'));
const canEditProduct = computed(() => ability.can('update', 'product'));

// --- the cell, its product and its customer's account ---

const { data: cellData } = marketCellResource.useOne(() => props.cellId);
const cell = computed(() => cellData.value ?? null);
const { data: product } = productResource.useOne(() => cell.value?.product_id ?? null);
const { data: isParent } = useProductIsParent(() => cell.value?.product_id ?? null);
// Without the right to read the accounts the connection is not known here: the stored state is
// shown and the function decides. While they load there is no verdict either.
const canReadAccounts = computed(() => ability.can('select', 'customer_platform_account'));
const { data: accounts } = useAmazonAccounts(() =>
   cell.value && canReadAccounts.value ? { customerId: cell.value.customer_id } : null
);
const account = computed(() => accounts.value?.[0] ?? null);
/** The account's connection; null while it is not known (loading, or not readable). */
const apiConnection = computed<ApiConnection | null>(() =>
   canReadAccounts.value && accounts.value ? (account.value?.api_connection ?? 'none') : null
);
const connected = computed(() => apiConnection.value === 'connected');
/** Known not to be connected (N2). */
const notConnected = computed(() => apiConnection.value !== null && !connected.value);
/** The connection is still being read. */
const connectionLoading = computed(() => canReadAccounts.value && !accounts.value);

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
         !notConnected.value
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
           locale: AMAZON_SCHEMA_LOCALE,
           customerId: product.value.customer_id
        }
      : null
);
const schema = computed(() => (definition.value ? amazonSchemaOf(definition.value) : null));

// The product's Amazon content, edited in both tabs (the listing tab's fields in the cell's
// language); a save writes only the attributes edited here, as the product's Amazon tab does.
const content = useAmazonContent(product, country);
const {
   attributes,
   saved: savedAttributes,
   resetKey,
   dirty: contentDirty,
   saving: savingContent,
   reset: resetContent
} = content;

/**
 * What is provided in a language against a schema: what the server fills on publish (the GTIN,
 * the price; a parent's, R7) and what the product card gives; nothing while unknown.
 */
const providedIn = (
   languageTag: string | null,
   productSchema: AmazonSchema | null
): ProvidedAttributes =>
   product.value && cell.value && isParent.value !== undefined && languageTag
      ? providedAttributes(product.value, cell.value, productSchema, {
           marketplaceId: marketplaceId.value ?? '',
           languageTag,
           isParent: isParent.value
        })
      : NOTHING_PROVIDED;
/** Provided in the cell's language, against the saved type's schema (the listing tab). */
const provided = computed(() => providedIn(language.value, schema.value));

/**
 * The required fields still missing in what is saved, by the server's rule (the GTIN and the price
 * provide some, and a variation parent has the identifier and the offer provided, R7), in the
 * Amazon form's order; null while unknown.
 */
const missing = computed(() => {
   if (!definition.value || !schema.value || !product.value || !cell.value) return null;
   if (isParent.value === undefined) return null;
   if (!marketplaceId.value || !language.value) return null;
   const groups = definition.value.property_groups as PropertyGroups;
   return missingInFormOrder(
      missingAttributes(schema.value, groups, savedAttributes.value, {
         marketplaceId: marketplaceId.value,
         languageTag: language.value,
         provided: Object.keys(provided.value.sources)
      }),
      groups
   );
});

/** Fields an issue's Fix opened here besides the missing ones. */
const opened = ref<string[]>([]);
/** The fields edited here: the missing ones, then those opened from an issue. */
const inlineFields = computed(() => {
   if (!schema.value || !missing.value) return [];
   const missingNames = missing.value.map(({ attribute }) => attribute);
   return _uniq([...missingNames, ...opened.value]).flatMap((name) => {
      const property = schema.value!.properties[name];
      return property ? [{ name, property, missing: missingNames.includes(name) }] : [];
   });
});
const required = computed(() =>
   schema.value ? requiredAttributes(schema.value, attributes.value) : []
);

const completenessSection = ref<HTMLElement | null>(null);
const FOCUSABLE =
   'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The attribute an issue names (it may name a part: `a[...]`, `a.b`), when the schema has it. */
const issueTarget = (issue: AmazonIssue) => {
   const name = issue.attributeNames[0];
   if (!name) return null;
   const base = baseAttribute(name);
   return schema.value?.properties[base] ? base : null;
};
/** Opens the attribute among the fields here, and scrolls to and focuses it. */
const fix = async (attribute: string) => {
   if (!opened.value.includes(attribute)) opened.value.push(attribute);
   await nextTick();
   const field = completenessSection.value?.querySelector<HTMLElement>(
      `[data-inline-field="${CSS.escape(attribute)}"]`
   );
   field?.scrollIntoView?.({ block: 'center' });
   field?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
};

/**
 * Saves the content from either tab: the attributes edited here, and the product type with its
 * schema's version when the type was changed or its schema moved.
 */
const saveContent = async () => {
   if (!canEditProduct.value || !contentDirty.value) return;
   const columns =
      content.typeChanged.value || content.schemaMoved.value ? content.typeColumns() : {};
   // A type picked whose schema is not loaded yet: nothing to save it with.
   if (!columns) return;
   try {
      await content.save(columns);
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

// Closing the drawer (see CellUpsert) or the cell's dialog with unsaved Amazon content asks first.
const allowClose = useUnsavedChangesGuard(contentDirty);
defineExpose({ allowClose });

/**
 * The product's Amazon tab in this cell's market and language, opened on a field when given (an
 * issue may name a part: `a[...]`, `a.b`).
 */
const amazonTab = (field?: string) => ({
   name: 'ops-product-manage-amazon',
   params: { id: cell.value?.product_id },
   query: {
      market: country.value,
      ...(language.value ? { lang: language.value } : {}),
      ...(field ? { field: baseAttribute(field) } : {})
   }
});

// --- the content tab ---

/** The content tab's form is built when the tab is first shown, then kept. */
const contentShown = ref(false);
watch(tab, (shown) => shown === 'content' && (contentShown.value = true), { immediate: true });

// The content opens in the cell's language, until another one is picked there.
const contentLanguagePicked = ref(false);
const contentLanguage = ref(language.value ?? DEFAULT_AMAZON_LANGUAGE);
watch(language, (tag) => {
   if (!contentLanguagePicked.value && tag) contentLanguage.value = tag;
});
const pickContentLanguage = (tag: string) => {
   contentLanguagePicked.value = true;
   contentLanguage.value = tag;
};
/** Provided in the content tab's language, against the schema of the type picked there. */
const contentProvided = computed(() =>
   providedIn(
      contentLanguage.value,
      content.definition.value ? amazonSchemaOf(content.definition.value) : null
   )
);

/** Edited, and savable: a changed product type needs its schema loaded. */
const contentSavable = computed(
   () => contentDirty.value && (!content.typeChanged.value || !!content.typeColumns())
);

/** The field the content form opens and focuses (as the product tab's `?field=` link). */
const contentFocus = ref<string | null>(null);
/** Shows the content tab on the attribute's group, and focuses it. */
const openInContent = async (attribute: string) => {
   tab.value = 'content';
   // Cleared first, so the same field opened again is focused again.
   contentFocus.value = null;
   await nextTick();
   contentFocus.value = baseAttribute(attribute);
};

// --- marketplace fields, saved through the cell ---

type MarketplaceFields = Pick<
   ResourceInput<'market_cell'>,
   'price' | 'currency' | 'listing_language' | 'fulfillment_channel' | 'stock_source'
>;
const fieldsOf = (row: typeof cell.value): MarketplaceFields => ({
   price: row?.price ?? null,
   currency: row?.currency ?? defaultCurrencyFor(row?.country),
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

/** The catalogue check: its own date (`checked_at`), not the cell's last state write. */
type Match = {
   asin: string | null;
   restricted: boolean;
   reasons: string[];
   checked_at?: string | null;
};
const match = computed(
   () => (checked.value ? checked.value.match : (cell.value?.listing_match ?? null)) as Match | null
);

// --- history ---

const { data: submissions } = useListingSubmissions(() => props.cellId);
/** The issues of the latest submission, as the content form shows them. */
const latestIssues = computed(() => submissions.value?.[0]?.issues ?? []);
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
/** A submission's kind or status; a value the app does not know reads as unknown. */
const submissionText = (part: 'kind' | 'status', value: string) =>
   te(`ops.amazon.submission.${part}.${value}`)
      ? t(`ops.amazon.submission.${part}.${value}`)
      : t(`ops.amazon.submission.${part}.unknown`);
const time = (value: string | null | undefined) =>
   value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';

// --- actions ---

type Blocked =
   | 'not_connected'
   | 'product_type'
   | 'missing'
   | 'unsaved_attributes'
   | 'unsaved'
   | 'submitted'
   | 'unchecked';
/** Why Publish is held back, the first reason first; null when it may go. */
const blocked = computed<Blocked | null>(() => {
   if (notConnected.value) return 'not_connected';
   if (!productType.value) return 'product_type';
   if (missing.value?.length) return 'missing';
   if (contentDirty.value) return 'unsaved_attributes';
   if (fieldsDirty.value) return 'unsaved';
   if (state.value === 'submitted') return 'submitted';
   if (!PUBLISHABLE_STATES.includes(state.value as ListingState)) return 'unchecked';
   return null;
});

const { mutateAsync: publish, isPending: publishing } = usePublishCell();
const { mutateAsync: validate, isPending: validating } = useValidateCell();
const { mutateAsync: removeListing, isPending: removing } = useDeleteListing();
const { mutateAsync: refreshStatus, isPending: refreshing } = useRefreshCellStatus();
// A check writes the state too: no publish or removal runs alongside it, nor a refresh.
const busy = computed(
   () => publishing.value || removing.value || checking.value || refreshing.value
);
/** A listing Amazon has (or had) in hand: its status can be asked for now (the poll's job). */
const canRefresh = computed(
   () => (state.value === 'submitted' || state.value === 'issues') && !!submissions.value?.length
);

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

const runRefresh = async () => {
   try {
      answer(await refreshStatus(props.cellId));
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
   <div v-if="cell" class="flex flex-col gap-4">
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

      <Tabs v-model:value="tab">
         <TabList>
            <Tab value="listing" data-tab="listing">{{ $t('ops.amazon.cell.tabs.listing') }}</Tab>
            <Tab value="content" data-tab="content">{{ $t('ops.amazon.cell.tabs.content') }}</Tab>
         </TabList>
         <TabPanels class="!px-0">
            <TabPanel value="listing" data-tab-panel="listing" class="flex flex-col gap-6">
               <!-- 1. connection -->
               <section class="flex flex-col gap-2" data-section="connection">
                  <h3 class="m-0 text-base font-semibold">
                     {{ $t('ops.amazon.cell.connection') }}
                  </h3>
                  <span class="flex flex-wrap items-center gap-2">
                     <Tag
                        v-if="apiConnection"
                        data-api-connection
                        :value="$t(`ops.amazon.api_connection.${apiConnection}`)"
                        :severity="
                           connected
                              ? 'success'
                              : apiConnection === 'revoked'
                                ? 'danger'
                                : 'secondary'
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
                  <Message v-if="notConnected" severity="warn" class="w-full">
                     {{ $t('ops.amazon.cell.not_connected') }}
                     <RouterLink
                        :to="{
                           name: 'ops-customer-manage-platforms',
                           params: { id: cell.customer_id }
                        }"
                     >
                        {{ $t('ops.amazon.cell.open_platforms') }}
                     </RouterLink>
                  </Message>
               </section>

               <!-- 2. completeness -->
               <section
                  ref="completenessSection"
                  class="flex flex-col gap-2"
                  data-section="completeness"
               >
                  <h3 class="m-0 text-base font-semibold">
                     {{ $t('ops.amazon.cell.completeness') }}
                     <small class="font-normal text-muted-color">{{ language }}</small>
                  </h3>
                  <!-- The product's tab opens in a new browser tab: it would open under this dialog. -->
                  <Message v-if="!productType" severity="warn" class="w-full">
                     {{ $t('ops.amazon.cell.product_type_missing') }}
                     <RouterLink :to="amazonTab()" target="_blank" rel="noopener">
                        {{ $t('ops.amazon.cell.open_tab') }}
                     </RouterLink>
                  </Message>
                  <Message v-else-if="definitionError" severity="error" class="w-full">
                     {{ amazonErrorText(definitionError) }}
                  </Message>
                  <template v-else-if="missing && language">
                     <small v-if="!missing.length" class="text-muted-color">
                        {{ $t('ops.amazon.cell.missing_none') }}
                     </small>
                     <div
                        v-for="field in inlineFields"
                        :key="field.name"
                        :data-inline-field="field.name"
                        :data-missing="field.missing ? field.name : undefined"
                     >
                        <AmazonAttributeField
                           :name="field.name"
                           :property="field.property"
                           :modelValue="attributes"
                           :languageTag="language"
                           :badge="badgeFor(field.name, required)"
                           :source="provided.sources[field.name] ?? null"
                           :derived="provided.attributes[field.name] ?? null"
                           :productId="product?.id"
                           :readonly="!canEditProduct"
                           :customerId="product?.customer_id"
                           :tenantId="product?.tenant_id"
                           :resetKey
                           @update:modelValue="attributes = $event"
                        />
                        <Button
                           data-action="open-in-content"
                           variant="link"
                           size="small"
                           class="!p-0"
                           :label="$t('ops.amazon.cell.open_in_content')"
                           @click="openInContent(field.name)"
                        />
                     </div>
                     <template v-if="inlineFields.length">
                        <span v-if="canEditProduct" class="flex flex-wrap gap-2">
                           <Button
                              data-action="reset-attributes"
                              size="small"
                              severity="secondary"
                              variant="outlined"
                              :label="$t('action.reset')"
                              :disabled="!contentDirty || savingContent"
                              @click="resetContent"
                           />
                           <Button
                              data-action="save-attributes"
                              size="small"
                              :label="$t('ops.amazon.cell.attributes_save')"
                              :disabled="!contentSavable"
                              :loading="savingContent"
                              @click="saveContent"
                           />
                        </span>
                        <small v-else data-attributes-readonly class="text-muted-color">
                           {{ $t('errors.insufficient_permission') }}
                        </small>
                     </template>
                  </template>
                  <span v-if="productType">
                     <RouterLink data-open-all :to="amazonTab()" target="_blank" rel="noopener">
                        {{ $t('ops.amazon.cell.open_all') }}
                     </RouterLink>
                  </span>
               </section>

               <!-- 3. marketplace fields -->
               <section class="flex flex-col gap-2" data-section="marketplace">
                  <h3 class="m-0 text-base font-semibold">
                     {{ $t('ops.amazon.cell.marketplace') }}
                  </h3>
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
                        <SelectCurrency
                           v-bind="slotProps"
                           v-model="fields.currency"
                           show-clear
                           :disabled="!canEditCell"
                        />
                     </FormField>
                     <FormField
                        fluid
                        :label="$t('ops.amazon.cell.listing_language')"
                        v-slot="slotProps"
                     >
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
                     <FormField
                        fluid
                        :label="$t('ops.amazon.cell.fulfillment_channel')"
                        v-slot="slotProps"
                     >
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
                     <FormField
                        fluid
                        :label="$t('ops.market.fields.stock_source')"
                        v-slot="slotProps"
                     >
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
                  <small v-if="match?.checked_at" data-checked-at class="text-muted-color">
                     {{ $t('ops.amazon.cell.checked_at', { date: time(match.checked_at) }) }}
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
                           {{ submissionText('kind', submission.kind) }}
                        </span>
                        <Tag
                           :value="submissionText('status', submission.status)"
                           :severity="STATUS_SEVERITY[submission.status] ?? 'secondary'"
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
                              <Button
                                 v-if="issueTarget(issue)"
                                 data-action="issue-fix"
                                 variant="link"
                                 size="small"
                                 class="!p-0"
                                 :label="$t('ops.amazon.cell.issue_fix')"
                                 @click="fix(issueTarget(issue)!)"
                              />
                              <Button
                                 v-if="issueTarget(issue)"
                                 data-action="open-in-content"
                                 variant="link"
                                 size="small"
                                 class="!p-0"
                                 :label="$t('ops.amazon.cell.open_in_content')"
                                 @click="openInContent(issueTarget(issue)!)"
                              />
                              <!-- A field the schema does not have: only the product's tab may know it. -->
                              <RouterLink
                                 v-else-if="issue.attributeNames[0]"
                                 :to="amazonTab(issue.attributeNames[0])"
                                 target="_blank"
                                 rel="noopener"
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
                        :disabled="notConnected || connectionLoading || !productType || busy"
                        :loading="validating"
                        @click="runValidate"
                     />
                     <Button
                        data-action="publish"
                        :icon="PrimeIcons.AMAZON"
                        :label="$t(listed ? 'ops.amazon.cell.update' : 'ops.amazon.cell.publish')"
                        :disabled="
                           blocked !== null || missing === null || connectionLoading || busy
                        "
                        :loading="publishing"
                        @click="runPublish"
                     />
                     <Button
                        v-if="listed"
                        data-action="delete"
                        variant="outlined"
                        severity="danger"
                        :label="$t('ops.amazon.cell.delete')"
                        :disabled="notConnected || connectionLoading || busy"
                        :loading="removing"
                        @click="askRemove"
                     />
                     <Button
                        v-if="canRefresh"
                        data-action="refresh-status"
                        variant="outlined"
                        :icon="PrimeIcons.SYNC"
                        :label="$t('ops.amazon.cell.refresh_status')"
                        :disabled="notConnected || connectionLoading || busy"
                        :loading="refreshing"
                        @click="runRefresh"
                     />
                  </span>
                  <small v-if="blocked" data-blocked class="text-muted-color">{{
                     $t(`ops.amazon.cell.publish_blocked.${blocked}`)
                  }}</small>
                  <Message v-if="sent" data-published severity="info" class="w-full">
                     {{
                        $t('ops.amazon.cell.published', {
                           status: submissionText('status', sent.status)
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
            </TabPanel>

            <TabPanel value="content" data-tab-panel="content">
               <div v-if="contentShown && product" class="flex flex-col gap-4">
                  <Message data-content-notice severity="secondary" size="small">
                     {{ $t('ops.amazon.cell.content_notice', { language: contentLanguage }) }}
                  </Message>
                  <AmazonContentForm
                     :content
                     :languageTag="contentLanguage"
                     @update:languageTag="pickContentLanguage"
                     :provided="contentProvided"
                     :readonly="!canEditProduct"
                     :issues="latestIssues"
                     :focusField="contentFocus"
                  />
                  <span v-if="canEditProduct" class="flex flex-wrap gap-2">
                     <Button
                        data-action="reset-content"
                        severity="secondary"
                        variant="outlined"
                        :label="$t('action.reset')"
                        :disabled="!contentDirty || savingContent"
                        @click="resetContent"
                     />
                     <Button
                        data-action="save-content"
                        :label="$t('ops.amazon.tab.save')"
                        :disabled="!contentSavable"
                        :loading="savingContent"
                        @click="saveContent"
                     />
                  </span>
                  <small v-else data-content-readonly class="text-muted-color">
                     {{ $t('errors.insufficient_permission') }}
                  </small>
               </div>
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
