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

-- Addresses
CREATE TABLE IF NOT EXISTS public.address (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   display_name TEXT NOT NULL,
   country TEXT NOT NULL,
   city TEXT NOT NULL,
   district TEXT NOT NULL,
   details TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_address_tenant_id ON public.address (tenant_id);

CREATE INDEX IF NOT EXISTS idx_address_display_name ON public.address (display_name);

CREATE INDEX IF NOT EXISTS idx_address_created_at ON public.address (created_at);

-- App Permissions
CREATE TABLE IF NOT EXISTS public.permission (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   resource_name valid_permission_resource NOT NULL,
   group_name TEXT DEFAULT NULL,
   command type_permission_command NOT NULL,
   kind type_permission_kind NOT NULL,
   condition TEXT,
   resource_condition TEXT DEFAULT 'TRUE',
   details TEXT,
   error_message TEXT,
   throws_error BOOLEAN DEFAULT FALSE,
   bypass BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMPTZ DEFAULT NOW()
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

-- Clients Table
CREATE TABLE IF NOT EXISTS public.client (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   national_id TEXT UNIQUE NOT NULL, -- client's national national_id number
   display_name TEXT NOT NULL,
   birth_date DATE NOT NULL,
   gender TEXT CHECK (gender IN ('male', 'female')),
   email TEXT UNIQUE,
   phone TEXT UNIQUE,
   nationality TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_id_tenant ON client (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_client_national_id ON public.client (national_id);

CREATE INDEX IF NOT EXISTS idx_client_tenant_id ON public.client (tenant_id);

CREATE INDEX IF NOT EXISTS idx_client_created_at ON public.client (created_at);

CREATE INDEX IF NOT EXISTS idx_client_display_name ON public.client (display_name);

-- Products Table
CREATE TABLE IF NOT EXISTS public.product (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID REFERENCES public.tenant (id) ON DELETE CASCADE,
   display_name TEXT UNIQUE NOT NULL,
   brand TEXT,
   details TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   CONSTRAINT unique_product_display_name UNIQUE (tenant_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_product_id_tenant ON product (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_display_name ON public.product (display_name);

CREATE INDEX IF NOT EXISTS idx_product_display_name_composite ON public.product (display_name, id);

CREATE INDEX IF NOT EXISTS idx_product_created_at ON public.product (created_at);

CREATE OR REPLACE VIEW public.product_brands
WITH
   (security_invoker = TRUE) AS
SELECT DISTINCT
   brand AS display_name
FROM
   public.product;

-- Product Categories Table
CREATE TABLE IF NOT EXISTS public.product_category (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   display_name TEXT NOT NULL,
   details TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   parent_id UUID REFERENCES public.product_category (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_category_display_name ON public.product_category (display_name);

CREATE INDEX IF NOT EXISTS idx_product_category_created_at ON public.product_category (created_at);

-- Product Category Table (relationship)
CREATE TABLE IF NOT EXISTS public.product_categories (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   product_id UUID NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
   category_id UUID NOT NULL REFERENCES public.product_category (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product_id ON public.product_categories (product_id);

CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON public.product_categories (category_id);

-- Tenant Stocks Table
CREATE TABLE IF NOT EXISTS public.stock (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   product_id UUID NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
   serial_number TEXT UNIQUE,
   barcode TEXT,
   quantity valid_stock_quantity,
   unit_type type_stock_unit_type NOT NULL DEFAULT 'pcs',
   unit_cost valid_stock_unit_cost DEFAULT 0,
   unit_discount NUMERIC(10, 2) NOT NULL CHECK (
      unit_discount >= 0
      AND unit_discount <= unit_cost
   ) DEFAULT 0,
   unit_tax NUMERIC(10, 2) NOT NULL DEFAULT 0,
   currency_code valid_currency_code NOT NULL DEFAULT 'TRY',
   vendor TEXT,
   details TEXT,
   attributes JSONB DEFAULT '{}',
   stocked_at TIMESTAMPTZ DEFAULT NOW(),
   created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_stock_id_tenant ON stock (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_stock_tenant_id ON public.stock (tenant_id);

CREATE INDEX IF NOT EXISTS idx_stock_product_id ON public.stock (product_id);

CREATE INDEX IF NOT EXISTS idx_stock_serial_number ON public.stock (serial_number);

CREATE INDEX IF NOT EXISTS idx_stock_barcode ON public.stock (barcode);

CREATE INDEX IF NOT EXISTS idx_stock_created_at ON public.stock (created_at);

CREATE INDEX IF NOT EXISTS idx_stock_stocked_at ON public.stock (stocked_at);

CREATE INDEX IF NOT EXISTS idx_stock_display_name ON public.stock (tenant_id, product_id);

-- Record Table
CREATE TABLE IF NOT EXISTS public.record (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   client_id UUID REFERENCES public.client (id) ON DELETE CASCADE,
   stock_id UUID REFERENCES public.stock (id) ON DELETE CASCADE,
   user_id UUID REFERENCES public.user (id) ON DELETE SET NULL,
   record_type valid_record_type NOT NULL,
   record_status TEXT NOT NULL CHECK (
      CASE
         WHEN record_type = 'repair' THEN record_status IN (
            'pending',
            'pending_service',
            'client_holds_service_bid',
            'client_approved_service_bid',
            'client_rejected_service_bid',
            'done'
         )
         ELSE record_status IN ('pending', 'approved', 'rejected', 'pending_client', 'done')
      END
   ),
   quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (
      CASE
         WHEN record_type IN ('sale', 'promotion') THEN quantity > 0
         ELSE quantity >= 0
      END
   ),
   payment_type valid_record_payment_type,
   currency_code valid_currency_code DEFAULT 'TRY',
   bid NUMERIC(10, 2) DEFAULT 0.00,
   bid_discount NUMERIC(10, 2) DEFAULT 0.00,
   tax NUMERIC(10, 2) DEFAULT 0.00,
   attributes JSONB DEFAULT '{}',
   details TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_tenant_id ON public.record (tenant_id);

CREATE INDEX IF NOT EXISTS idx_record_client_id ON public.record (client_id);

CREATE INDEX IF NOT EXISTS idx_record_stock_id ON public.record (stock_id);

CREATE INDEX IF NOT EXISTS idx_record_user_id ON public.record (user_id);

CREATE INDEX IF NOT EXISTS idx_record_tenant_client_id ON public.record (tenant_id, client_id);

CREATE INDEX IF NOT EXISTS idx_record_tenant_stock_id ON public.record (tenant_id, stock_id);

CREATE INDEX IF NOT EXISTS idx_record_quantity ON public.record (quantity);

CREATE INDEX IF NOT EXISTS idx_record_bid ON public.record (bid);

CREATE INDEX IF NOT EXISTS idx_record_status ON public.record (record_status);

CREATE INDEX IF NOT EXISTS idx_record_created ON public.record (created_at);

CREATE OR REPLACE VIEW public.stock_view
WITH
   (security_invoker = TRUE) AS
SELECT
   s.*,
   p.display_name,
   p.brand,
   COALESCE(s.quantity - used.total_used, s.quantity) AS available_quantity,
   (s.unit_cost * s.quantity)::NUMERIC(10, 2) AS total_cost
FROM
   public.stock AS s
   JOIN public.product AS p ON s.product_id = p.id
   LEFT JOIN (
      SELECT
         tenant_id,
         stock_id,
         SUM(quantity) AS total_used
      FROM
         public.record
      WHERE
         record_status IN ('approved', 'pending', 'pending_client', 'done')
         AND record_type IN ('promotion', 'sale')
      GROUP BY
         tenant_id,
         stock_id
   ) AS used ON s.tenant_id = used.tenant_id
   AND s.id = used.stock_id;

CREATE OR REPLACE VIEW public.stock_vendor
WITH
   (security_invoker = TRUE) AS
SELECT DISTINCT
   vendor AS display_name
FROM
   public.stock_view;

CREATE OR REPLACE VIEW public.stock_vendor_stat
WITH
   (security_invoker = TRUE) AS
SELECT
   vendor,
   p.id AS product_id,
   COUNT(*) AS total_product,
   SUM(quantity) AS total_quantity,
   SUM(unit_cost) AS total_cost,
   ROUND(AVG(unit_cost)::NUMERIC(10, 2), 2) AS average_cost,
   ROUND(AVG(total_cost)::NUMERIC(10, 2), 2) AS average_total_cost
FROM
   public.product AS p
   JOIN public.stock_view AS s ON s.product_id = p.id
GROUP BY
   vendor,
   p.id;

CREATE OR REPLACE VIEW public.stock_product_stat
WITH
   (security_invoker = TRUE) AS
SELECT
   p.display_name,
   p.brand,
   SUM(s.quantity) AS total_quantity,
   SUM(s.unit_cost) AS total_cost,
   ROUND(AVG(total_cost)::NUMERIC(10, 2), 2) AS average_total_cost
FROM
   public.product AS p
   JOIN public.stock_view AS s ON s.product_id = p.id
GROUP BY
   p.display_name,
   p.brand;

-- Clients Addresses(address table relationship)
CREATE TABLE IF NOT EXISTS public.client_address (
   id UUID UNIQUE DEFAULT gen_random_uuid(),
   client_id UUID NOT NULL REFERENCES public.client (id) ON DELETE CASCADE,
   address_id UUID NOT NULL REFERENCES public.address (id) ON DELETE CASCADE,
   PRIMARY KEY (client_id, address_id),
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_address_client_id ON public.client_address (client_id);

CREATE INDEX IF NOT EXISTS idx_client_address_address_id ON public.client_address (address_id);

CREATE OR REPLACE VIEW public.client_address_view
WITH
   (security_invoker = TRUE) AS
SELECT
   gen_random_uuid() AS id,
   -- Generate a unique ID for the view (optional)
   -- Address fields with prefix
   a.id AS address_id,
   a.display_name AS address_display_name,
   a.country AS address_country,
   a.city AS address_city,
   a.district AS address_district,
   a.details AS address_details,
   a.created_at AS address_created_at,
   a.tenant_id AS address_tenant_id,
   -- Client fields with prefix
   c.id AS client_id,
   c.display_name AS client_display_name,
   c.national_id AS client_national_id,
   c.email AS client_email,
   c.phone AS client_phone,
   c.nationality AS client_nationality,
   c.tenant_id AS client_tenant_id,
   c.created_at AS client_created_at
FROM
   public.client AS c
   JOIN public.client_address AS ca ON c.id = ca.client_id
   JOIN public.address AS a ON a.id = ca.address_id;

-- Configuration table to track which tables have auditing enabled
CREATE TABLE IF NOT EXISTS private.audit_config (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   table_name TEXT NOT NULL UNIQUE,
   audit_enabled BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Main audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   user_id UUID REFERENCES public.user (id) ON DELETE SET NULL,
   reverted_by UUID REFERENCES public.user (id) ON DELETE SET NULL,
   tenant_id UUID REFERENCES public.tenant (id) ON DELETE CASCADE,
   correlation_id TEXT,
   request_id UUID,
   table_schema TEXT NOT NULL,
   table_name TEXT NOT NULL,
   operation TEXT NOT NULL,
   row_data JSONB DEFAULT '{}',
   old_data JSONB DEFAULT '{}',
   created_at TIMESTAMPTZ DEFAULT NOW(),
   reverted BOOLEAN DEFAULT FALSE,
   reverted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON public.audit_log (tenant_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_correlation_id ON public.audit_log (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON public.audit_log (operation);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_row_created ON public.audit_log ((row_data ->> 'created_at'))
WHERE
   row_data IS NOT NULL
   AND row_data ->> 'created_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_old_created ON public.audit_log ((old_data ->> 'created_at'))
WHERE
   old_data IS NOT NULL
   AND old_data ->> 'created_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_row_created ON public.audit_log ((row_data ->> 'id'))
WHERE
   row_data IS NOT NULL
   AND row_data ->> 'id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_old_created ON public.audit_log ((old_data ->> 'id'))
WHERE
   old_data IS NOT NULL
   AND old_data ->> 'id' IS NOT NULL;

-- Create or replace the view public.audit_log_group
CREATE OR REPLACE VIEW public.audit_log_group
WITH
   (security_invoker = TRUE) AS
SELECT DISTINCT
   ON (correlation_id) id,
   user_id,
   reverted_by,
   tenant_id,
   al.correlation_id,
   al.request_id,
   CASE
      WHEN EXISTS (
         SELECT
            1
         FROM
            public.audit_log al2
         WHERE
            al2.correlation_id = al.correlation_id
            AND al2.operation = 'INSERT'
      )
      AND EXISTS (
         SELECT
            1
         FROM
            public.audit_log al3
         WHERE
            al3.correlation_id = al.correlation_id
            AND al3.operation = 'DELETE'
      ) THEN 'UPDATE' -- Mark as UPDATE if both INSERT and DELETE operations exist
      ELSE operation -- Otherwise, retain the original operation type
   END AS operation,
   table_schema,
   table_name,
   old_data,
   row_data,
   created_at,
   reverted,
   reverted_at
FROM
   public.audit_log al
   -- Order by correlation_id, then by the timestamp of the row data (or current time if not available), and finally by operation type in descending order
ORDER BY
   al.correlation_id,
   COALESCE(
      NULLIF(al.row_data ->> 'created_at', '')::TIMESTAMPTZ,
      NULLIF(al.old_data ->> 'created_at', '')::TIMESTAMPTZ,
      now()::TIMESTAMPTZ
   ) ASC,
   al.operation,
   CASE
      WHEN al.operation = 'DELETE' THEN 0 -- Ensure DELETE operations appear before non-DELETE operations
      ELSE 1
   END;