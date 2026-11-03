<script setup lang="ts">
import { useLookup } from '@/api/useLookup';

/** Picks the signed contract among one saved customer's documents. */
type DocumentOption = Pick<Tables['document']['Row'], 'id' | 'type' | 'version' | 'file_name'>;

const props = defineProps<{ customerId: string }>();
const model = defineModel<string | null>();

const { t } = useI18n();
const { data: documents } = useLookup<DocumentOption>('document', () => ({
   select: 'id, type, version, file_name',
   in: { column: 'entity_id', values: [props.customerId] }
}));

const options = computed(() =>
   (documents.value ?? []).map((document) => ({
      value: document.id,
      label: [`${t(`ops.document.type.${document.type}`)} v${document.version}`, document.file_name]
         .filter(Boolean)
         .join(' — ')
   }))
);
</script>
<template>
   <Select v-model="model" :options option-value="value" option-label="label" showClear />
</template>
