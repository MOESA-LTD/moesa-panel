<script setup lang="ts">
import { Json } from '@/@types/database.types';
import { Form } from '@/lib/Form';
import General from '@/views/pages/branch/user/upsert/tabs/General.vue';
import { AdminUserAttributes } from '@supabase/supabase-js';
import { TabProps } from 'primevue';
import { RouteLocationAsRelativeGeneric } from 'vue-router';

export declare type UserUpsertGeneralData = Omit<AdminUserAttributes, 'user_metadata'> & {
   user_metadata?: Json & {
      display_name?: string;
      avatar_url?: string;
      email_verified?: boolean;
   };
};

export declare type UserUpsertRoleData = {
   role?: Array<
      Tables['role']['Update'] & {
         permission?: Array<Tables['permission']['Update']>;
      }
   >;
};

export declare type UserUpsertFormData = UserUpsertGeneralData & UserUpsertRoleData;

export declare type UserUpsertProps = {
   id?: Tables['user']['Update']['id'];
   data?: UserUpsertFormData;
};

const props = withDefaults(defineProps<UserUpsertProps>(), {});

const emit = defineEmits(['update:tab']);

const initialFormData: UserUpsertFormData = {
   id: undefined,
   email: null,
   phone: null,
   user_metadata: {
      display_name: null
   },
   password: '',
   role: null
};

const fields = _keys(initialFormData);

const form = Form.create<UserUpsertFormData>({
   data: props.id
      ? ((
           await supabase
              .from('user')
              .select('*, role(*)')
              .eq('id', props.id)
              .maybeSingle()
              .throwOnError()
        ).data as any)
      : _defaults(props.data, initialFormData),
   rules: {
      email: 'required|email',
      phone: 'phone',
      'user_metadata.display_name': 'required'
   },
   useDialogForm: false
});

provide('userForm', form);

if (props.id || props.data?.id) {
   const updateCallback = (data: any) => {
      if (data?.id === form.id) form._setDefaults(_pick(data, fields))._reset();
   };
   onMounted(() => emitter.on('user-update', updateCallback));
   onUnmounted(() => emitter.off('user-update', updateCallback));
}

const tabs: ComputedRef<(TabProps & { route: RouteLocationAsRelativeGeneric })[]> = computed(() => [
   {
      value: i18n.t('user.upsert.tabs.general_info'),
      asChild: true,
      route: {
         name: 'branch-manage-user-general',
         params: { id: form.id }
      }
   }
]);

const tab = defineModel('tab', {
   default: i18n.t('user.upsert.tabs.general_info')
});

const tabValue = computed(() => tab.value || tabs.value[0].value);
</script>

<template>
   <div class="card p-0">
      <Tabs v-model:value="tabValue">
         <TabList>
            <!-- @vue-expect-error PrimeVue's TabSlots omits the scope it passes in asChild mode -->
            <Tab
               v-for="tab in tabs"
               v-bind="tab"
               :key="tab.value"
               v-slot="slotProps"
               :disabled="!$can('create', 'user') || !$can('modify', 'user')"
            >
               <CustomLink :to="tab.route">
                  <!-- @vue-expect-error see above -->
                  <button v-bind="slotProps" v-text="tab.value" />
               </CustomLink>
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel :value="$t('user.upsert.tabs.general_info')">
               <General />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
