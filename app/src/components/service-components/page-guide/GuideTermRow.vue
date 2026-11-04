<script setup lang="ts">
import { termKeys, termSlug } from '@/constants/terms';
import { useGuideStore } from '@/store/guide';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/** One row of the page guide's terms: a page term or a glossary value, with its long text when focused. */
const props = defineProps<{ label: string; text: string; term?: string }>();

const { t } = useI18n();
const { focusTerm } = storeToRefs(useGuideStore());

const focused = computed(() => !!props.term && props.term === focusTerm.value);
</script>

<template>
   <div>
      <dt
         class="font-semibold"
         :id="props.term ? `guide-term-${termSlug(props.term)}` : undefined"
         :aria-current="focused ? 'true' : undefined"
      >
         {{ props.label }}
      </dt>
      <dd class="m-0 text-muted-color"><TermText :text="props.text" /></dd>
      <dd v-if="focused && props.term" class="m-0 mt-1">
         <TermText :text="t(termKeys(props.term).long)" />
      </dd>
   </div>
</template>
