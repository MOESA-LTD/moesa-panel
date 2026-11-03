CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(8);

SELECT has_table('public', 'setting', 'setting table');

SELECT has_table('public', 'code_sequence', 'code_sequence table');

SELECT has_function('public', 'next_code', ARRAY['text', 'text'], 'next_code');

-- A new company (root tenant) gets the default settings; inserted as the migration role, before
-- impersonating, since signed-in users do not create companies.
INSERT INTO public.tenant (display_name) VALUES ('pgTAP Root Tenant');

SELECT is(
    (
        SELECT count(*)::INT
        FROM public.setting s
        JOIN public.tenant t ON t.id = s.tenant_id
        WHERE t.display_name = 'pgTAP Root Tenant'
    ),
    (SELECT count(*)::INT FROM private.default_settings()),
    'a new root tenant gets the default settings'
);

SELECT is((SELECT count(*)::INT FROM public.platform), 10, 'platform has the 10 marketplaces');

-- The rest runs as a signed-in owner of a demo company.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')
);

-- Counter: consecutive within one customer and year, independent across customers.
SELECT is(public.next_code('project', 'THO'), 'THO-' || extract(year FROM now())::INT || '-001');

SELECT is(public.next_code('project', 'THO'), 'THO-' || extract(year FROM now())::INT || '-002');

SELECT is(public.next_code('po', 'ABC'), 'PO-ABC-' || extract(year FROM now())::INT || '-001');

SELECT * FROM finish();

ROLLBACK;
