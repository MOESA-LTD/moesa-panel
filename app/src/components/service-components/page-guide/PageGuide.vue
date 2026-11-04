<script setup lang="ts">
import { GLOSSARY_ENUMS, GLOSSARY_LABELS, glossaryKey, type GlossaryEnum } from '@/api/glossary';
import { PAGE_GUIDES, visibleTasks } from '@/constants/guide';
import { ability } from '@/plugins/casl';
import { useGuideStore } from '@/store/guide';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

/** The page guide side panel (spec M20): it sits beside the page and leaves it usable. */
const { t } = useI18n();
const router = useRouter();
const store = useGuideStore();
const { open, page, focusTask } = storeToRefs(store);

const guide = computed(() => (page.value ? PAGE_GUIDES[page.value] : null));

const routeLabel = (name: string) => {
   const label = router.hasRoute(name) ? router.resolve({ name }).meta.label : undefined;
   return label ? t(label) : name;
};

const tasks = computed(() =>
   guide.value ? visibleTasks(guide.value, (action, subject) => ability.can(action, subject)) : []
);

const openTask = computed({
   get: () => focusTask.value,
   set: (value: string | null | undefined) => {
      focusTask.value = value ?? null;
   }
});

const terms = (e: GlossaryEnum) =>
   (GLOSSARY_ENUMS[e] as readonly string[]).map((value) => {
      const prefix = GLOSSARY_LABELS[e];
      return {
         value,
         label: prefix ? t(`${prefix}.${value}`) : value,
         text: t(glossaryKey(e, value))
      };
   });
</script>

<template>
   <Drawer
      v-model:visible="open"
      position="right"
      :modal="false"
      :dismissable="false"
      :block-scroll="false"
      class="!w-full md:!w-[28rem]"
   >
      <template #header>
         <span class="flex flex-col">
            <span class="font-semibold text-lg">{{ $t('guide.panel.title') }}</span>
            <span v-if="guide" class="text-muted-color">{{ routeLabel(guide.route) }}</span>
         </span>
      </template>

      <div v-if="guide && page" class="flex flex-col gap-6">
         <section class="flex flex-col gap-2">
            <h3 class="m-0 text-base font-semibold">{{ $t('guide.panel.purpose') }}</h3>
            <p class="m-0">{{ $t(`guide.pages.${page}.purpose`) }}</p>
         </section>

         <section class="flex flex-col gap-2">
            <h3 class="m-0 text-base font-semibold">{{ $t('guide.panel.tasks') }}</h3>
            <Accordion v-if="tasks.length" v-model:value="openTask">
               <AccordionPanel v-for="task in tasks" :key="task.id" :value="task.id">
                  <AccordionHeader>
                     {{ $t(`guide.pages.${page}.tasks.${task.id}.title`) }}
                  </AccordionHeader>
                  <AccordionContent>
                     <ol class="m-0 ps-5 flex flex-col gap-1">
                        <li
                           v-for="n in task.steps"
                           :key="n"
                           v-text="$t(`guide.pages.${page}.tasks.${task.id}.steps.${n}`)"
                        />
                     </ol>
                     <p class="mt-3 mb-0 text-sm text-muted-color">
                        {{
                           $t('guide.panel.needs', {
                              action: $t(`guide.actions.${task.permission.action}`),
                              subject: $t(`fields.${task.permission.subject}`)
                           })
                        }}
                     </p>
                  </AccordionContent>
               </AccordionPanel>
            </Accordion>
            <p v-else class="m-0 text-muted-color">{{ $t('guide.panel.no_tasks') }}</p>
         </section>

         <section v-if="guide.related.length" class="flex flex-col gap-2">
            <h3 class="m-0 text-base font-semibold">{{ $t('guide.panel.related') }}</h3>
            <ul class="m-0 p-0 list-none flex flex-col gap-1">
               <li v-for="name in guide.related" :key="name">
                  <CustomLink :to="{ name }" class="text-primary hover:underline">
                     {{ routeLabel(name) }}
                  </CustomLink>
               </li>
            </ul>
         </section>

         <section v-if="guide.glossary.length" class="flex flex-col gap-2">
            <h3 class="m-0 text-base font-semibold">{{ $t('guide.panel.terms') }}</h3>
            <dl v-for="e in guide.glossary" :key="e" class="m-0 flex flex-col gap-2">
               <div v-for="term in terms(e)" :key="term.value">
                  <dt class="font-semibold">{{ term.label }}</dt>
                  <dd class="m-0 text-muted-color">{{ term.text }}</dd>
               </div>
            </dl>
         </section>
      </div>
   </Drawer>
</template>
