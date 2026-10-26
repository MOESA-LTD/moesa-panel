import { createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { resolveAction } from './index';

const abilityFor = (...actions: string[]) =>
   createMongoAbility(
      actions.map((action) => ({ action, subject: 'client' })),
      { resolveAction }
   );

describe('resolveAction', () => {
   it('maps database commands to UI aliases', () => {
      const ability = abilityFor('select', 'insert');

      expect(ability.can('read', 'client')).toBe(true);
      expect(ability.can('view', 'client')).toBe(true);
      expect(ability.can('create', 'client')).toBe(true);
      expect(ability.can('edit', 'client')).toBe(false);
   });

   it('treats "modify" as either update or delete', () => {
      expect(abilityFor('update').can('modify', 'client')).toBe(true);
      expect(abilityFor('delete').can('modify', 'client')).toBe(true);
      expect(abilityFor('delete').can('edit', 'client')).toBe(false);
      expect(abilityFor('update').can('remove', 'client')).toBe(false);
   });

   it('does not grant anything for unrelated subjects', () => {
      expect(abilityFor('select').can('read', 'stock')).toBe(false);
   });
});
