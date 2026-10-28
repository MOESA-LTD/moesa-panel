-- Tenants
CREATE TABLE IF NOT EXISTS public.tenant (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   display_name TEXT NOT NULL,
   phone TEXT UNIQUE,
   email TEXT UNIQUE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   parent_id UUID REFERENCES public.tenant (id) ON DELETE CASCADE,
   CONSTRAINT unique_tenant_display_name UNIQUE (id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_display_name ON public.tenant (display_name);

CREATE INDEX IF NOT EXISTS idx_tenant_created_at ON public.tenant (created_at);

-- Users
CREATE TABLE IF NOT EXISTS public.user (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   user_metadata JSONB DEFAULT '{}',
   email TEXT NOT NULL UNIQUE,
   phone TEXT UNIQUE,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_email ON public.user (email);

CREATE INDEX IF NOT EXISTS idx_user_created_at ON public.user (created_at);

-- Tenant Users
CREATE TABLE IF NOT EXISTS public.tenant_user (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   user_id UUID NOT NULL REFERENCES public.user (id) ON DELETE CASCADE,
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_user_id ON public.tenant_user (user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_user_tenant_id ON public.tenant_user (tenant_id);

-- Tenant Owners
CREATE TABLE IF NOT EXISTS public.tenant_owner (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   user_id UUID NOT NULL REFERENCES public.user (id) ON DELETE CASCADE,
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_owner_user_id ON public.tenant_owner (user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_owner_tenant_id ON public.tenant_owner (tenant_id);

-- Modules: the parts of the app that plans are made of. Each permission belongs to one
-- (permission.group_name); core modules come with every plan (see 013_init_subscriptions.sql).
CREATE TABLE IF NOT EXISTS public.module (
   id TEXT PRIMARY KEY CHECK (id ~ '^[a-z_]+$'),
   is_core BOOLEAN NOT NULL DEFAULT FALSE,
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App Permissions
CREATE TABLE IF NOT EXISTS public.permission (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   resource_name valid_permission_resource NOT NULL,
   group_name TEXT DEFAULT NULL REFERENCES public.module (id) ON UPDATE CASCADE,
   command type_permission_command NOT NULL,
   kind type_permission_kind NOT NULL,
   condition TEXT,
   resource_condition TEXT DEFAULT 'TRUE',
   details TEXT,
   error_message TEXT,
   throws_error BOOLEAN DEFAULT FALSE,
   bypass BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   -- One permission per command on a resource (also lets the reference data be re-applied).
   CONSTRAINT unique_permission_resource_command UNIQUE (resource_name, command)
);

CREATE INDEX IF NOT EXISTS idx_permission_resource_name ON public.permission (resource_name);

CREATE INDEX IF NOT EXISTS idx_permission_created_at ON public.permission (created_at);

-- Roles
CREATE TABLE IF NOT EXISTS public.role (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   display_name TEXT NOT NULL,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   tenant_id UUID REFERENCES public.tenant (id) ON DELETE CASCADE,
   CONSTRAINT unique_role_display_name UNIQUE (tenant_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_role_tenant_id ON public.role (tenant_id);

CREATE INDEX IF NOT EXISTS idx_role_created_at ON public.role (created_at);

-- Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permission (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   role_id UUID NOT NULL REFERENCES public.role (id) ON DELETE CASCADE,
   permission_id UUID NOT NULL REFERENCES public.permission (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (permission_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permission_role_id ON public.role_permission (role_id);

CREATE INDEX IF NOT EXISTS idx_role_permission_permission_id ON public.role_permission (permission_id);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_role (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   user_id UUID NOT NULL REFERENCES public.user (id) ON DELETE CASCADE,
   role_id UUID NOT NULL REFERENCES public.role (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON public.user_role (user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON public.user_role (role_id);
