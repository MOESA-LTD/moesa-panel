<script setup lang="ts">
import { fieldRoutes } from '@/constants/form/field';
import { PRODUCT_CATEGORY_PROPS } from '@/constants/form/product';
import { RECORD_TYPES } from '@/constants/form/record';
import { appErrorHandler } from '@/lib/appErrorHandler';
import Collection from '@/lib/Collection';
import { ChartOptions } from 'chart.js';
import { RouteLocationAsRelativeGeneric } from 'vue-router';

const { layoutState, isDarkTheme, primaryColors } = useLayout();

const dialogRef = inject('dialogRef', null);

const useBestSellingProducts = () => {
   const rows = computed(() => [
      {
         label: i18n.t('dashboard.best_selling_products.sold_quantity'),
         icon: PrimeIcons.BOX,
         severity: 'info',
         getValue: (item: any) => _get(item, 'sum_quantity', '').toLocaleString()
      },
      {
         label: i18n.t('dashboard.best_selling_products.total_gain'),
         icon: PrimeIcons.DOLLAR,
         severity: 'success',
         getValue: (item: any) =>
            _get(item, 'sum_bid', '').toLocaleString(undefined, {
               style: 'currency',
               currency: item.currency_code
            })
      },
      {
         label: i18n.t('dashboard.best_selling_products.total_discount'),
         icon: PrimeIcons.PERCENTAGE,
         severity: 'danger',
         getValue: (item: any) =>
            _get(item, 'sum_discount', '').toLocaleString(undefined, {
               style: 'currency',
               currency: item.currency_code
            })
      },
      {
         label: i18n.t('dashboard.best_selling_products.total_tax'),
         icon: PrimeIcons.BRIEFCASE,
         severity: 'warn',
         getValue: (item: any) =>
            _get(item, 'sum_tax', '').toLocaleString(undefined, {
               style: 'currency',
               currency: item.currency_code
            })
      }
   ]);

   const data = ref<Partial<Views['dashboard_best_selling_products']['Row']>[]>(null);
   const loading = ref(null);
   const load = async () => {
      try {
         loading.value = true;
         await supabase
            .from('dashboard_best_selling_products')
            .select(
               'record_type, record_status, record_count, currency_code, sum_quantity, sum_bid, sum_discount, sum_tax, stock:stock_view!inner(id,product!inner(display_name, categories:product_category!inner(display_name)))'
            )
            .order('sum_quantity', { ascending: true })
            .eq('record_type', 'sale')
            .eq('record_status', 'done')
            .limit(4)
            .limit(1, { foreignTable: 'stock_view' })
            .then((res) => {
               data.value = res.data;
            });
         return data.value;
      } catch (error) {
         console.error('Error fetching best selling products:', error);
         appErrorHandler(error);
      } finally {
         loading.value = false;
      }
   };

   return {
      load,
      data,
      loading,
      rows
   };
};

const useDashboardNotifications = () => {
   const getTagProps = (item: Views['dashboard_notification_feed']['Row']) => {
      switch (_toLower(item?.activity)) {
         case 'updated':
            return { icon: PrimeIcons.SYNC, severity: 'info' };
         case 'deleted':
            return { icon: PrimeIcons.MINUS, severity: 'danger' };
         case 'created':
            return { icon: PrimeIcons.PLUS, severity: 'success' };
         case 'unknown':
            return { icon: PrimeIcons.PLUS, severity: 'warn' };
      }
   };

   const getNotificationResourceRoute = (
      notification: Views['dashboard_notification_feed']['Row']
   ): Partial<RouteLocationAsRelativeGeneric> => {
      const { old_data, row_data, resource_id, table_name } = notification;
      const name = fieldRoutes[table_name]?.name;
      const field = fieldRoutes[table_name]?.field;
      const id = (
         field ? _get(row_data, field, _get(old_data, field, resource_id)) : resource_id
      ) as string;
      const params = {
         id
      };
      return {
         name,
         params,
         query: { showDialog: 'center' }
      };
   };

   const title = computed(() => ({
      today: i18n.t('dashboard.notifications.today'),
      yesterday: i18n.t('dashboard.notifications.yesterday'),
      last_week: i18n.t('dashboard.notifications.last_week'),
      older: i18n.t('dashboard.notifications.older')
   }));

   const data = Collection.create<Views['dashboard_notification_feed']['Row'][]>([] as any);
   const loading = ref(null);
   const load = async () => {
      try {
         await supabase
            .from('dashboard_notification_feed')
            .select('*')
            .limit(5)
            .order('created_at', {
               ascending: false
            })
            .eq('since', 'today')
            .then((res) => data.push(...res.data));
         await supabase
            .from('dashboard_notification_feed')
            .select('*')
            .limit(5)
            .order('created_at', {
               ascending: false
            })
            .eq('since', 'yesterday')
            .then((res) => data.push(...res.data));
         await supabase
            .from('dashboard_notification_feed')
            .select('*')
            .limit(5)
            .order('created_at', {
               ascending: false
            })
            .eq('since', 'last_week')
            .then((res) => data.push(...res.data));
         await supabase
            .from('dashboard_notification_feed')
            .select('*')
            .limit(5)
            .order('created_at', {
               ascending: false
            })
            .eq('since', 'older')
            .then((res) => data.push(...res.data));
      } catch (error) {
         console.error('Error fetching dashboard notifications:', error);
         appErrorHandler(error);
      } finally {
         loading.value = false;
      }
   };
   return {
      load,
      getTagProps,
      getNotificationResourceRoute,
      data,
      loading,
      title
   };
};

const useCategorySales = () => {
   const data = ref<Views['dashboard_product_category_sales_summary']['Row'][]>([]);
   const loading = ref(null);

   const load = async () => {
      try {
         await supabase
            .from('dashboard_product_category_sales_summary')
            .select('*')
            .then((res) => (data.value = res.data));
         return data.value;
      } catch (error) {
         console.error('Error fetching sales by product category:', error);
         appErrorHandler(error);
      } finally {
         loading.value = false;
      }
   };

   const chartData = ref(null);
   const setChartData = () => {
      if (!data.value) return;

      const labels = data.value.map((item) => i18n.t(`fields.${_snakeCase(item.category_name)}`));
      const documentStyle = getComputedStyle(document.documentElement);

      const quantity = documentStyle.getPropertyValue('--p-primary-700');
      const bid = documentStyle.getPropertyValue('--p-primary-600');
      const discount = documentStyle.getPropertyValue('--p-primary-500');
      const tax = documentStyle.getPropertyValue('--p-primary-400');

      chartData.value = {
         labels,
         datasets: [
            {
               label: i18n.t('dashboard.sales_by_category.total_quantity_sold'),
               data: data.value.map((item) => item.total_quantity),
               backgroundColor: quantity,
               borderSkipped: true,
               barThickness: 24
            },
            {
               label: i18n.t('dashboard.sales_by_category.total_bid'),
               data: data.value.map((item) => item.total_bid),
               backgroundColor: bid,
               borderSkipped: true,
               barThickness: 24
            },
            {
               label: i18n.t('dashboard.sales_by_category.total_discount'),
               data: data.value.map((item) => item.total_discount),
               backgroundColor: discount,
               borderSkipped: true,
               barThickness: 24
            },
            {
               label: i18n.t('dashboard.sales_by_category.total_tax'),
               data: data.value.map((item) => item.total_tax),
               backgroundColor: tax,
               borderSkipped: true,
               barThickness: 24
            }
         ]
      };
   };

   const chartOptions = ref<ChartOptions>(null);
   const setChartOptions = () => {
      const documentStyle = getComputedStyle(document.documentElement);
      const borderColor = documentStyle.getPropertyValue('--surface-border');
      const textColor = documentStyle.getPropertyValue('--text-color-secondary');

      chartOptions.value = {
         responsive: true,
         maintainAspectRatio: false,
         aspectRatio: 1,
         plugins: {
            legend: {
               labels: {
                  color: textColor
               },
               title: {
                  color: textColor
               }
            }
         },
         scales: {
            x: {
               stacked: true,
               ticks: {
                  color: textColor
               },
               grid: {
                  color: 'transparent',
                  borderColor: 'transparent'
               }
            },
            y: {
               stacked: true,
               ticks: {
                  color: textColor
               },
               grid: {
                  color: borderColor,
                  borderColor: 'transparent',
                  drawTicks: false
               }
            }
         }
      };
   };

   watch(
      () => [layoutState.primary, layoutState.surface, layoutState.isDark, locale.value],
      () => {
         setChartData();
         setChartOptions();
      }
   );

   return {
      load,
      setChartData,
      setChartOptions,
      data,
      chartData,
      chartOptions,
      loading
   };
};

const bestSellingProducts = useBestSellingProducts();
const dashboardNotifications = useDashboardNotifications();
const categorySales = useCategorySales();

bestSellingProducts.load();
dashboardNotifications.load();

onMounted(() => {
   categorySales.load().then(() => {
      categorySales.setChartData();
      categorySales.setChartOptions();
   });
});
</script>

<template>
   <div
      class="bg-[var(--surface-ground)] flex flex-col gap-4"
      :class="{
         'p-4': !!dialogRef
      }"
   >
      <div class="w-full flex flex-wrap gap-[inherit]">
         <template v-if="$can('read', 'client')">
            <TotalRowCountCard
               class="flex-[1_20%] lg:flex-[1_15%]"
               :title="$t('dashboard.statistics.client.clients')"
               from="client"
               :icon="PrimeIcons.USERS"
            />
         </template>
         <template v-if="$can('read', 'record')">
            <TotalRowCountCard
               class="flex-[1_20%] lg:flex-[1_15%]"
               v-for="recordType in RECORD_TYPES"
               :key="recordType.value"
               from="record"
               :title="`${$t('fields.record_type')}: ${recordType.label}`"
               :icon="recordType.icon"
               :iconColor="_get(_shuffle(primaryColors).shift(), `palette.500`)"
               :filters="{
                  record_type: {
                     operator: FilterOperator.AND,
                     constraints: [{ value: recordType.value, matchMode: FilterMatchMode.EQUALS }]
                  }
               }"
            />
         </template>
      </div>
      <div class="flex-1 flex flex-wrap gap-[inherit] items-start">
         <div class="flex-[1_49%] flex flex-col gap-[inherit] justify-start overflow-auto">
            <Card v-if="$can('read', 'record') && $can('read', 'stock') && $can('read', 'product')">
               <template #title>
                  <div class="flex items-center justify-between gap-4 mb-4">
                     {{ $t('dashboard.tables.recent_sales.title') }}
                     <div class="flex items-center justify-between gap-4">
                        <CustomLink
                           :to="{
                              name: 'record-list',
                              params: {
                                 record_type: 'sale',
                                 record_status: 'done'
                              }
                           }"
                           v-slot="{ navigate }"
                        >
                           <Button
                              variant="link"
                              size="small"
                              raised
                              :label="$t('dashboard.tables.recent_sales.see_all')"
                              @click="navigate"
                           />
                        </CustomLink>
                     </div>
                  </div>
               </template>
               <template #content>
                  <ResourceTable
                     :from="'record'"
                     stateStorage="session"
                     :select="'bid,quantity,bid_discount,currency_code,created_at,stock:stock_view!inner(id,display_name,unit_type), client!inner(id,display_name,email)'"
                     :rows="5"
                     :paginator="false"
                     :showGridlines="false"
                     :filters="{
                        record_type: {
                           operator: FilterOperator.AND,
                           constraints: [{ value: 'sale', matchMode: FilterMatchMode.EQUALS }]
                        },
                        record_status: {
                           operator: FilterOperator.AND,
                           constraints: [{ value: 'done', matchMode: FilterMatchMode.EQUALS }]
                        }
                     }"
                     :columns="[
                        {
                           field: 'stock.display_name',
                           header: $t('record.table.headers.product')
                        },
                        {
                           field: 'client.display_name',
                           header: $t('record.table.headers.client')
                        },
                        {
                           field: 'quantity',
                           header: $t('record.table.headers.quantity')
                        },
                        {
                           field: 'bid',
                           header: $t('record.table.headers.bid')
                        },
                        {
                           field: 'created_at',
                           header: $t('record.table.headers.created_at'),
                           sortOrder: { value: -1 }
                        }
                     ]"
                  >
                     <template
                        v-if="$can('read', 'client')"
                        #client_display_name_body="{ data, field }"
                     >
                        <CustomLink
                           v-if="_get(data, `client.id`)"
                           :to="{
                              name: 'client-manage',
                              params: { id: _get(data, `client.id`) },
                              query: { showDialog: 'center' }
                           }"
                           v-slot="{ navigate }"
                        >
                           <Button
                              variant="link"
                              size="small"
                              raised
                              :label="
                                 _get(data, `client.display_name`) || _get(data, `client.email`)
                              "
                              @click="navigate"
                           />
                        </CustomLink>
                     </template>
                     <template
                        v-if="$can('read', 'stock')"
                        #stock_display_name_body="{ data, field }"
                     >
                        <CustomLink
                           v-if="_get(data, `stock.id`)"
                           :to="{
                              name: 'stock-edit',
                              params: { id: _get(data, `stock.id`) },
                              query: { showDialog: 'center' }
                           }"
                           v-slot="{ navigate }"
                        >
                           <Button
                              variant="link"
                              size="small"
                              class="!text-left"
                              raised
                              :label="_get(data, `stock.display_name`)"
                              @click="navigate"
                           />
                        </CustomLink>
                     </template>
                     <template #quantity_body="{ data, field }">
                        <span
                           v-text="
                              `${_get(data, field)} ${$t('fields.' + _get(data, 'stock.unit_type'))}`
                           "
                        />
                     </template>
                     <template #bid_body="{ data, field }">
                        <span
                           v-text="
                              `${_get(data, field)?.toLocaleString?.(undefined, { style: 'currency', currency: _get(data, 'currency_code') })}`
                           "
                        />
                     </template>
                  </ResourceTable>
               </template>
            </Card>
            <Card
               v-if="$can('read', 'record') && $can('read', 'stock') && $can('read', 'product')"
               class="flex-1"
            >
               <template #title>
                  <div class="flex items-center justify-between gap-4 mb-4">
                     {{ $t('dashboard.sales_by_category.title') }}
                  </div>
               </template>
               <template #content>
                  <Chart
                     type="bar"
                     :data="categorySales.chartData.value"
                     :options="categorySales.chartOptions.value"
                     class="w-full h-[50vh]"
                  />
               </template>
            </Card>
         </div>
         <div class="flex-[1_49%] flex flex-wrap gap-[inherit] items-start">
            <Card
               v-if="$can('read', 'record') && $can('read', 'stock') && $can('read', 'product')"
               class="flex-[1_49%]"
            >
               <template #title>
                  <div class="flex items-center justify-between gap-4 mb-4">
                     {{ $t('dashboard.best_selling_products.title') }}
                  </div>
               </template>
               <template #content>
                  <DataView
                     :value="bestSellingProducts.data.value"
                     :pt="{
                        root: {
                           class: '!border-spacing-0'
                        },
                        content: {
                           class: 'flex flex-col gap-8'
                        }
                     }"
                  >
                     <template #empty>
                        <div v-if="bestSellingProducts.loading.value" class="flex flex-col gap-4">
                           <div class="flex flex-col gap-4" v-for="item in 5">
                              <Skeleton class="!h-8 !w-1/4" />
                              <Skeleton class="!h-8 !w-full" />
                           </div>
                        </div>
                        <span v-else v-text="$t('dashboard.best_selling_products.empty')" />
                     </template>
                     <template #list="slotProps">
                        <li
                           class="flex flex-wrap gap-2 justify-between"
                           v-for="item in slotProps.items"
                        >
                           <div class="flex-1 flex gap-2 items-center justify-between">
                              <CustomLink
                                 v-if="
                                    _get(item, `stock.0.id`) &&
                                    $can('read', 'stock') &&
                                    $can('modify', 'stock')
                                 "
                                 :to="{
                                    name: 'stock-edit',
                                    params: { id: _get(item, `stock.0.id`) },
                                    query: { showDialog: 'center' }
                                 }"
                                 v-slot="{ navigate }"
                              >
                                 <Button
                                    variant="link"
                                    size="small"
                                    class="!text-left"
                                    raised
                                    :label="_get(item, `stock.0.product.display_name`)"
                                    @click="navigate"
                                 />
                              </CustomLink>
                              <span
                                 v-else
                                 class="text-lg me-2"
                                 v-text="item?.stock[0]?.product.display_name"
                              />
                              <div class="flex gap-2">
                                 <Tag
                                    v-for="category in _get(item, `stock.0.product.categories`)"
                                    v-bind="_get(PRODUCT_CATEGORY_PROPS, category.display_name)"
                                 />
                              </div>
                           </div>
                           <div class="w-full flex flex-col gap-4 items-start">
                              <div
                                 class="w-full flex items-center justify-between gap-4"
                                 v-for="row in bestSellingProducts.rows.value"
                              >
                                 <span v-text="row.label" />
                                 <Tag
                                    v-bind="row"
                                    :value="row.getValue(item)"
                                    class="!text-base !gap-2 !text-nowrap"
                                 />
                              </div>
                           </div>
                        </li>
                     </template>
                  </DataView>
               </template>
            </Card>
            <Card
               v-if="
                  $can('read', 'record') &&
                  $can('read', 'stock') &&
                  $can('read', 'product') &&
                  !_isEmpty(dashboardNotifications.data)
               "
               class="flex-[1_49%]"
            >
               <template #title>
                  <div class="flex items-center justify-between gap-4 mb-4">
                     {{ $t('dashboard.notifications.title') }}
                  </div>
               </template>
               <template #content>
                  <template
                     v-for="(notifications, since) in _groupBy(
                        dashboardNotifications.data,
                        (n) => n.since
                     )"
                  >
                     <span
                        class="block text-muted-color font-medium my-2"
                        v-text="_get(dashboardNotifications.title.value, since)"
                     />
                     <div class="flex flex-col gap-4" v-for="notification in notifications">
                        <ul class="p-0 mx-0 mt-0 mb-6 list-none">
                           <li class="flex items-center gap-4 py-2">
                              <Tag
                                 class="w-12 aspect-square !rounded-full"
                                 v-bind="dashboardNotifications.getTagProps(notification)"
                                 :pt="{
                                    icon: {
                                       class: '!text-2xl !w-[unset] !h-[unset]'
                                    }
                                 }"
                              />
                              <i18n-t
                                 :keypath="`dashboard.notifications.activity.${notification.activity as unknown as any}`"
                                 tag="span"
                                 class="lowercase first-letter:!capitalize [&>a]:inline-flex"
                              >
                                 <template #resource_name>
                                    <CustomLink
                                       v-if="
                                          $can('read', notification.table_name) &&
                                          !_isEqual(notification.operation, 'DELETE') &&
                                          !!_get(notification, 'resource_id') &&
                                          !!_get(fieldRoutes, notification.table_name)
                                       "
                                       :to="
                                          dashboardNotifications.getNotificationResourceRoute(
                                             notification
                                          )
                                       "
                                       v-slot="{ navigate }"
                                    >
                                       <Button
                                          variant="link"
                                          size="small"
                                          fluid
                                          class="!px-0"
                                          :label="$t(`fields.${notification.table_name}`)"
                                          @click="navigate"
                                       />
                                    </CustomLink>
                                    <span v-else>
                                       {{ $t(`fields.${notification.table_name}`) }}</span
                                    >
                                 </template>
                                 <template #user_name>
                                    <CustomLink
                                       v-if="$can('read', `user`) && _get(notification, `user_id`)"
                                       :to="{
                                          name: 'branch-user-manage',
                                          params: { id: _get(notification, `user_id`) },
                                          query: { showDialog: 'center' }
                                       }"
                                       v-slot="{ navigate }"
                                    >
                                       <Button
                                          variant="link"
                                          size="small"
                                          fluid
                                          class="!px-0 !text-primary-emphasis-alt"
                                          :label="
                                             _get(notification, `user_name`) || $t(`fields.user`)
                                          "
                                          @click="navigate"
                                       />
                                    </CustomLink>
                                    <span v-else>
                                       {{
                                          _get(notification, `user_name`) || $t(`fields.user`)
                                       }}</span
                                    >
                                 </template>
                              </i18n-t>
                           </li>
                        </ul>
                     </div>
                  </template>
               </template>
            </Card>
         </div>
      </div>
   </div>
</template>
