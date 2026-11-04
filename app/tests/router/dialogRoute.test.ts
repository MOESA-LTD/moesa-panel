import { dialogRoute } from '@/router/middlewares/before-each/dialog/dialogRoute';
import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';

const route = (r: object) =>
   ({ params: {}, query: {}, meta: {}, fullPath: '/', ...r }) as unknown as RouteLocationNormalized;
const ops = { name: 'ops', meta: {}, components: { default: {} } };
const section = { name: 'ops-shipment', meta: {}, components: { default: {} } };
const parent = {
   name: 'ops-shipment-manage',
   meta: { label: 'route.label.ops_shipment_manage' },
   components: { default: {} }
};
const leaf = {
   name: 'ops-shipment-manage-dates',
   meta: { label: 'route.label.ops_shipment_dates' },
   components: { default: {} }
};

describe('dialogRoute', () => {
   it('resolves a card tab route to its Manage parent and keeps the tab', () => {
      const to = route({
         name: 'ops-shipment-manage-dates',
         params: { id: 's1' },
         meta: leaf.meta,
         matched: [ops, section, parent, leaf],
         fullPath: '/ops/shipments/s1/manage/dates?showDialog=center'
      });
      const resolved = dialogRoute(to);
      expect(resolved.matched.at(-1)).toBe(parent);
      expect(resolved.params).toEqual({ id: 's1', tab: 'dates' });
      expect(resolved.name).toBe('ops-shipment-manage');
      expect(resolved.meta).toBe(parent.meta);
      expect(resolved.fullPath).toBe(to.fullPath);
   });

   it('leaves a non-card route unchanged', () => {
      const line = route({
         name: 'ops-shipment-line-edit',
         matched: [ops, section, { name: 'ops-shipment-line-edit', components: { default: {} } }]
      });
      expect(dialogRoute(line)).toBe(line);
   });

   it('leaves a child of a non-manage parent unchanged', () => {
      const contact = route({
         name: 'ops-customer-contact-add',
         matched: [
            ops,
            { name: 'ops-customer' },
            { name: 'ops-customer-contact-add', components: { default: {} } }
         ]
      });
      expect(dialogRoute(contact)).toBe(contact);
   });
});
