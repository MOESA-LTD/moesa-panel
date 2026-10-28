-- Reference data the application needs to run, as opposed to the demo data in seed.sql.
-- Safe to run again: existing rows are kept.

-- Modules, which the permissions below belong to. Core modules come with every plan: the users,
-- roles and branches of a company (how many branches is a limit of the plan).
INSERT INTO
    public.module (id, is_core, position)
VALUES
    ('branch', TRUE, 10),
    ('user', TRUE, 20),
    ('role', TRUE, 30),
    ('client', FALSE, 40),
    ('address', FALSE, 50),
    ('record', FALSE, 60),
    ('product', FALSE, 70),
    ('stock', FALSE, 80),
    ('audit_log', FALSE, 90)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies).
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
    ('public.record', 'record', 'delete', 'modify', FALSE, TRUE, NULL)
    -- audit_log: in 010_init_audit.sql, after its tables.
ON CONFLICT (resource_name, command) DO NOTHING;

-- The built-in owner role (tenant_id NULL: shared by every tenant), with every permission.
INSERT INTO
    public.role (display_name)
SELECT
    'owner'
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            public.role
        WHERE
            display_name = 'owner'
            AND tenant_id IS NULL
    );

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
    public.permission
ON CONFLICT DO NOTHING;

-- Product categories: the stock pages list stock by these names.
INSERT INTO
    public.product_category (display_name, details)
SELECT
    category.display_name,
    category.details
FROM
    (
        VALUES
            ('device', 'Devices to assist hearing impairment'),
            ('service', 'Services to assist hearing impairment'),
            ('spare part', 'Components for hearing aids')
    ) AS category (display_name, details)
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            public.product_category existing
        WHERE
            existing.display_name = category.display_name
    );

INSERT INTO
    public.product_category (display_name, details, parent_id)
SELECT
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
    )
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            public.product_category
        WHERE
            display_name = 'battery'
    );
