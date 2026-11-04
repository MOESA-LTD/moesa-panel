<script setup lang="ts">
import { parseTerms } from '@/constants/terms';
import { computed } from 'vue';
import Term from './Term.vue';

const props = defineProps<{ text: string; static?: boolean }>();

const parts = computed(() => parseTerms(props.text));
</script>

<template>
   <span
      ><template v-for="(part, i) in parts" :key="i"
         ><Term v-if="'code' in part" :code="part.code" :static="props.static" /><template v-else>{{
            part.text
         }}</template></template
      ></span
   >
</template>
