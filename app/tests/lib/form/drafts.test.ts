import { clearDrafts, draftKey, loadDraft, removeDraft, saveDraft } from '@/lib/form/drafts';
import { beforeEach, describe, expect, it } from 'vitest';

const scope = { userId: 'u1', tenantId: 't1' };

beforeEach(() => sessionStorage.clear());

describe('form drafts', () => {
   it('scopes keys to the user, tenant and form', () => {
      expect(draftKey(scope, 'client:c1')).toBe('draft:u1:t1:client:c1');
      expect(draftKey({ userId: 'u1', tenantId: null }, 'client:new')).toBe(
         'draft:u1:-:client:new'
      );
   });

   it('keeps values, including dates, across a round trip', () => {
      const key = draftKey(scope, 'client:c1');
      const birthDate = new Date('1990-01-02T00:00:00.000Z');
      saveDraft(key, {
         values: { name: 'Ada', birth_date: birthDate, address: [{ city: 'İzmir' }] },
         base: { name: 'A', birth_date: null, address: [] }
      });

      const draft = loadDraft<{ name: string; birth_date: Date }>(key);

      expect(draft?.values.name).toBe('Ada');
      expect(draft?.values.birth_date).toBeInstanceOf(Date);
      expect(draft?.values.birth_date.getTime()).toBe(birthDate.getTime());
      expect(draft?.base).toEqual({ name: 'A', birth_date: null, address: [] });
      expect(draft?.savedAt).toBeTypeOf('number');
   });

   it('returns null for a missing or unreadable draft', () => {
      expect(loadDraft('draft:none')).toBeNull();
      sessionStorage.setItem('draft:bad', '{not json');
      expect(loadDraft('draft:bad')).toBeNull();
   });

   it('removes one draft, or all of them but nothing else', () => {
      saveDraft(draftKey(scope, 'a'), { values: 1, base: 0 });
      saveDraft(draftKey(scope, 'b'), { values: 1, base: 0 });
      sessionStorage.setItem('route-dialogs', '[]');

      removeDraft(draftKey(scope, 'a'));
      expect(loadDraft(draftKey(scope, 'a'))).toBeNull();
      expect(loadDraft(draftKey(scope, 'b'))).not.toBeNull();

      clearDrafts();
      expect(loadDraft(draftKey(scope, 'b'))).toBeNull();
      expect(sessionStorage.getItem('route-dialogs')).toBe('[]');
   });
});
