-- enable explain
ALTER ROLE authenticator
SET
    pgrst.db_plan_enabled TO 'true';

-- reload the config
NOTIFY pgrst,
'reload config';

-- Reference data (permissions, audit config, owner role, categories, plans) lives in the
-- migrations; this file only adds demo data: a product catalogue, and companies on each kind of
-- subscription with their branches, roles, members and business data.
--
-- Demo accounts (local only), all with the password Demo1234!
--   admin@echochart.test    super admin (manages plans and subscriptions, no company)
--   ayse@echochart.test     owner of Bade İşitme (Pro, branch limit reached: 3/3)
--   mehmet@echochart.test   branch manager, Bade Avcılar
--   zeynep@echochart.test   sales consultant, Bade Kadıköy and Bade Moda (two memberships)
--   can@echochart.test      audiologist, Bade İşitme
--   ali@echochart.test      owner of Duyu Medikal (Basic trial ending in 5 days)
--   elif@echochart.test     sales consultant, Duyu Medikal
--   deniz@echochart.test    owner of Sesli Yaşam (Enterprise, branches two levels deep)
--   burak@echochart.test    branch manager, Sesli Yaşam Ankara
--   selin@echochart.test    owner of Eski İşitme (Pro, expired: read-only)

-- Product catalogue (shared: tenant_id NULL)
INSERT INTO
    public.product (display_name, brand, details, created_at)
SELECT
    item.display_name,
    item.brand,
    item.details,
    NOW() - (random() * INTERVAL '1 year')
FROM
    (
        VALUES
            ('Audéo Lumity 90', 'Phonak', 'Rechargeable receiver-in-canal hearing aid'),
            ('Audéo Lumity 70', 'Phonak', 'Rechargeable receiver-in-canal hearing aid'),
            ('Naída Lumity 50', 'Phonak', 'Behind-the-ear hearing aid for severe loss'),
            ('Intent 1', 'Oticon', 'Receiver-in-canal hearing aid with motion sensors'),
            ('Real 2', 'Oticon', 'Receiver-in-canal hearing aid'),
            ('Pure Charge&Go 7IX', 'Signia', 'Rechargeable receiver-in-canal hearing aid'),
            ('Insio 3IX CIC', 'Signia', 'Completely-in-canal custom hearing aid'),
            ('Moment Sheer 440', 'Widex', 'Receiver-in-canal hearing aid'),
            ('Nexia 9', 'ReSound', 'Receiver-in-canal hearing aid'),
            ('Omnia 7', 'ReSound', 'Behind-the-ear hearing aid'),
            ('Hearing test', 'Clinic', 'Pure-tone and speech audiometry'),
            ('Fitting and tuning', 'Clinic', 'Programming a hearing aid to the audiogram'),
            ('Ear impression', 'Clinic', 'Impression for a custom earmold'),
            ('Cleaning and maintenance', 'Clinic', 'Periodic device service'),
            ('Custom earmold', 'Phonak', 'Acrylic earmold made to measure'),
            ('Receiver M', 'Oticon', 'Medium-power receiver'),
            ('Open dome set', 'Signia', 'Open domes, 10 pieces'),
            ('Wax guard filters', 'Widex', 'Wax guards, 8 pieces'),
            ('Charger case', 'ReSound', 'Portable charging case'),
            ('Battery size 10 (6 pack)', 'Rayovac', 'Zinc-air hearing aid batteries'),
            ('Battery size 13 (6 pack)', 'Rayovac', 'Zinc-air hearing aid batteries'),
            ('Battery size 312 (6 pack)', 'Duracell', 'Zinc-air hearing aid batteries'),
            ('Battery size 675 (6 pack)', 'Duracell', 'Zinc-air hearing aid batteries')
    ) AS item (display_name, brand, details)
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            public.product p
        WHERE
            p.display_name = item.display_name
            AND p.tenant_id IS NULL
    );

INSERT INTO
    public.product_categories (product_id, category_id)
SELECT
    p.id,
    c.id
FROM
    public.product p
    JOIN public.product_category c ON c.display_name = CASE
        WHEN p.brand = 'Clinic' THEN 'service'
        WHEN p.display_name LIKE 'Battery%' THEN 'battery'
        WHEN p.details LIKE '%hearing aid%' THEN 'device'
        ELSE 'spare part'
    END
WHERE
    p.tenant_id IS NULL
ON CONFLICT DO NOTHING;

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

-- A tenant (a company without `parent_id`, else a branch) with its demo data and roles.
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
    PERFORM private.seed_clients(id);
    PERFORM private.seed_addresses(id);
    PERFORM private.seed_stock(id);
    PERFORM private.seed_records(id);
    RETURN id;
END;
$$;

-- The roles of a tenant: a manager (everything of its modules), a sales consultant (clients and
-- records, reading the rest) and an audiologist (records, reading clients and stock).
CREATE OR REPLACE FUNCTION private.seed_roles (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.role (display_name, tenant_id)
    SELECT name, seed_roles.tenant_id
    FROM unnest(ARRAY['Branch manager', 'Sales consultant', 'Audiologist']) AS name;

    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.role r
    JOIN public.permission p ON CASE r.display_name
        WHEN 'Branch manager' THEN p.group_name IN ('branch', 'user', 'client', 'address', 'record', 'product', 'stock', 'audit_log')
        WHEN 'Sales consultant' THEN p.group_name IN ('client', 'address', 'record')
            OR (p.group_name IN ('product', 'stock', 'branch') AND p.command = 'select')
        ELSE (p.group_name = 'record' AND p.command IN ('select', 'insert', 'update'))
            OR (p.group_name IN ('client', 'address', 'product', 'stock', 'branch') AND p.command = 'select')
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

CREATE OR REPLACE FUNCTION private.seed_clients (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.client (national_id, display_name, birth_date, gender, email, phone, nationality, tenant_id, created_at)
    SELECT
        gen_random_uuid(),
        c.display_name,
        c.birth_date::DATE,
        c.gender,
        lower(translate(replace(c.display_name, ' ', '.'), 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')) || '.' || substr(seed_clients.tenant_id::TEXT, 1, 8) || '@example.com',
        '+90532' || lpad(floor(random() * 10000000)::TEXT, 7, '0'),
        c.nationality,
        seed_clients.tenant_id,
        NOW() - (random() * INTERVAL '1 year')
    FROM (
        VALUES
            ('Hatice Yılmaz', '1948-03-12', 'female', 'Türkiye'),
            ('Mustafa Kaya', '1952-07-04', 'male', 'Türkiye'),
            ('Fatma Demir', '1957-11-23', 'female', 'Türkiye'),
            ('Ahmet Şahin', '1944-01-30', 'male', 'Türkiye'),
            ('Emine Çelik', '1961-05-17', 'female', 'Türkiye'),
            ('Hüseyin Yıldız', '1950-09-08', 'male', 'Türkiye'),
            ('Ayşe Öztürk', '1966-02-14', 'female', 'Türkiye'),
            ('İbrahim Aydın', '1939-12-02', 'male', 'Türkiye'),
            ('Zehra Arslan', '1972-08-19', 'female', 'Türkiye'),
            ('Osman Doğan', '1955-04-27', 'male', 'Türkiye'),
            ('Elena Petrova', '1963-10-05', 'female', 'Russia'),
            ('Hans Weber', '1947-06-21', 'male', 'Germany')
    ) AS c (display_name, birth_date, gender, nationality);
END;
$$;

-- Addresses of a tenant, each given to some of its clients.
CREATE OR REPLACE FUNCTION private.seed_addresses (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.address (display_name, country, city, district, details, tenant_id)
    SELECT a.display_name, 'Türkiye', a.city, a.district, a.details, seed_addresses.tenant_id
    FROM (
        VALUES
            ('Home', 'İstanbul', 'Avcılar', 'Cihangir Mah. Petunya Sok. No:12 D:4'),
            ('Home', 'İstanbul', 'Kadıköy', 'Caferağa Mah. Moda Cad. No:85 D:2'),
            ('Work', 'İstanbul', 'Şişli', 'Mecidiyeköy Mah. Büyükdere Cad. No:120'),
            ('Home', 'Ankara', 'Çankaya', 'Kızılay Mah. Atatürk Blv. No:45 D:9'),
            ('Home', 'Ankara', 'Keçiören', 'Etlik Mah. Yunus Emre Cad. No:7'),
            ('Home', 'İzmir', 'Karşıyaka', 'Bostanlı Mah. Cemal Gürsel Cad. No:301 D:5'),
            ('Summer house', 'Muğla', 'Bodrum', 'Gümbet Mah. Adnan Menderes Cad. No:18'),
            ('Home', 'Bursa', 'Nilüfer', 'Beşevler Mah. Kırlangıç Sok. No:3 D:1')
    ) AS a (display_name, city, district, details);

    INSERT INTO public.client_address (client_id, address_id)
    SELECT c.id, a.id
    FROM public.client c, public.address a
    WHERE c.tenant_id = seed_addresses.tenant_id AND a.tenant_id = seed_addresses.tenant_id AND random() < 0.2;
END;
$$;

-- A few deliveries of every product into a tenant's stock.
CREATE OR REPLACE FUNCTION private.seed_stock (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.stock (
        tenant_id, product_id, quantity, unit_cost, unit_discount, unit_tax, currency_code, vendor,
        serial_number, barcode, details, stocked_at, unit_type
    )
    SELECT
        seed_stock.tenant_id,
        p.id,
        CASE WHEN c.display_name = 'device' THEN floor(random() * 6 + 2) ELSE floor(random() * 40 + 10) END::INTEGER,
        ROUND((CASE c.display_name
            WHEN 'device' THEN random() * 60000 + 25000
            WHEN 'service' THEN random() * 1500 + 500
            WHEN 'battery' THEN random() * 150 + 100
            ELSE random() * 2000 + 200
        END)::NUMERIC, 2),
        0,
        20,
        'TRY',
        (ARRAY['Akustik Medikal A.Ş.', 'Odyo Tedarik Ltd.', 'Ses Teknoloji', 'İşitme Market'])[floor(random() * 4 + 1)],
        'SN-' || upper(substr(md5(random()::TEXT), 1, 10)),
        'B-' || gen_random_uuid(),
        NULL,
        NOW() - (random() * INTERVAL '1 year'),
        'pcs'
    FROM public.product p
    JOIN public.product_categories pc ON pc.product_id = p.id
    JOIN public.product_category c ON c.id = pc.category_id
    CROSS JOIN generate_series(1, 3)
    WHERE p.tenant_id IS NULL;
END;
$$;

-- Sales, trials, fittings, repairs and promotions from a tenant's stock to its clients.
CREATE OR REPLACE FUNCTION private.seed_records (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql
SET
    search_path = '' AS $$
DECLARE
    item RECORD;
BEGIN
    FOR item IN
        SELECT s.id AS stock_id, s.unit_cost, (
            -- Refers to the stock row (not the parameter), so a client is drawn for each record.
            SELECT c.id FROM public.client c WHERE c.tenant_id = s.tenant_id ORDER BY random() LIMIT 1
        ) AS client_id
        FROM public.stock s
        WHERE s.tenant_id = seed_records.tenant_id AND random() < 0.6
    LOOP
        INSERT INTO public.record (
            tenant_id, stock_id, record_type, record_status, quantity, payment_type, currency_code,
            bid, bid_discount, tax, client_id, details, created_at
        ) VALUES (
            seed_records.tenant_id,
            item.stock_id,
            CASE WHEN random() < 0.5 THEN 'sale' ELSE (ARRAY['trial', 'assemble', 'repair', 'promotion'])[floor(random() * 4 + 1)] END,
            (ARRAY['done', 'pending'])[floor(random() * 2 + 1)],
            1,
            (ARRAY['credit_card', 'cash'])[floor(random() * 2 + 1)],
            'TRY',
            ROUND(item.unit_cost * (1.2 + random() * 0.3)::NUMERIC, 2),
            ROUND(item.unit_cost * (random() * 0.1)::NUMERIC, 2),
            20,
            item.client_id,
            NULL,
            NOW() - (random() * INTERVAL '1 year')
        );
    END LOOP;
END;
$$;

-- The demo companies. Each starts on the default plan's trial (subscribe_new_company); the
-- subscriptions are set last, so the branches and members go in while the plan allows them.
DO $$
DECLARE
    admin_id UUID := private.seed_user('admin@echochart.test', 'System Admin', TRUE);
    ayse UUID := private.seed_user('ayse@echochart.test', 'Ayşe Bade');
    mehmet UUID := private.seed_user('mehmet@echochart.test', 'Mehmet Avcı');
    zeynep UUID := private.seed_user('zeynep@echochart.test', 'Zeynep Moda');
    can UUID := private.seed_user('can@echochart.test', 'Can Odyolog');
    ali UUID := private.seed_user('ali@echochart.test', 'Ali Duyu');
    elif UUID := private.seed_user('elif@echochart.test', 'Elif Satış');
    deniz UUID := private.seed_user('deniz@echochart.test', 'Deniz Sesli');
    burak UUID := private.seed_user('burak@echochart.test', 'Burak Ankara');
    selin UUID := private.seed_user('selin@echochart.test', 'Selin Eski');
    bade UUID;
    kadikoy UUID;
    duyu UUID;
    sesli UUID;
    ankara UUID;
    eski UUID;
BEGIN
    -- Bade İşitme: Pro, every branch the plan allows.
    bade := private.seed_tenant('Bade İşitme', NULL, 'info@bade.test');
    PERFORM private.seed_owner(bade, ayse);
    PERFORM private.seed_member(bade, can, 'Audiologist');
    PERFORM private.seed_member(private.seed_tenant('Bade Avcılar', bade), mehmet, 'Branch manager');
    kadikoy := private.seed_tenant('Bade Kadıköy', bade);
    PERFORM private.seed_member(kadikoy, zeynep, 'Sales consultant');
    PERFORM private.seed_member(private.seed_tenant('Bade Moda', kadikoy), zeynep, 'Sales consultant');

    -- Duyu Medikal: Basic, its trial ending soon.
    duyu := private.seed_tenant('Duyu Medikal', NULL, 'info@duyu.test');
    PERFORM private.seed_owner(duyu, ali);
    PERFORM private.seed_member(duyu, elif, 'Sales consultant');

    -- Sesli Yaşam: Enterprise, branches two levels deep.
    sesli := private.seed_tenant('Sesli Yaşam', NULL, 'info@sesli.test');
    PERFORM private.seed_owner(sesli, deniz);
    ankara := private.seed_tenant('Sesli Yaşam Ankara', sesli);
    PERFORM private.seed_member(ankara, burak, 'Branch manager');
    PERFORM private.seed_tenant('Sesli Yaşam Çankaya', ankara);
    PERFORM private.seed_tenant('Sesli Yaşam İzmir', sesli);

    -- Eski İşitme: Pro, expired, so read-only.
    eski := private.seed_tenant('Eski İşitme', NULL, 'info@eski.test');
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
            (bade, 'Pro', FALSE, INTERVAL '-8 months', NULL::INTERVAL),
            (duyu, 'Basic', TRUE, INTERVAL '-9 days', INTERVAL '5 days'),
            (sesli, 'Enterprise', FALSE, INTERVAL '-2 months', INTERVAL '10 months'),
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
private.seed_owner (UUID, UUID),
private.seed_clients (UUID),
private.seed_addresses (UUID),
private.seed_stock (UUID),
private.seed_records (UUID);
