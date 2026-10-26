<script setup>
import { useClientOptions } from '@/api/client/queries';

defineProps({
   showEdit: {
      type: Boolean,
      default: true
   },
   showAdd: {
      type: Boolean,
      default: true
   }
});
defineOptions({
   inheritAttrs: false
});
defineEmits(['clientSelect']);

const modelValue = defineModel('modelValue');

const { data: clients, suspense } = useClientOptions();
await suspense();
</script>

<template>
   <InputGroup :class="$attrs.class">
      <Select
         :filter="true"
         :options="clients ?? []"
         option-label="display_name"
         option-value="id"
         @value-change="
            $emit(
               'clientSelect',
               clients?.find((c) => _get(c, $attrs.optionValue || 'id') == $event)
            )
         "
         v-bind="_omit($attrs, ['class'])"
         v-model:model-value="modelValue"
         :placeholder="$t('client.select_client')"
      />

      <InputGroupAddon
         v-if="showEdit && $can('read', 'client') && (!!modelValue?.id || !!modelValue)"
      >
         <RouterLink
            :to="{
               name: 'client-manage',
               params: { id: modelValue?.id || modelValue },
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button
               rounded
               size="small"
               severity="info"
               :icon="PrimeIcons.PENCIL"
               @click="navigate"
            />
         </RouterLink>
      </InputGroupAddon>
      <InputGroupAddon v-if="showAdd && $can('create', 'client')">
         <RouterLink
            :to="{
               name: 'client-manage',
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button
               rounded
               size="small"
               severity="success"
               :icon="PrimeIcons.PLUS"
               @click="navigate"
            />
         </RouterLink>
      </InputGroupAddon>
      <slot name="addons" />
   </InputGroup>
</template>
