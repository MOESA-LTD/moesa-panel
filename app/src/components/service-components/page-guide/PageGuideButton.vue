<script setup lang="ts">
import { guideForRoute } from '@/constants/guide';
import { useGuideStore } from '@/store/guide';

/**
 * Opens the page guide of the current route; opens it by itself on a route's first visit, and keeps
 * an open panel on the page the user navigates to.
 */
const route = useRoute();
const guide = useGuideStore();

const page = computed(() => guideForRoute(route.matched));

watch(page, (current) => guide.followRoute(current), { immediate: true });
</script>

<template>
   <Button
      v-if="page"
      :icon="PrimeIcons.QUESTION_CIRCLE"
      outlined
      rounded
      class="my-auto"
      :aria-label="$t('guide.panel.open')"
      v-tooltip.bottom="$t('guide.panel.open')"
      @click="guide.show(page)"
   />
</template>
