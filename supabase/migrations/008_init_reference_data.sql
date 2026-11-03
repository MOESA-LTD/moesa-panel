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
    ('audit_log', FALSE, 40)
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
    )
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
