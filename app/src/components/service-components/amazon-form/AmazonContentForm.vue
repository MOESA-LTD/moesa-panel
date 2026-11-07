<script setup lang="ts">
import { amazonErrorText, type AmazonIssue } from '@/api/amazon';
import type { Attributes } from '@edge-shared/listingCompleteness';
import AmazonAttributeForm from './AmazonAttributeForm.vue';
import type { AmazonContent } from './useAmazonContent';

// A product's Amazon content (useAmazonContent): the product type picker, the schema's version
// (and a notice when it moved since the save), and the attribute form. The product's Amazon tab
// and the cell drawer show it; each saves the content its own way.
const props = defineProps<{
   content: AmazonContent;
   languageTag: string;
   /** Attributes the server fills on publish; they count as filled. */
   provided: string[];
   readonly?: boolean;
   /** Amazon's issues of the latest submission. */
   issues?: AmazonIssue[];
   /** An attribute to open (its group) and focus once shown. */
   focusField?: string | null;
}>();
const emit = defineEmits<{ 'update:languageTag': [languageTag: string] }>();

// The content's refs are fixed for its lifetime: taken once, they stay reactive.
const {
   attributes,
   resetKey,
   customerId,
   tenantId,
   productType,
   typeInput,
   query,
   typeOptions,
   pickType,
   definition,
   definitionError,
   schemaMoved
} = props.content;
const setAttributes = (values: Attributes) => (attributes.value = values);
const search = (text: string) => (query.value = text);
</script>

<template>
   <div class="flex w-full flex-col gap-4">
      <FormField
         fluid
         :label="$t('ops.amazon.tab.product_type')"
         :readonly="readonly"
         v-slot="slotProps"
      >
         <AutoComplete
            v-bind="slotProps"
            v-model="typeInput"
            :suggestions="typeOptions"
            optionLabel="label"
            :placeholder="$t('ops.amazon.tab.product_type_search')"
            :disabled="readonly"
            :emptySearchMessage="$t('ops.amazon.tab.product_type_none')"
            @complete="search($event.query)"
            @optionSelect="pickType($event.value)"
         />
      </FormField>

      <Message v-if="definitionError" severity="error">
         {{ amazonErrorText(definitionError) }}
      </Message>
      <Message v-else-if="!productType" severity="secondary">
         {{ $t('ops.amazon.tab.product_type_empty') }}
      </Message>

      <template v-if="definition">
         <span
            class="text-sm text-surface-500"
            v-text="$t('ops.amazon.tab.schema_version', { version: definition.version })"
         />
         <Message v-if="schemaMoved" data-schema-moved severity="warn">
            {{ $t('ops.amazon.tab.schema_moved', { version: definition.version }) }}
         </Message>
         <AmazonAttributeForm
            :modelValue="attributes"
            :languageTag
            :resetKey
            @update:modelValue="setAttributes"
            @update:languageTag="emit('update:languageTag', $event)"
            :definition
            :provided
            :readonly
            :issues
            :customerId
            :tenantId
            :focusField
         />
      </template>
   </div>
</template>
