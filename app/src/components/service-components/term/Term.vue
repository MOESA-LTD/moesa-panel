<script setup lang="ts">
import { isTermCode, stripTerms, TERM_SELECT, termKeys } from '@/constants/terms';
import { useGuideStore } from '@/store/guide';
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ code: string; static?: boolean }>();

const { t } = useI18n();
const pageSelect = inject(TERM_SELECT, null);

const known = computed(() => isTermCode(props.code));
const short = computed(() => stripTerms(t(termKeys(props.code).short)));

// The store is read at click time, so a spy installed on it before the click is the one called.
const select = () => (pageSelect ?? useGuideStore().showTerm)(props.code);
</script>

<template>
   <template v-if="known">
      <abbr
         v-if="props.static"
         v-tooltip.top="short"
         :data-term="props.code"
         class="underline decoration-dotted underline-offset-2 cursor-help"
         >{{ props.code }}</abbr
      >
      <abbr
         v-else
         v-tooltip.top="short"
         :data-term="props.code"
         class="underline decoration-dotted underline-offset-2 cursor-help"
         role="button"
         tabindex="0"
         :aria-label="t('guide.panel.term_open', { code: props.code })"
         @click.prevent.stop="select"
         @keydown.enter.prevent.stop="select"
         @keydown.space.prevent.stop="select"
         >{{ props.code }}</abbr
      >
   </template>
   <template v-else>{{ props.code }}</template>
</template>
