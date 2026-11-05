<script setup lang="ts">
import { fieldRoutes } from '@/constants/form/field';
import { isValidDate, localeDateString } from '@/lib/dayjs';
import { diff } from 'deep-object-diff';

type LogChange = {
   key: string;
   type: 'add' | 'delete' | 'update';
   oldValue?: unknown;
   newValue?: unknown;
};

type Log = Partial<Tables['audit_log']['Row']> & { changes?: LogChange[] };

/** One changed row of an audit transaction. */
const props = defineProps<{
   data?: Tables['audit_log']['Row'];
}>();
const { t, te } = useI18n();

const getLogTagProps = (log: Log) => {
   switch (_toLower(log?.operation)) {
      case 'update':
         return { icon: PrimeIcons.SYNC, severity: 'info' };
      case 'delete':
         return { icon: PrimeIcons.MINUS, severity: 'danger' };
      case 'insert':
         return { icon: PrimeIcons.PLUS, severity: 'success' };
      case 'select':
         return { icon: PrimeIcons.PLUS, severity: 'secondary' };
   }
};

const getChanges = (log: Log | null | undefined): Log => {
   if (!_isObject(log)) return {};

   const omitFn = (value: any, key: string) => {
      if (['id', 'created_at', 'tenant_id'].includes(key)) return true;
      return false;
   };

   const rowData = _omitBy(_get(log, 'new_data', {}) as object, omitFn);
   const oldData = _omitBy(_get(log, 'old_data', {}) as object, omitFn);

   const operation = _toLower(log?.operation);

   if (operation === 'insert') {
      log.changes = _toPairs(rowData).map(([key, value]) => ({
         key,
         type: 'add',
         newValue: value
      }));
      return log;
   }

   if (operation === 'delete') {
      log.changes = _toPairs(oldData).map(([key, value]) => ({
         key,
         type: 'delete',
         oldValue: value
      }));
      return log;
   }

   // An update keeps the old values of the changed columns only; objects show their changed parts.
   log.changes = _toPairs(oldData).map(([key, oldValue]): LogChange => {
      const newValue = _get(rowData, key);
      return _isPlainObject(oldValue) && _isPlainObject(newValue)
         ? {
              key,
              type: 'update',
              oldValue: diff(newValue, oldValue),
              newValue: diff(oldValue, newValue)
           }
         : { key, type: 'update', oldValue, newValue };
   });
   return log;
};

function getLogResourceRoute(log: Log) {
   const { table_name, new_data, old_data } = log;
   const { name, field } = fieldRoutes[table_name ?? ''];
   const id = field ? _get(new_data, field, _get(old_data, field)) : log.record_id;
   const params = {
      id
   };
   return {
      name,
      params,
      query: { showDialog: 'center' }
   };
}

function getLogEntryRoute(entry: LogChange) {
   const { key, newValue } = entry;
   const { name } = fieldRoutes[key];
   // Shown only for `*_id` changes, so the value is the related row's id.
   const id = newValue as string;
   const params = {
      id
   };
   return {
      name,
      params,
      query: { showDialog: 'center' }
   };
}

function formatValue(value: any, indentSize = 0): any {
   if (_isNil(value)) return '—';

   if (_isString(value) && isValidDate({ value })) {
      return localeDateString({ value });
   }

   // Turn object to yaml like format
   if (_isObject(value) && !_isNil(value)) {
      const indent = '\t'.repeat(indentSize);
      if (_isArray(value)) {
         // No trailing indent: at the top level it would be '\t'.repeat(-1), a RangeError.
         return value.map((item) => indent + formatValue(item, indentSize + 1)).join('\n');
      }

      const entries = _keys(value).map((key) => {
         const currentValue = _get(value, key);
         const formattedValue = formatValue(currentValue, indentSize + 1);
         const formattedKey = te('fields.' + key) ? t('fields.' + key) : key;

         if (_isString(currentValue) && isValidDate({ value: currentValue })) {
            return `${indent}\n${indent}${formattedKey}: ${localeDateString({ value: currentValue })}`;
         }

         if (_isBoolean(currentValue)) {
            const booleanValue = currentValue ? '✅' : '⛔';
            return `${indent}\n${indent}${formattedKey}: ${booleanValue}`;
         }
         if (formattedValue !== '—')
            return `${indent}\n${indent}${formattedKey}: ${formattedValue}`;
      });

      return entries.join('');
   }

   return te('fields.' + value) ? t('fields.' + value) : value;
}

// Copied, as getChanges adds to it; shallowRef also avoids unwrapping the nested Json types.
const log = shallowRef(getChanges(props.data && { ...props.data }));
</script>

<template>
   <Panel class="audit_card__panel">
      <template #header>
         <div class="audit_card__header">
            <span v-text="$t('fields.' + log?.table_name || '')" />
            <CustomLink
               v-if="
                  log.operation !== 'DELETE' &&
                  !!fieldRoutes[log.table_name ?? ''] &&
                  !!log.record_id
               "
               :to="getLogResourceRoute(log)"
               v-slot="{ navigate }"
            >
               <Button
                  size="small"
                  variant="outlined"
                  severity="info"
                  :icon="PrimeIcons.SEARCH"
                  @click="navigate"
               />
            </CustomLink>
         </div>
      </template>
      <template #icons>
         <Tag v-bind="getLogTagProps(log)" />
      </template>
      <div class="audit_card__changes-container" v-if="_size(log.changes) > 0">
         <div
            v-for="(entry, i) in log?.changes"
            :key="`${log.id}-${i}`"
            class="audit_card__change-item"
         >
            <span class="audit_card__key" v-text="$t('fields.' + entry?.key || '')" />

            <div class="audit_card__value-container">
               <span v-if="entry?.type !== 'add'" class="audit_card__old-value">
                  <pre v-text="_trim(formatValue(entry?.oldValue))" />
               </span>
               <span
                  v-if="entry?.type !== 'delete'"
                  severity="success"
                  class="audit_card__new-value"
               >
                  <pre v-text="_trim(formatValue(entry?.newValue))" />
               </span>
               <CustomLink
                  v-if="
                     (log.operation !== 'INSERT' || entry?.type !== 'delete') &&
                     !!fieldRoutes[entry.key] &&
                     _endsWith(entry.key, '_id') &&
                     !!entry?.newValue
                  "
                  :to="getLogEntryRoute(entry)"
                  v-slot="{ navigate }"
               >
                  <Button
                     size="small"
                     variant="outlined"
                     severity="info"
                     :icon="PrimeIcons.SEARCH"
                     @click="navigate"
                  />
               </CustomLink>
            </div>
         </div>
      </div>
      <span v-else v-text="$t('audit_log.no_changes_detected')" class="audit_card__no-changes" />
   </Panel>
</template>

<style lang="scss">
.audit_card {
   &__header {
      @apply flex items-center gap-4;
   }

   &__changes-container {
      @apply flex gap-x-8 gap-y-4 flex-wrap;
   }

   &__change-item {
      @apply flex items-center gap-2 overflow-auto;
   }

   &__key {
      @apply font-medium text-sm;
   }

   &__value-container {
      @apply flex items-center gap-1 text-sm;
   }

   &__old-value {
      @apply text-red-500;
   }

   &__new-value {
      @apply font-semibold text-green-500;
   }
}
</style>
