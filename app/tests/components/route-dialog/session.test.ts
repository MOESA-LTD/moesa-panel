import {
   clearDialogs,
   dialogsToRestore,
   forgetDialog,
   markOffScreen,
   markOnScreen,
   markReopening,
   rememberDialog,
   savedDialogs,
   takeReopening,
   updateDialog
} from '@/components/layout/route-dialog/session';
import { beforeEach, describe, expect, it } from 'vitest';

const dialog = (id: string, userId = 'u1') => ({
   id,
   userId,
   path: `/en/client/${id}/manage?showDialog=center`,
   position: 'center' as const
});

beforeEach(() => sessionStorage.clear());

describe('route dialog session', () => {
   it('keeps the open dialogs of each user in opening order', () => {
      rememberDialog(dialog('a'));
      rememberDialog(dialog('b'));
      rememberDialog(dialog('c', 'u2'));

      expect(savedDialogs('u1').map(({ id }) => id)).toEqual(['a', 'b']);
      expect(savedDialogs('u2').map(({ id }) => id)).toEqual(['c']);
   });

   it('replaces a dialog that is reopened instead of adding it twice', () => {
      rememberDialog(dialog('a'));
      rememberDialog({ ...dialog('a'), position: 'left' });

      expect(savedDialogs('u1')).toEqual([{ ...dialog('a'), position: 'left' }]);
   });

   it('stores the frame and forgets closed dialogs', () => {
      rememberDialog(dialog('a'));
      updateDialog('a', { style: 'left: 10px;', state: 'maximized', normalStyle: 'left: 5px;' });
      expect(savedDialogs('u1')[0]).toMatchObject({
         state: 'maximized',
         normalStyle: 'left: 5px;'
      });

      forgetDialog('a');
      expect(savedDialogs('u1')).toEqual([]);
      expect(sessionStorage.getItem('route-dialogs')).toBeNull();
   });

   it('clears everything', () => {
      rememberDialog(dialog('a'));
      rememberDialog(dialog('b', 'u2'));
      clearDialogs();

      expect(savedDialogs('u1')).toEqual([]);
      expect(savedDialogs('u2')).toEqual([]);
   });

   it('hands a dialog being reopened to the guard once', () => {
      const saved = dialog('a');
      markReopening(saved);

      expect(takeReopening(saved.path)).toBe(saved);
      expect(takeReopening(saved.path)).toBeUndefined();
   });

   it('restores only the dialogs that are not on screen', () => {
      rememberDialog(dialog('a'));
      rememberDialog(dialog('b'));
      // b was opened by the page's own URL before the restore ran.
      markOnScreen('b');

      expect(dialogsToRestore('u1', null).map(({ id }) => id)).toEqual(['a']);

      // Closed again, e.g. by an expired session: restored after signing in.
      markOffScreen('b');
      expect(dialogsToRestore('u1', null).map(({ id }) => id)).toEqual(['a', 'b']);
   });

   it('restores the dialogs of a tenant in that tenant only', () => {
      rememberDialog({ ...dialog('a'), tenantId: 't1' });
      rememberDialog({ ...dialog('b'), tenantId: 't2' });
      // A page of no tenant (e.g. the account) comes back in every tenant.
      rememberDialog(dialog('c'));

      expect(dialogsToRestore('u1', 't1').map(({ id }) => id)).toEqual(['a', 'c']);
      expect(dialogsToRestore('u1', 't2').map(({ id }) => id)).toEqual(['b', 'c']);
   });
});
