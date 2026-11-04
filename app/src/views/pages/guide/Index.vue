<script setup lang="ts">
import {
   SYSTEM_GUIDE_TOPICS,
   TERM_SECTIONS,
   TERM_SELECT,
   TERMS,
   termKeys,
   termSlug,
   termsOf
} from '@/constants/terms';
import { PrimeIcons } from '@primevue/core/api';
import { computed, nextTick, provide, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const sections = computed(() =>
   TERM_SECTIONS.map((section) => ({
      id: section.id,
      codes: section.categories.flatMap((category) => termsOf(category))
   }))
);

const contents = computed(() => [
   { id: 'panel', title: t('system_guide.sections.panel.title') },
   ...TERM_SECTIONS.map(({ id }) => ({ id, title: t(`system_guide.sections.${id}.title`) }))
]);

const scrollTo = (hash: string) => {
   if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
};

// A term on this page moves to its own entry instead of opening the guide panel.
provide(TERM_SELECT, (code: string) => {
   const hash = `#term-${termSlug(code)}`;
   // The same address is no navigation, so the hash watcher would not scroll back to the entry.
   if (route.hash === hash) scrollTo(hash);
   else router.replace({ hash });
});

watch(
   () => route.hash,
   async (hash) => {
      await nextTick();
      scrollTo(hash);
   },
   { immediate: true }
);
</script>

<template>
   <div class="card flex flex-col gap-6">
      <header class="flex flex-col gap-2">
         <h1 class="text-2xl font-semibold m-0" v-text="t('system_guide.title')" />
         <p class="m-0 text-muted-color" v-text="t('system_guide.intro')" />
      </header>

      <nav :aria-label="t('system_guide.contents')" class="flex flex-col gap-2">
         <h2 class="text-lg font-semibold m-0" v-text="t('system_guide.contents')" />
         <ul class="flex flex-wrap gap-x-4 gap-y-1 m-0 p-0 list-none">
            <li v-for="item in contents" :key="item.id">
               <RouterLink
                  :to="{ hash: `#section-${item.id}` }"
                  replace
                  class="text-primary hover:underline"
                  >{{ item.title }}</RouterLink
               >
            </li>
         </ul>
      </nav>

      <section id="section-panel" class="flex flex-col gap-4 scroll-mt-4">
         <h2 class="text-xl font-semibold m-0" v-text="t('system_guide.sections.panel.title')" />
         <div v-for="topic in SYSTEM_GUIDE_TOPICS" :key="topic" class="flex flex-col gap-1">
            <h3
               class="text-base font-semibold m-0"
               v-text="t(`system_guide.topics.${topic}.title`)"
            />
            <p class="m-0 leading-relaxed">
               <TermText :text="t(`system_guide.topics.${topic}.text`)" />
            </p>
         </div>
      </section>

      <section
         v-for="section in sections"
         :id="`section-${section.id}`"
         :key="section.id"
         class="flex flex-col gap-4 scroll-mt-4"
      >
         <div class="flex flex-col gap-1">
            <h2
               class="text-xl font-semibold m-0"
               v-text="t(`system_guide.sections.${section.id}.title`)"
            />
            <p class="m-0 text-muted-color">
               <TermText :text="t(`system_guide.sections.${section.id}.intro`)" />
            </p>
         </div>
         <article
            v-for="code in section.codes"
            :id="`term-${termSlug(code)}`"
            :key="code"
            :data-term-entry="code"
            class="flex flex-col gap-1 border-l-4 border-surface ps-4 scroll-mt-4"
         >
            <h3 class="text-base font-semibold m-0" v-text="code" />
            <p class="m-0 font-medium">
               <TermText :text="t(termKeys(code).short)" />
            </p>
            <p class="m-0 leading-relaxed">
               <TermText :text="t(termKeys(code).long)" />
            </p>
            <a
               v-if="TERMS[code]?.drive"
               :href="TERMS[code]!.drive"
               target="_blank"
               rel="noopener noreferrer"
               class="text-primary hover:underline self-start"
            >
               <i :class="PrimeIcons.EXTERNAL_LINK" class="me-1" aria-hidden="true" />{{
                  t('system_guide.open_document')
               }}
            </a>
         </article>
      </section>
   </div>
</template>
