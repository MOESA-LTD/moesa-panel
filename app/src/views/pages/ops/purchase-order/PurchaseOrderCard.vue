<script setup lang="ts">
import {
   PURCHASE_ORDER_STATUS_SEVERITY,
   usePurchaseOrderOverview,
   type PurchaseOrderCard
} from '@/api/purchaseOrder';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Lines from './tabs/Lines.vue';
import Media from './tabs/Media.vue';
import {
   PO_CARD_TABS,
   PURCHASE_ORDER_FORM,
   PURCHASE_ORDER_OVERVIEW,
   tabForField,
   usePurchaseOrderForm,
   type PurchaseOrderCardTab
} from './usePurchaseOrderForm';

// The purchase order card: a header (code, supplier, status, the status actions) and the tabs
// around its one form, which the general and PI tabs share. The other tabs belong to a saved order.
// Manage re-creates the card when a new order is saved, so the form goes on under its id.
const props = defineProps<{ id: string | null }>();
const emit = defineEmits<{ saved: [order: PurchaseOrderCard] }>();
defineSlots<{
   /** Next to the status: what may be done with the order (StatusActions). */
   actions?: (props: { order: PurchaseOrderCard }) => unknown;
}>();

const activeTab = defineModel<PurchaseOrderCardTab>('tab', { default: 'general' });

const form = usePurchaseOrderForm(
   () => props.id,
   (order) => emit('saved', order)
);
await form.ready;

/** Saves; when a field is invalid, opens the tab that shows the first one. */
const submit = async () => {
   await form.save();
   const [first] = Object.keys(form.errors.value);
   if (first) activeTab.value = tabForField(first.split('.')[0]!);
};

provide(PURCHASE_ORDER_FORM, { ...form, submit });

// Loaded once for every tab: the missing spec sheets, the recalculated figures, the PSI.
const { data: overview } = usePurchaseOrderOverview(() => props.id);
provide(PURCHASE_ORDER_OVERVIEW, overview);

// Disabled placeholders until the PI check, payments and production tabs exist (Task 5).
const PENDING_TABS = new Set<PurchaseOrderCardTab>(['pi', 'payments', 'production']);

const order = computed(() => form.row.value ?? null);
const title = computed(() =>
   order.value ? [order.value.code, order.value.supplier?.code].filter(Boolean).join(' — ') : null
);
</script>

<template>
   <div v-if="order" class="m-4 mb-0 flex flex-wrap items-center gap-2">
      <h2 class="m-0 text-xl font-semibold" v-text="title" />
      <Tag
         :value="$t(`ops.purchase_order.status.${order.status}`)"
         :severity="PURCHASE_ORDER_STATUS_SEVERITY[order.status]"
      />
      <span class="ms-auto flex flex-wrap gap-2">
         <slot name="actions" :order />
      </span>
   </div>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab
            v-for="key in PO_CARD_TABS"
            :key
            :value="key"
            :disabled="(key !== 'general' && !id) || PENDING_TABS.has(key)"
         >
            {{ $t(`ops.purchase_order.tabs.${key}`) }}
         </Tab>
      </TabList>
      <TabPanels>
         <TabPanel value="general">
            <General />
         </TabPanel>
         <TabPanel value="lines">
            <Lines v-if="id" />
         </TabPanel>
         <TabPanel v-for="key in PENDING_TABS" :key :value="key" />
         <TabPanel value="documents">
            <Documents v-if="id && activeTab === 'documents'" :id />
         </TabPanel>
         <TabPanel value="media">
            <Media v-if="id && activeTab === 'media'" :id />
         </TabPanel>
      </TabPanels>
   </Tabs>
</template>
