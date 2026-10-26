<script setup lang="ts">
import Collection from '@/lib/Collection';

const { data } = await supabase
   .from('tenant')
   .select('')
   .single()
   .overrideTypes<Tables['tenant']['Row']>()
   .throwOnError();
const tenant = Collection.create(data);
</script>
<template>
   <pre>{{ tenant._data }}</pre>
</template>
