<script setup>
import { Form } from '@/lib/Form';
import ClientUpsertAddress from './tabs/Address.vue';
import ClientUpsertGeneral from './tabs/General.vue';

const props = defineProps({
   id: {
      type: String,
      default: null,
      required: false
   },
   data: {
      type: Object,
      default: null,
      required: false
   },
   tab: {
      type: String,
      default: 'general',
      required: false
   }
});

const emit = defineEmits(['update:tab']);

const initialFormData = {
   id: undefined,
   national_id: null,
   birth_date: null,
   gender: null,
   display_name: null,
   email: null,
   phone: null,
   nationality: null,
   address: []
};

/**@type {[keyof Data]} */
const fields = _keys(initialFormData);

// Only holds the loaded client for the tabs; validation lives in each tab's own form.
const form = Form.create({
   data: _defaults(_pick(props.data, fields), initialFormData),
   useDialogForm: false
});

if (props.id) {
   await supabase
      .from('client')
      .select('*, address(*)')
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._setDefaults(_pick(data, fields))._reset());
}

if (props.id || props.data?.id) {
   const updateCallback = (data) => {
      if (data?.id === form.id) form._setDefaults(_pick(data, fields))._reset();
   };
   onMounted(() => emitter.on('client-update', updateCallback));
   onUnmounted(() => emitter.off('client-update', updateCallback));
}

const tabValue = ref(props.tab || 'general');
const tabModel = computed({
   get: () => tabValue.value,
   set(value) {
      tabValue.value = value;
      emit('update:tab', value);
   }
});
</script>

<template>
   <div class="card p-0">
      <Tabs v-model:value="tabModel">
         <TabList>
            <Tab
               value="general"
               as-child
               v-slot="slotProps"
               :disabled="!$can('create', 'client') || !$can('modify', 'client')"
            >
               <CustomLink :to="{ name: 'client-manage-general', params: { id: form.id } }">
                  <button v-bind="slotProps" v-text="$t('client.general_info')" />
               </CustomLink>
            </Tab>
            <Tab
               value="address"
               :disabled="!form.id || !$can('modify', 'client_address')"
               as-child
               v-slot="slotProps"
            >
               <CustomLink :to="{ name: 'client-manage-address', params: { id: form.id } }">
                  <button v-bind="slotProps" v-text="$t('client.addresses')" />
               </CustomLink>
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="general">
               <ClientUpsertGeneral class="p-0" :data="form._data" />
            </TabPanel>
            <TabPanel
               value="address"
               v-if="tabModel === 'address' && form.id && $can('modify', 'client_address')"
            >
               <ClientUpsertAddress class="p-0" :data="form._data" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
