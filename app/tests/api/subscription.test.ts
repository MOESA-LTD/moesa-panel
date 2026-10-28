import type { SubscriptionSummary, Tenant } from '@/api/access';
import { companyOf } from '@/api/branch';
import { daysLeft, isEndingSoon, planBlock } from '@/api/subscription';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

const summary = (overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
   company_id: 'company',
   plan: { id: 'plan', display_name: 'Pro' },
   status: 'active',
   starts_at: null,
   ends_at: null,
   writable: true,
   modules: [],
   locked: {},
   limits: { max_branches: 3, max_users: 5 },
   usage: { branches: 1, users: 5 },
   ...overrides
});

describe('planBlock', () => {
   it('allows a change within the limit, and one the plan does not limit', () => {
      expect(planBlock(summary(), 'max_branches')).toBeNull();
      expect(planBlock(summary({ limits: {} }), 'max_users')).toBeNull();
      expect(planBlock(summary())).toBeNull();
   });

   it('refuses one more of what a limit counts once it is reached', () => {
      expect(planBlock(summary(), 'max_users')).toBe('plan_limit_users');
      expect(planBlock(summary({ limits: { max_branches: 0 } }), 'max_branches')).toBe(
         'plan_limit_branches'
      );
   });

   it('refuses every change once the company is read-only', () => {
      expect(planBlock(summary({ writable: false }))).toBe('subscription_read_only');
      expect(planBlock(summary({ writable: false }), 'max_branches')).toBe(
         'subscription_read_only'
      );
   });

   it('leaves it to the database without a subscription loaded', () => {
      expect(planBlock(null, 'max_users')).toBeNull();
   });
});

describe('daysLeft / isEndingSoon', () => {
   it('counts whole days, and points out an end within a week', () => {
      const soon = summary({ ends_at: dayjs().add(3, 'day').toISOString() });
      expect(daysLeft(soon)).toBe(3);
      expect(isEndingSoon(soon)).toBe(true);

      const later = summary({ ends_at: dayjs().add(30, 'day').toISOString() });
      expect(isEndingSoon(later)).toBe(false);
   });

   it('has no end without ends_at, and nothing to point out once it ended', () => {
      expect(daysLeft(summary())).toBeNull();
      expect(
         isEndingSoon(
            summary({ writable: false, ends_at: dayjs().subtract(1, 'day').toISOString() })
         )
      ).toBe(false);
   });
});

describe('companyOf', () => {
   const tenant = (id: string, parent_id: string | null): Tenant => ({
      id,
      display_name: id,
      parent_id
   });

   it('walks up to the top-level tenant the user can see', () => {
      const tenants = [tenant('root', null), tenant('a', 'root'), tenant('a1', 'a')];
      expect(companyOf(tenants, 'a1')).toBe('root');
      expect(companyOf(tenants, 'root')).toBe('root');
      expect(companyOf([tenant('member-of', 'hidden')], 'member-of')).toBe('member-of');
   });
});
