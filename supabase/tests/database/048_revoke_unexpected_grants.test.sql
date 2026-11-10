CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The API roles hold no TRUNCATE, REFERENCES or TRIGGER on any public table (048), and tables
-- that postgres creates later do not get them back through the default privileges; a signed-in
-- user cannot TRUNCATE; SELECT stays until the cutover (field permissions, Task 19).
BEGIN;

SELECT plan(4);

SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER') $$, 'no public table grants TRUNCATE/REFERENCES/TRIGGER to anon or authenticated');

SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace
   AND d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'r'
   AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=[a-zA-Z]*[Dxt]') $$, 'new tables of postgres do not grant TRUNCATE/REFERENCES/TRIGGER');

-- As koordinator in MOESA LTD.
SELECT private.impersonate(
    (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'),
    (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')
);

SELECT throws_ok($$ TRUNCATE public.product CASCADE $$, '42501', NULL, 'a user cannot TRUNCATE');

SELECT ok(NOT has_table_privilege('authenticated', 'public.product', 'SELECT'), 'the cutover closed SELECT');

SELECT * FROM finish();

ROLLBACK;
