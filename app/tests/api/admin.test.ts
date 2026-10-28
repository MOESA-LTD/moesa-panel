import { planSchema, toPlanFormValues, toPlanPayload, type PlanWithTerms } from '@/api/admin';
import { describe, expect, it } from 'vitest';

const plan = (overrides: Partial<PlanWithTerms> = {}): PlanWithTerms => ({
   id: 'plan',
   display_name: 'Pro',
   description: null,
   price: 499,
   currency: 'TRY',
   billing_period: 'month',
   trial_days: 14,
   is_default: true,
   is_active: true,
   position: 20,
   created_at: null,
   plan_module: [{ module_id: 'stock' }, { module_id: 'client' }],
   plan_limit: [{ limit_key: 'max_branches', value: 3 }],
   ...overrides
});

describe('plan form', () => {
   it('reads modules and limits, a missing limit as unlimited', () => {
      const values = toPlanFormValues(plan());
      expect(values.modules).toEqual(['stock', 'client']);
      expect(values.max_branches).toBe(3);
      expect(values.max_users).toBeNull();
   });

   it('starts a new plan limited, so nothing is unlimited by accident', () => {
      const values = toPlanFormValues(null);
      expect(values.max_branches).toBe(0);
      expect(values.max_users).not.toBeNull();
   });

   it('sends the modules and every limit, unlimited ones as null', () => {
      const payload = toPlanPayload(planSchema.parse(toPlanFormValues(plan({ description: '' }))));
      expect(payload.moduleIds).toEqual(['stock', 'client']);
      expect(payload.limits).toEqual({ max_branches: 3, max_users: null });
      expect(payload.plan).not.toHaveProperty('modules');
      expect(payload.plan.description).toBeNull();
   });
});
