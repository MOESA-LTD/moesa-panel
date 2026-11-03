-- enable explain
ALTER ROLE authenticator
SET
    pgrst.db_plan_enabled TO 'true';

-- reload the config
NOTIFY pgrst,
'reload config';

-- Reference data (permissions, audit config, owner role, plans) lives in the migrations; this file
-- only adds demo data: companies on each kind of subscription with their branches, roles and
-- members.
--
-- Demo accounts (local only), all with the password Demo1234!
--   admin@moesa-panel.test    super admin (manages plans and subscriptions, no company)
--   ayse@moesa-panel.test     owner of Atlas Danışmanlık (Pro, branch limit reached: 3/3)
--   mehmet@moesa-panel.test   branch manager, Atlas Avcılar
--   zeynep@moesa-panel.test   staff, Atlas Kadıköy and Atlas Moda (two memberships)
--   can@moesa-panel.test      auditor, Atlas Danışmanlık
--   ali@moesa-panel.test      owner of Nova Yazılım (Basic trial ending in 5 days)
--   elif@moesa-panel.test     staff, Nova Yazılım
--   deniz@moesa-panel.test    owner of Kuzey Holding (Enterprise, branches two levels deep)
--   burak@moesa-panel.test    branch manager, Kuzey Ankara
--   selin@moesa-panel.test    owner of Eski Ticaret (Pro, expired: read-only)

-- Demo helpers, dropped at the end.

-- A confirmed account that signs in with Demo1234! (public.user follows through handle_new_user).
CREATE OR REPLACE FUNCTION private.seed_user (email TEXT, display_name TEXT, is_super_admin BOOLEAN DEFAULT FALSE) RETURNS UUID LANGUAGE plpgsql
SET
    search_path = '' AS $$
DECLARE
    id UUID := gen_random_uuid();
BEGIN
    -- GoTrue reads the token columns as strings: they must be '' rather than NULL.
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', seed_user.email,
        extensions.crypt('Demo1234!', extensions.gen_salt('bf')), NOW(),
        '{"provider": "email", "providers": ["email"]}', jsonb_build_object('display_name', seed_user.display_name),
        seed_user.is_super_admin, NOW(), NOW(),
        '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
        id::TEXT, id, jsonb_build_object('sub', id::TEXT, 'email', seed_user.email, 'email_verified', TRUE),
        'email', NOW(), NOW(), NOW()
    );
    RETURN id;
END;
$$;

-- A tenant (a company without `parent_id`, else a branch) with its roles.
CREATE OR REPLACE FUNCTION private.seed_tenant (display_name TEXT, parent_id UUID DEFAULT NULL, email TEXT DEFAULT NULL) RETURNS UUID LANGUAGE plpgsql
SET
    search_path = '' AS $$
DECLARE
    id UUID;
BEGIN
    INSERT INTO public.tenant (display_name, parent_id, email)
    VALUES (seed_tenant.display_name, seed_tenant.parent_id, seed_tenant.email)
    RETURNING public.tenant.id INTO id;

    PERFORM private.seed_roles(id);
    RETURN id;
END;
$$;

-- The roles of a tenant: a manager (everything), staff (reading the branch, users and roles) and
-- an auditor (the change history, reading the rest).
CREATE OR REPLACE FUNCTION private.seed_roles (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.role (display_name, tenant_id)
    SELECT name, seed_roles.tenant_id
    FROM unnest(ARRAY['Branch manager', 'Staff', 'Auditor']) AS name;

    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.role r
    JOIN public.permission p ON CASE r.display_name
        WHEN 'Branch manager' THEN TRUE
        WHEN 'Staff' THEN p.group_name IN ('branch', 'user', 'role') AND p.command = 'select'
        ELSE p.group_name = 'audit_log' OR p.command = 'select'
    END
    WHERE r.tenant_id = seed_roles.tenant_id;
END;
$$;

-- A member of a tenant, with one of its roles.
CREATE OR REPLACE FUNCTION private.seed_member (tenant_id UUID, user_id UUID, role_name TEXT) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (seed_member.tenant_id, seed_member.user_id);
    INSERT INTO public.user_role (user_id, role_id)
    SELECT seed_member.user_id, r.id FROM public.role r
    WHERE r.tenant_id = seed_member.tenant_id AND r.display_name = seed_member.role_name;
END;
$$;

-- An owner of a company, who is also a member of it.
CREATE OR REPLACE FUNCTION private.seed_owner (tenant_id UUID, user_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.tenant_owner (tenant_id, user_id) VALUES (seed_owner.tenant_id, seed_owner.user_id);
    INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (seed_owner.tenant_id, seed_owner.user_id);
END;
$$;

-- The demo companies. Each starts on the default plan's trial (subscribe_new_company); the
-- subscriptions are set last, so the branches and members go in while the plan allows them.
DO $$
DECLARE
    admin_id UUID := private.seed_user('admin@moesa-panel.test', 'System Admin', TRUE);
    ayse UUID := private.seed_user('ayse@moesa-panel.test', 'Ayşe Yılmaz');
    mehmet UUID := private.seed_user('mehmet@moesa-panel.test', 'Mehmet Avcı');
    zeynep UUID := private.seed_user('zeynep@moesa-panel.test', 'Zeynep Kaya');
    can UUID := private.seed_user('can@moesa-panel.test', 'Can Demir');
    ali UUID := private.seed_user('ali@moesa-panel.test', 'Ali Şahin');
    elif UUID := private.seed_user('elif@moesa-panel.test', 'Elif Çelik');
    deniz UUID := private.seed_user('deniz@moesa-panel.test', 'Deniz Arslan');
    burak UUID := private.seed_user('burak@moesa-panel.test', 'Burak Doğan');
    selin UUID := private.seed_user('selin@moesa-panel.test', 'Selin Aydın');
    atlas UUID;
    kadikoy UUID;
    nova UUID;
    kuzey UUID;
    ankara UUID;
    eski UUID;
BEGIN
    -- Atlas Danışmanlık: Pro, every branch the plan allows.
    atlas := private.seed_tenant('Atlas Danışmanlık', NULL, 'info@atlas.test');
    PERFORM private.seed_owner(atlas, ayse);
    PERFORM private.seed_member(atlas, can, 'Auditor');
    PERFORM private.seed_member(private.seed_tenant('Atlas Avcılar', atlas), mehmet, 'Branch manager');
    kadikoy := private.seed_tenant('Atlas Kadıköy', atlas);
    PERFORM private.seed_member(kadikoy, zeynep, 'Staff');
    PERFORM private.seed_member(private.seed_tenant('Atlas Moda', kadikoy), zeynep, 'Staff');

    -- Nova Yazılım: Basic, its trial ending soon.
    nova := private.seed_tenant('Nova Yazılım', NULL, 'info@nova.test');
    PERFORM private.seed_owner(nova, ali);
    PERFORM private.seed_member(nova, elif, 'Staff');

    -- Kuzey Holding: Enterprise, branches two levels deep.
    kuzey := private.seed_tenant('Kuzey Holding', NULL, 'info@kuzey.test');
    PERFORM private.seed_owner(kuzey, deniz);
    ankara := private.seed_tenant('Kuzey Ankara', kuzey);
    PERFORM private.seed_member(ankara, burak, 'Branch manager');
    PERFORM private.seed_tenant('Kuzey Çankaya', ankara);
    PERFORM private.seed_tenant('Kuzey İzmir', kuzey);

    -- Eski Ticaret: Pro, expired, so read-only.
    eski := private.seed_tenant('Eski Ticaret', NULL, 'info@eski.test');
    PERFORM private.seed_owner(eski, selin);

    UPDATE public.subscription s
    SET
        plan_id = p.id,
        is_trial = setting.is_trial,
        starts_at = NOW() + setting.starts,
        ends_at = NOW() + setting.ends,
        note = 'Demo',
        created_by = admin_id
    FROM (
        VALUES
            (atlas, 'Pro', FALSE, INTERVAL '-8 months', NULL::INTERVAL),
            (nova, 'Basic', TRUE, INTERVAL '-9 days', INTERVAL '5 days'),
            (kuzey, 'Enterprise', FALSE, INTERVAL '-2 months', INTERVAL '10 months'),
            (eski, 'Pro', FALSE, INTERVAL '-13 months', INTERVAL '-10 days')
    ) AS setting (tenant_id, plan_name, is_trial, starts, ends)
    JOIN public.plan p ON p.display_name = setting.plan_name
    WHERE s.tenant_id = setting.tenant_id;
END;
$$;

DROP FUNCTION private.seed_user (TEXT, TEXT, BOOLEAN),
private.seed_tenant (TEXT, UUID, TEXT),
private.seed_roles (UUID),
private.seed_member (UUID, UUID, TEXT),
private.seed_owner (UUID, UUID);
