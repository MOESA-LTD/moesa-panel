import { assertEquals } from 'jsr:@std/assert@1';
import { type AccountReach, belongsToCompany, isManageable } from '../_shared/company.ts';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const BRANCH = '11111111-1111-1111-1111-222222222222';
const OTHER_COMPANY = '33333333-3333-3333-3333-333333333333';

const company = new Set([COMPANY, BRANCH]);

const reach = (overrides: Partial<AccountReach> = {}): AccountReach => ({
   isSuperAdmin: false,
   owns: [],
   memberOf: [BRANCH],
   ...overrides
});

Deno.test('isManageable allows a plain member of the company', () => {
   assertEquals(isManageable(reach({ memberOf: [COMPANY, BRANCH] }), company), true);
});

Deno.test('isManageable refuses a super admin', () => {
   assertEquals(isManageable(reach({ isSuperAdmin: true }), company), false);
});

Deno.test('isManageable refuses an owner, of any tenant', () => {
   assertEquals(isManageable(reach({ owns: [BRANCH] }), company), false);
   assertEquals(isManageable(reach({ owns: [OTHER_COMPANY] }), company), false);
});

Deno.test('isManageable refuses a member of another company', () => {
   assertEquals(isManageable(reach({ memberOf: [BRANCH, OTHER_COMPANY] }), company), false);
});

Deno.test('belongsToCompany accepts a member or an owner of one of its tenants', () => {
   assertEquals(belongsToCompany(reach(), company), true);
   assertEquals(belongsToCompany(reach({ memberOf: [], owns: [COMPANY] }), company), true);
});

Deno.test('belongsToCompany refuses an account used elsewhere only', () => {
   assertEquals(belongsToCompany(reach({ memberOf: [OTHER_COMPANY] }), company), false);
   assertEquals(belongsToCompany(reach({ memberOf: [] }), company), false);
   assertEquals(belongsToCompany(reach({ memberOf: [], isSuperAdmin: true }), company), false);
});
