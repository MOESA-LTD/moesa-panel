<script lang="ts">
import PrimeDatePicker from 'primevue/datepicker';
import { defineComponent, type ComponentOptions } from 'vue';

/**
 * The PrimeVue DatePicker internals the override reads. Verified against primevue 4.5.1; on an
 * upgrade re-run tests/components/DatePicker.test.ts (its typing cases fail on stock PrimeVue).
 */
interface DatePickerInternals {
   focused: boolean;
   input: HTMLInputElement | null;
   rawValue: unknown;
   formatValue(value: unknown): string;
}

/**
 * PrimeVue's DatePicker parses the text on every keystroke and writes the parsed date back into the
 * input, so typing "2026-11-15" turns into "2026-11-01" after the "1" and the "5" no longer parses.
 * While the input has focus, keep the typed text; blur reformats it from the parsed value.
 *
 * Templates resolve `<DatePicker>` to this file before PrimeVue's (local components come first).
 */
export default defineComponent({
   name: 'DatePicker',
   // PrimeVue types its components as constructors; the runtime value is an options object.
   extends: PrimeDatePicker as unknown as ComponentOptions,
   computed: {
      inputFieldValue(): string {
         const self = this as unknown as DatePickerInternals;
         // Read first so rawValue stays a dependency (otherwise the focused branch caches the old text).
         const formatted = self.formatValue(self.rawValue);
         return self.focused && self.input ? self.input.value : formatted;
      }
   }
   // Templates keep PrimeVue's prop, emit and slot types.
}) as unknown as typeof PrimeDatePicker;
</script>
