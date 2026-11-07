<script setup lang="ts">
import {
   AMAZON_LANGUAGE_TAGS,
   amazonSchemaOf,
   DEFAULT_AMAZON_COUNTRY,
   DEFAULT_AMAZON_LANGUAGE,
   marketplaceIdFor,
   orderAmazonCells,
   useListingSubmissions,
   useProductAmazonCells
} from '@/api/amazon';
import { productResource } from '@/api/product';
import AmazonContentForm from '@/components/service-components/amazon-form/AmazonContentForm.vue';
import { NOTHING_PROVIDED } from '@/components/service-components/amazon-form/amazonForm';
import { useAmazonContent } from '@/components/service-components/amazon-form/useAmazonContent';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useAuthStore } from '@/store/auth';
import {
   languageTag as defaultLanguageTag,
   providedAttributes
} from '@edge-shared/listingCompleteness';
import i18n from '@plugins/i18n';
import { ToastSeverity } from '@primevue/core/api';
import { useToast } from 'primevue/usetoast';

// The product's Amazon content: its Amazon product type and the attribute values in Amazon's own
// shape, filled against the type's schema. The tab works in one Amazon cell's marketplace and
// shows the issues of that cell's latest submission: the cell of the market a link names
// (`?market=<country>`), else the first cell in the EU country order (DE, FR, IT, ES, NL, PL, SE,
// BE, GB, then id; DE without a cell). A link may also name the language (`?lang=<xx_YY>`) and a
// field to open (`?field=<attribute>`), as the cell drawer's links do.
const props = defineProps<{ id: string }>();

const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();

const { data: product } = productResource.useOne(() => props.id);
const { data: cells } = useProductAmazonCells(() => props.id);
const queryText = (name: string) =>
   typeof route.query[name] === 'string' ? (route.query[name] as string) : null;
const market = computed(() => queryText('market')?.toUpperCase() ?? null);
const cell = computed(() => {
   const ordered = orderAmazonCells(cells.value ?? []);
   return ordered.find(({ country }) => country === market.value) ?? ordered[0] ?? null;
});
const country = computed(() => cell.value?.country ?? DEFAULT_AMAZON_COUNTRY);
const canEdit = computed(
   () => !!product.value && authStore.canIn(product.value.tenant_id, 'update', 'product')
);

// The product type and the values: a product loading after the tab, or refetched after another tab
// saved it, replaces them unless they were edited here; a save writes only the attributes edited
// here (useAmazonContent).
const content = useAmazonContent(product, country);
const { definition, saving: isSubmitting, dirty: isDirty, reset } = content;

// The language a link names, else the working cell's language, until the user picks one.
const linkedLanguage = computed(() => {
   const tag = queryText('lang');
   return tag && (AMAZON_LANGUAGE_TAGS as readonly string[]).includes(tag) ? tag : null;
});
const languagePicked = ref(!!linkedLanguage.value);
const languageTag = ref(
   linkedLanguage.value ??
      defaultLanguageTag(country.value, cell.value?.listing_language) ??
      DEFAULT_AMAZON_LANGUAGE
);
watch(cell, (first) => {
   if (languagePicked.value) return;
   languageTag.value =
      defaultLanguageTag(country.value, first?.listing_language) ?? languageTag.value;
});
const pickLanguage = (tag: string) => {
   languagePicked.value = true;
   languageTag.value = tag;
};
watch(linkedLanguage, (tag) => tag && pickLanguage(tag));

// What the server fills and the product card gives, in the form's language and marketplace.
const provided = computed(() =>
   product.value
      ? providedAttributes(
           product.value,
           cell.value ?? {},
           definition.value ? amazonSchemaOf(definition.value) : null,
           {
              marketplaceId:
                 definition.value?.marketplace_id ?? marketplaceIdFor(country.value) ?? '',
              languageTag: languageTag.value
           }
        )
      : NOTHING_PROVIDED
);

const { data: submissions } = useListingSubmissions(() => cell.value?.id ?? null);
const issues = computed(() => submissions.value?.[0]?.issues ?? []);

const focusField = computed(() => queryText('field'));

// --- save ---
const submit = async () => {
   const columns = content.typeColumns();
   if (!product.value || !canEdit.value || !columns) return;
   try {
      await content.save(columns);
      toast.add({
         life: 3000,
         severity: ToastSeverity.SUCCESS,
         summary: i18n.t('toast.success'),
         detail: i18n.t('toast.saved')
      });
   } catch (error) {
      appErrorHandler(error);
   }
};
</script>

<template>
   <FormBox
      v-if="product"
      :readonly="!canEdit"
      :dirty="isDirty && !!product && !!definition"
      :submitting="isSubmitting"
      :submitText="$t('ops.amazon.tab.save')"
      @submit="submit"
      @reset="reset"
   >
      <AmazonContentForm
         :content
         :languageTag
         @update:languageTag="pickLanguage"
         :provided
         :readonly="!canEdit"
         :issues
         :focusField
      />
   </FormBox>
</template>
