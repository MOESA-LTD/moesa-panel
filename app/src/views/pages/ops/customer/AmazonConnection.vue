<script setup lang="ts">
import {
   amazonErrorText,
   useConnectAmazon,
   useDisconnectAmazon,
   type AmazonAccount,
   type ApiConnection
} from '@/api/amazon';
import { glossaryKey } from '@/api/glossary';
import { ToastSeverity } from '@primevue/core/api';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

// The API connection of a customer's Amazon platform account: its state, the seller and the
// actions. Connect answers the Seller Central consent URL (production: the browser goes there and
// Amazon's callback comes back to the customer's platforms tab with ?amazon=…) or, in the sandbox,
// the connected account at once. The account holds no credential: the token stays server-side.
const props = defineProps<{ account: AmazonAccount }>();

const SEVERITY: Record<ApiConnection, 'secondary' | 'success' | 'danger'> = {
   none: 'secondary',
   connected: 'success',
   revoked: 'danger'
};

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { t } = useI18n();

// The account a sandbox connect or a disconnect answered, until the list is loaded again.
const answered = ref<AmazonAccount | null>(null);
watch(
   () => props.account,
   () => (answered.value = null)
);
const shown = computed(() => answered.value ?? props.account);
const state = computed(() => shown.value.api_connection);

const { mutateAsync: connect, isPending: connecting } = useConnectAmazon();
const { mutateAsync: disconnect, isPending: disconnecting } = useDisconnectAmazon();

const fail = (error: unknown) =>
   toast.add({
      life: 5000,
      severity: ToastSeverity.ERROR,
      summary: t('ops.amazon.connect.result.error'),
      detail: amazonErrorText(error)
   });

const startConnect = async () => {
   const returnTo = router.resolve({
      name: 'ops-customer-manage-platforms',
      params: { id: props.account.customer_id }
   }).fullPath;
   try {
      const result = await connect({ accountId: props.account.id, returnTo });
      if ('redirect' in result) {
         window.location.assign(result.redirect);
         return;
      }
      answered.value = result.account;
      toast.add({
         life: 3000,
         severity: ToastSeverity.SUCCESS,
         summary: t('ops.amazon.api_connection.connected'),
         detail: t('ops.amazon.connect.result.connected')
      });
   } catch (error) {
      fail(error);
   }
};

const askDisconnect = () =>
   confirm.require({
      header: t('ops.amazon.connect.disconnect'),
      message: t('ops.amazon.connect.disconnect_confirm'),
      acceptProps: {
         label: t('ops.amazon.connect.disconnect'),
         severity: 'danger',
         outlined: true
      },
      rejectProps: { label: t('action.no'), severity: 'secondary', outlined: true },
      accept: async () => {
         try {
            await disconnect(props.account.id);
            answered.value = { ...shown.value, api_connection: 'none' };
            toast.add({
               life: 3000,
               severity: ToastSeverity.SUCCESS,
               summary: t('ops.amazon.connect.disconnect'),
               detail: t('ops.amazon.connect.disconnected')
            });
         } catch (error) {
            fail(error);
         }
      }
   });
</script>

<template>
   <span class="inline-flex flex-wrap items-center gap-2">
      <Tag
         data-api-connection
         :data-state="state"
         :value="$t(`ops.amazon.api_connection.${state}`)"
         :severity="SEVERITY[state] ?? 'secondary'"
         v-tooltip.top="$t(glossaryKey('api_connection', state))"
      />
      <small v-if="state === 'connected' && shown.seller_id" class="text-muted-color">
         {{ $t('ops.amazon.connect.seller_id', { id: shown.seller_id }) }}
      </small>
      <template v-if="$can('update', 'customer')">
         <Button
            v-if="state === 'connected'"
            size="small"
            variant="outlined"
            severity="danger"
            :label="$t('ops.amazon.connect.disconnect')"
            :loading="disconnecting"
            @click="askDisconnect"
         />
         <Button
            v-else
            size="small"
            variant="outlined"
            :icon="PrimeIcons.AMAZON"
            :label="
               $t(
                  state === 'revoked' ? 'ops.amazon.connect.reconnect' : 'ops.amazon.connect.button'
               )
            "
            :loading="connecting"
            @click="startConnect"
         />
      </template>
   </span>
</template>
