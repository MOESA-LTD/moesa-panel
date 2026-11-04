<script setup lang="ts">
import {
   PURCHASE_ORDER_STATUS_SEVERITY,
   nextPurchaseOrderStatuses,
   piChecklistComplete,
   psiWarning,
   usePurchaseOrderOverview,
   useSetPurchaseOrderStatus,
   type PurchaseOrderCard,
   type PurchaseOrderStatus
} from '@/api/purchaseOrder';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Lines from './tabs/Lines.vue';
import Media from './tabs/Media.vue';
import Payments from './tabs/Payments.vue';
import Pi from './tabs/Pi.vue';
import Production from './tabs/Production.vue';
import {
   PO_CARD_TABS,
   PURCHASE_ORDER_FORM,
   PURCHASE_ORDER_OVERVIEW,
   purchaseOrderPiCheck,
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

const order = computed(() => form.row.value ?? null);

// --- status actions ---

const { t } = useI18n();
const { mutateAsync: setStatus } = useSetPurchaseOrderStatus();

const nextStatuses = computed(() => (order.value ? nextPurchaseOrderStatuses(order.value) : []));

// The database decides each move (030); these only warn in the confirmation. Approving checks the
// saved PI, so a PI that does not pass yet warns that it will be refused (S09); the balance warns
// without an approved PSI (G4).
const statusWarnings = computed(() => {
   const warnings: Partial<Record<PurchaseOrderStatus, string>> = {};
   const saved = order.value;
   if (
      saved &&
      !(
         purchaseOrderPiCheck(saved.purchase_order_line, saved).matches &&
         piChecklistComplete(saved.pi_check)
      )
   )
      warnings.pi_approved = t('ops.purchase_order.pi.not_ready');
   if (overview.value && psiWarning(overview.value))
      warnings.balance_paid = t('ops.purchase_order.psi_warning');
   return warnings;
});

const changeStatus = (status: string) =>
   setStatus({ id: order.value!.id, status: status as PurchaseOrderStatus });
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
         <slot name="actions" :order>
            <StatusActions
               v-if="$can('update', 'purchase_order')"
               :current="order.status"
               :next="nextStatuses"
               i18nPrefix="ops.purchase_order.status"
               glossary="purchase_order_status"
               :warnings="statusWarnings"
               :onChange="changeStatus"
            />
         </slot>
      </span>
   </div>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab v-for="key in PO_CARD_TABS" :key :value="key" :disabled="key !== 'general' && !id">
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
         <TabPanel value="pi">
            <Pi v-if="id" />
         </TabPanel>
         <TabPanel value="payments">
            <Payments v-if="id && activeTab === 'payments'" />
         </TabPanel>
         <TabPanel value="production">
            <Production v-if="id && activeTab === 'production'" :id />
         </TabPanel>
         <TabPanel value="documents">
            <Documents v-if="id && activeTab === 'documents'" :id />
         </TabPanel>
         <TabPanel value="media">
            <Media v-if="id && activeTab === 'media'" :id />
         </TabPanel>
      </TabPanels>
   </Tabs>
</template>
