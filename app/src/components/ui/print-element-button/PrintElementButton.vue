<script setup lang="ts">
import { unref, type Ref } from 'vue';

export declare type PrintElementButtonProps = {
   element: Element | Ref<Element | null> | null;
};

const props = withDefaults(defineProps<PrintElementButtonProps>(), {
   element: null
});

const printElement = async (el: PrintElementButtonProps['element'], darkMode = false) => {
   const target = unref(el);

   if (!(target instanceof Element))
      return console.warn('PrintElementButton: Invalid element provided for printing.');

   const { toggleDarkMode, isDarkTheme } = useLayout();
   const darkTheme = !!isDarkTheme.value;
   const cloned = target.cloneNode(true) as Element;

   const beforePrint = () => document.body.classList.add('printing');
   const afterPrint = () => document.body.classList.remove('printing');

   addEventListener('beforeprint', beforePrint, { once: true });
   addEventListener('afterprint', afterPrint, { once: true });

   // Without view transitions toggleDarkMode switches synchronously and returns nothing.
   if (darkTheme !== darkMode) await toggleDarkMode(null, darkMode)?.finished;

   document.body.appendChild(cloned);
   cloned.classList.add('printable');
   window.print();

   if (darkTheme !== darkMode) toggleDarkMode(null, !darkMode);

   document.body.removeChild(cloned);
};
</script>

<template>
   <Button
      size="small"
      :icon="PrimeIcons.PRINT"
      variant="outlined"
      severity="info"
      @click="
         (e) =>
            printElement(
               props.element || (e?.target as HTMLElement)?.parentElement?.offsetParent || null
            )
      "
   />
</template>

<style lang="scss">
.printable {
   @apply [visibility:hidden] print:[visibility:visible] !important;
}

body.printing {
   *:not(.printable, .printable *) {
      @apply print:hidden print:!w-0 print:!h-0 print:!overflow-hidden;
      -webkit-print-color-adjust: economy !important;
      color-adjust: economy !important;
      print-color-adjust: economy !important;
   }

   & .printable {
      @apply absolute -z-10 top-0 left-0 right-0 overflow-scroll !important;
      -webkit-print-color-adjust: exact !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
   }
}
</style>
