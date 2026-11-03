import type { ProjectGateRow } from '@/api/project';
import PhaseStrip from '@/components/service-components/phase-strip/PhaseStrip.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it } from 'vitest';

const gate = (code: ProjectGateRow['code'], position: number, status: ProjectGateRow['status']) =>
   ({ id: code, code, position, status }) as ProjectGateRow;

describe('PhaseStrip', () => {
   // The app loads its messages at start-up; the English ones are enough here.
   beforeAll(() => i18n.setLocaleMessage('en', en));

   const mountStrip = () =>
      mount(PhaseStrip, {
         props: {
            phases: ['P1', 'P2', 'P3', 'closed'],
            current: 'P2',
            gates: [gate('G1', 1, 'passed'), gate('G2', 2, 'pending')]
         },
         global: { plugins: [i18NPlugin, PrimeVue] }
      });

   it('marks the current phase as the current step', () => {
      const current = mountStrip().findAll('[aria-current="step"]');
      expect(current).toHaveLength(1);
      expect(current[0].text()).toBe(i18n.t('ops.project.phase.P2'));
   });

   it('shows each gate at the end of the phase it closes, with its status icon', () => {
      const wrapper = mountStrip();
      const items = wrapper.findAll('li').map((item) => item.text());
      expect(items).toEqual([
         i18n.t('ops.project.phase.P1'),
         i18n.t('ops.project.gate.G1'),
         i18n.t('ops.project.phase.P2'),
         i18n.t('ops.project.gate.G2'),
         i18n.t('ops.project.phase.P3'),
         i18n.t('ops.project.phase.closed')
      ]);
      const [passed, pending] = wrapper.findAll('[data-gate]');
      expect(passed.find('.pi-check').exists()).toBe(true);
      expect(pending.find('.pi-check').exists()).toBe(false);
      expect(pending.find('.pi-clock').exists()).toBe(true);
   });
});
