-- enable explain
ALTER ROLE authenticator
SET
    pgrst.db_plan_enabled TO 'true';

-- reload the config
NOTIFY pgrst,
'reload config';

INSERT INTO
    public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
    -- tenant
    ('public.tenant', 'branch', 'select', 'read', FALSE, FALSE, NULL),
    -- ('public.tenant', 'branch', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.tenant', 'branch', 'update', 'modify', FALSE, TRUE, NULL),
    -- ('public.tenant', 'branch', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- user   
    ('public.user', 'user', 'select', 'read', FALSE, FALSE, NULL),
    ('public.user', 'user', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.user', 'user', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.user', 'user', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- tenant_user   
    ('public.tenant_user', 'user', 'select', 'read', TRUE, FALSE, NULL),
    ('public.tenant_user', 'user', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.tenant_user', 'user', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.tenant_user', 'user', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- tenant_owner   
    ('public.tenant_owner', 'branch', 'select', 'read', TRUE, FALSE, NULL),
    -- ('public.tenant_user', NULL, 'insert', 'create', FALSE, TRUE, NULL),
    -- ('public.tenant_user', NULL, 'update', 'modify', FALSE, TRUE, NULL),
    -- ('public.tenant_user', NULL, 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- role   
    ('public.role', 'role', 'select', 'read', FALSE, FALSE, NULL),
    ('public.role', 'role', 'insert', 'create', FALSE, TRUE, 'tenant_id IS NOT NULL'),
    ('public.role', 'role', 'update', 'modify', FALSE, TRUE, 'tenant_id IS NOT NULL'),
    ('public.role', 'role', 'delete', 'modify', FALSE, TRUE, 'tenant_id IS NOT NULL'),
    --
    --
    -- user_role 
    ('public.user_role', 'role', 'select', 'read', TRUE, FALSE, NULL),
    (
        'public.user_role',
        'role',
        'insert',
        'create',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    (
        'public.user_role',
        'role',
        'update',
        'modify',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    (
        'public.user_role',
        'role',
        'delete',
        'modify',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    --
    --
    -- role_permission   
    ('public.role_permission', 'role', 'select', 'read', TRUE, FALSE, NULL),
    (
        'public.role_permission',
        'role',
        'insert',
        'create',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    (
        'public.role_permission',
        'role',
        'update',
        'modify',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    (
        'public.role_permission',
        'role',
        'delete',
        'modify',
        FALSE,
        TRUE,
        'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id AND r.tenant_id IS NOT NULL)'
    ),
    --
    --
    -- product_category
    ('public.product_category', 'product', 'select', 'read', TRUE, FALSE, NULL),
    -- ('public.product_category', 'product', 'insert', 'create', FALSE, TRUE, NULL),
    -- ('public.product_category', 'product', 'update', 'modify', FALSE, TRUE, NULL),
    -- ('public.product_category', 'product', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- product
    ('public.product', 'product', 'select', 'read', TRUE, FALSE, NULL),
    ('public.product', 'product', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.product', 'product', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.product', 'product', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- product_categories
    ('public.product_categories', 'product', 'select', 'read', TRUE, FALSE, NULL),
    ('public.product_categories', 'product', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.product_categories', 'product', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.product_categories', 'product', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- stock
    ('public.stock', 'stock', 'select', 'read', FALSE, FALSE, NULL),
    ('public.stock', 'stock', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.stock', 'stock', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.stock', 'stock', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- client
    ('public.client', 'client', 'select', 'read', FALSE, FALSE, NULL),
    ('public.client', 'client', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.client', 'client', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.client', 'client', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- address
    ('public.address', 'address', 'select', 'read', FALSE, FALSE, NULL),
    ('public.address', 'address', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.address', 'address', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.address', 'address', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- client_address
    ('public.client_address', 'client', 'select', 'read', FALSE, FALSE, NULL),
    ('public.client_address', 'client', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.client_address', 'client', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.client_address', 'client', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- record
    ('public.record', 'record', 'select', 'read', FALSE, FALSE, NULL),
    ('public.record', 'record', 'insert', 'create', FALSE, TRUE, NULL),
    ('public.record', 'record', 'update', 'modify', FALSE, TRUE, NULL),
    ('public.record', 'record', 'delete', 'modify', FALSE, TRUE, NULL),
    --
    --
    -- audit_log
    ('public.audit_log', 'audit_log', 'select', 'read', FALSE, FALSE, 'tenant_id IS NOT NULL');

INSERT INTO
    private.audit_config (table_name, audit_enabled)
VALUES
    ('public.tenant', TRUE),
    ('public.tenant_user', TRUE),
    ('public.user', TRUE),
    ('public.user_role', TRUE),
    ('public.role', TRUE),
    ('public.role_permission', TRUE),
    ('public.product', TRUE),
    ('public.product_categories', TRUE),
    ('public.stock', TRUE),
    ('public.client', TRUE),
    ('public.address', TRUE),
    ('public.client_address', TRUE),
    ('public.record', TRUE);

INSERT INTO
    public.role (display_name)
VALUES
    ('owner');

INSERT INTO
    public.role_permission (role_id, permission_id)
SELECT
    (
        SELECT
            id
        FROM
            public.role
        WHERE
            display_name = 'owner'
            AND tenant_id IS NULL
    ),
    id
FROM
    public.permission;

-- Insert Categories with parent-child relationships
INSERT INTO
    public.product_category (display_name, details, parent_id, created_at)
VALUES
    ('device', 'Devices to assist hearing impairment', NULL, NOW() - (random() * INTERVAL '1 years')),
    ('service', 'Services to assist hearing impairment', NULL, NOW() - (random() * INTERVAL '1 years')),
    ('spare part', 'Components for hearing aids', NULL, NOW() - (random() * INTERVAL '1 years'));

INSERT INTO
    public.product_category (display_name, details, parent_id, created_at)
VALUES
    (
        'battery',
        'Device batteries',
        (
            SELECT
                id
            FROM
                public.product_category
            WHERE
                display_name = 'spare part'
            LIMIT
                1
        ),
        NOW() - (random() * INTERVAL '1 years')
    );

-- Generate Random Products and Assign Categories
DO $$  
DECLARE 
    prod_count INT := 30; -- Generate 30 product
    cat_ids UUID[]; -- Store category IDs
BEGIN 
    -- Fetch category IDs in order of display_name to maintain correct assignment
    SELECT array_agg(id ORDER BY display_name) INTO cat_ids FROM public.product_category;

    -- Generate product data
    WITH product_data AS (
        SELECT 
            i AS row_num, -- Explicit row number for ordering
            CASE 
                WHEN i <= prod_count * 0.50 THEN cat_ids[2]  -- Device
                WHEN i <= prod_count * 0.60  THEN cat_ids[3]  -- Service
                WHEN i <= prod_count * 0.75  THEN cat_ids[4]  -- Spare Parts
                WHEN i <= prod_count * 1 THEN cat_ids[1]  -- Battery
            END AS assigned_category_id,  
            CASE 
                WHEN i <= prod_count * 0.50 THEN 'Device ' || i
                WHEN i <= prod_count * 0.60 THEN 'Service ' || i
                WHEN i <= prod_count * 0.75 THEN 'Spare Part ' || i
                WHEN i <= prod_count * 1 THEN 'Battery ' || i
            END AS product_name,
            'Brand' || floor(random() * 10 + 1)::int AS brand_name,
            NOW() - (random() * interval '1 years') AS created_at
        FROM generate_series(1, prod_count) i
    ),
    inserted_product AS (
        INSERT INTO public.product (display_name, brand, details, created_at)
        SELECT product_name, brand_name, 'details for ' || product_name, created_at
        FROM product_data
        RETURNING id -- Return only product ID
    )
    -- Assign row numbers after insertion
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT p.id, d.assigned_category_id 
    FROM (SELECT id, ROW_NUMBER() OVER () AS row_num FROM inserted_product) p
    JOIN product_data d ON p.row_num = d.row_num; -- Correctly map inserted product to its category
END $$;

-- Seed clients
CREATE OR REPLACE FUNCTION private.tenant_seed_client (target_tenant_id UUID) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    INSERT INTO public.client (national_id, display_name, birth_date, gender, email, phone, nationality, tenant_id, created_at)
    VALUES 
        (gen_random_uuid(), 'John Doe', '1990-01-01', 'male', 'john.doe'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'United States', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Jane Smith', '1985-06-15', 'female', 'jane.smith'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'United Kingdom', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Robert Johnson', '1992-12-20', 'male', 'robert.johnson'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Australia', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Emily Davis', '1988-09-10', 'female', 'emily.davis'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Canada', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Michael Brown', '1995-03-25', 'male', 'michael.brown'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Germany', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Sarah Wilson', '1984-11-30', 'female', 'sarah.wilson'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Japan', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Olivia Brown', '1993-05-24', 'male', 'olivia.brown'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'United Kingdom', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'William Miller', '1997-07-22', 'male', 'william.miller'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'France', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Jessica Taylor', '1987-04-17', 'female', 'jessica.taylor'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Italy', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'David Anderson', '1993-10-14', 'male', 'david.anderson'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Spain', target_tenant_id, NOW() - (random() * interval '1 years')),
        (gen_random_uuid(), 'Sophia Martinez', '1989-06-21', 'female', 'sophia.martinez'||random()::TEXT||'@example.com', (SELECT '+'|| RPAD(CAST(ROUND(RANDOM() * 9999999999) AS TEXT), 12, '0')), 'Mexico', target_tenant_id, NOW() - (random() * interval '1 years'));
END; 
$$;

-- Seed Address
CREATE OR REPLACE FUNCTION private.tenant_seed_address (target_tenant_id UUID) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
-- Seed data for 'address' table
INSERT INTO
    public.address (display_name, country, city, district, details, tenant_id)
VALUES
    ('123 Main St.', 'United States', 'New York', 'Manhattan', '123 Main St.', target_tenant_id),
    ('456 London Rd.', 'United Kingdom', 'London', 'Camden', '456 London Rd.', target_tenant_id),
    ('789 Sydney St.', 'Australia', 'Sydney', 'Harbour Bridge', '789 Sydney St.', target_tenant_id),
    ('101 Toronto Rd.', 'Canada', 'Toronto', 'Downtown', '101 Toronto Rd.', target_tenant_id),
    ('121 Berlin St.', 'Germany', 'Berlin', 'Mitte', '121 Berlin St.', target_tenant_id),
    ('161 Seoul St.', 'South Korea', 'Seoul', 'Daegu', '161 Seoul St.', target_tenant_id),
    ('111 Paris St.', 'France', 'Paris', 'Champs-Élysées', '111 Paris St.', target_tenant_id),
    ('131 Rio de Janeiro Rd.', 'Brazil', 'Rio de Janeiro', 'Centro', '131 Rio de Janeiro Rd.', target_tenant_id),
    ('151 Mumbai St.', 'India', 'Mumbai', 'Bandra', '151 Mumbai St.', target_tenant_id),
    ('171 Beijing St.', 'China', 'Beijing', 'Haidian', '171 Beijing St.', target_tenant_id),
    ('141 Tokyo St.', 'Japan', 'Tokyo', 'Shinjuku', '141 Tokyo St.', target_tenant_id),
    ('161 Mexico City St.', 'Mexico', 'Mexico City', 'Centro Historico', '161 Mexico City St.', target_tenant_id),
    ('131 Sydney Rd.', 'Australia', 'Sydney', 'CBD', '131 Sydney Rd.', target_tenant_id),
    ('151 Cape Town St.', 'South Africa', 'Cape Town', 'Ville de Cape Town', '151 Cape Town St.', target_tenant_id),
    ('171 Istanbul St.', 'Turkey', 'Istanbul', 'Tophane', '171 Istanbul St.', target_tenant_id),
    ('161 Paris St.', 'France', 'Paris', 'Champs-Elysees', '161 Paris St.', target_tenant_id),
    ('141 Amsterdam St.', 'Netherlands', 'Amsterdam', 'Centrum', '141 Amsterdam St.', target_tenant_id),
    ('181 Rome St.', 'Italy', 'Rome', 'Piazza Navona', '181 Rome St.', target_tenant_id),
    ('201 Madrid St.', 'Spain', 'Madrid', 'Plaza Mayor', '201 Madrid St.', target_tenant_id),
    ('121 Lisbon St.', 'Portugal', 'Lisbon', 'Bairro Alto', '121 Lisbon St.', target_tenant_id),
    ('221 Mexico City St.', 'Mexico', 'Mexico City', 'Puebla', '221 Mexico City St.', target_tenant_id);
END; 
$$;

-- Seed Client Address
CREATE OR REPLACE FUNCTION private.tenant_seed_client_address (target_tenant_id UUID) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN
    WITH client_ids AS (SELECT id FROM public.client WHERE tenant_id = target_tenant_id),
        address_ids AS (SELECT id FROM public.address WHERE tenant_id = target_tenant_id)
    INSERT INTO public.client_address (client_id, address_id)
    SELECT c.id, a.id
    FROM client_ids c, address_ids a
    WHERE random() < 0.2;
END; 
$$;

-- Seed stock
CREATE OR REPLACE FUNCTION private.tenant_seed_stock (target_tenant_id UUID) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$BEGIN
    INSERT INTO public.stock (
        tenant_id, product_id, quantity, unit_cost, unit_discount, unit_tax, currency_code, vendor, serial_number, barcode, details, stocked_at, unit_type
    )  
    SELECT  
        target_tenant_id,  
        p.id,  
        FLOOR(random() * 100 + 10)::INTEGER,  -- Random quantity between 1 and 100  
        ROUND((random() * (500 - 10) + 200)::NUMERIC, 2),  -- Random unit_cost between 200.00 and 500.00  
        ROUND((random() * (90 - 10) + 10)::NUMERIC, 2),  -- Random unit_discount between 10.00 and 90.00  
        ROUND((random() * (90 - 10) + 10)::NUMERIC, 2),  -- Random unit_tax between 10.00 and 90.00  
        'TRY',  
        'EROTIC SHOP ' || lpad(floor(random() * 20)::text, 2, '0'),  
        'SN-' || gen_random_uuid(),  -- Unique serial number  
        'B-' || gen_random_uuid(),  -- Unique barcode per tenant and product  
        'Details for tenant product',  
        NOW() - (random() * interval '1 years')  -- Random timestamp within the last 1 years  
    , CASE FLOOR(random() * 8 + 1)
        WHEN 1 THEN 'pcs'
        WHEN 2 THEN 'kg'
        WHEN 3 THEN 'gr'
        WHEN 4 THEN 'lbs'
        WHEN 5 THEN 'L'
        WHEN 6 THEN 'mL'
        WHEN 7 THEN 'm'
        ELSE 'cm'
      END::public.type_stock_unit_type AS unit_type
    FROM public.product p  
    CROSS JOIN generate_series(1, 50) g;  
END;$$;

-- Seed record
CREATE OR REPLACE FUNCTION private.tenant_seed_record (target_tenant_id UUID) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$
DECLARE
    stock_rec RECORD;
BEGIN

    FOR stock_rec IN 
        SELECT  
            s.id,
            CASE 
                WHEN random() < 0.5 THEN 'sale'::public.valid_record_type 
                ELSE (ARRAY['trial', 'assemble', 'repair', 'promotion'])[floor(random()*4+1)]::public.valid_record_type
            END AS record_type,
            (ARRAY['done', 'pending'])[floor(random()*2+1)]::TEXT AS record_status,
            ROUND((LEAST(random() * (s.available_quantity - 1) + 1, s.available_quantity))::NUMERIC, 2) AS quantity,
            'credit_card'::TEXT AS payment_type,
            'TRY'::TEXT AS currency_code,
            ROUND((random() * (500 - 10) + 200)::NUMERIC, 2) AS bid,
            ROUND((random() * (90 - 10) + 10)::NUMERIC, 2) AS bid_discount,
            ROUND((random() * (90 - 10) + 10)::NUMERIC, 2) AS tax,
            c.id AS client_id,
            'Details for tenant record'::TEXT AS details,  
            NOW() - (random() * interval '1 years') AS created_at
        FROM public.stock_view s 
        JOIN public.product p ON s.product_id = p.id
        INNER JOIN public.client c ON c.tenant_id = target_tenant_id AND random() < 0.75
        WHERE s.tenant_id = target_tenant_id
        AND s.available_quantity > 0
    LOOP

        -- Check if the quantity is less than or equal to available quantity
        IF stock_rec.quantity <= (SELECT available_quantity FROM public.stock_view WHERE id = stock_rec.id) THEN
            INSERT INTO public.record (
                tenant_id, stock_id, record_type, record_status, quantity, payment_type, currency_code, bid, bid_discount, tax, client_id, details, created_at
            )  
            VALUES 
            (
                target_tenant_id,
                stock_rec.id,
                stock_rec.record_type,
                stock_rec.record_status,
                stock_rec.quantity,
                stock_rec.payment_type,
                stock_rec.currency_code,
                stock_rec.bid,
                stock_rec.bid_discount,
                stock_rec.tax,
                stock_rec.client_id,
                stock_rec.details,
                stock_rec.created_at
            );
        END IF;
    END LOOP;

END;$$;

CREATE OR REPLACE FUNCTION private.tenant_seed () RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql
SET
    search_path = '' AS $$
BEGIN 

PERFORM private.tenant_seed_client(NEW.id);

PERFORM private.tenant_seed_address(NEW.id);

PERFORM private.tenant_seed_client_address(NEW.id);

PERFORM private.tenant_seed_stock(NEW.id);

PERFORM private.tenant_seed_record(NEW.id);

RETURN NEW;

END;
$$;

CREATE TRIGGER trg_seed_tenant
AFTER INSERT ON public.tenant FOR EACH ROW
EXECUTE FUNCTION private.tenant_seed ();

INSERT INTO
    public.tenant (display_name)
VALUES
    -- ('bade-gop'),
    -- ('bade-gop-sarigol'),
    ('bade-avcilar');