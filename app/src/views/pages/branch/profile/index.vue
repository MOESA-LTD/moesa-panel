<script setup lang="ts">
const { data } = await supabase
   .from('tenant')
   .select('')
   .single()
   .overrideTypes<Tables['tenant']['Row']>()
   .throwOnError();
</script>
<template>
   <pre>{{ data }}</pre>
</template>
