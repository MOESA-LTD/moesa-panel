import { toUserFormValues, toUserPayload, userSchema } from '@/api/user';
import { describe, expect, it } from 'vitest';

const payload = (values: Parameters<typeof toUserFormValues>[0]) =>
   toUserPayload(userSchema.parse(toUserFormValues(values)));

describe('toUserPayload', () => {
   it('sends the email to invite a new member', () => {
      expect(
         payload({ email: 'new@moesa-panel.test', user_metadata: { display_name: 'New' } })
      ).toMatchObject({
         id: undefined,
         attributes: { email: 'new@moesa-panel.test', user_metadata: { display_name: 'New' } }
      });
   });

   it('never sends sign-in details for an existing member', () => {
      const { attributes } = payload({
         id: 'user',
         email: 'member@moesa-panel.test',
         phone: '+905550000000',
         user_metadata: { display_name: 'Member' }
      });
      expect(attributes).toEqual({ user_metadata: { display_name: 'Member' } });
   });
});
