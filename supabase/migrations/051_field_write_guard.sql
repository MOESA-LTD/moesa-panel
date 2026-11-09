-- Base-table write guard for field-level permissions (R5, S2, S8).
--
-- private.enable_field_write_guard(table)  Generates private.<table>_field_write_guard() and the
--                          trigger aa_field_write_guard (BEFORE INSERT OR UPDATE, FOR EACH ROW; aa_
--                          sorts it before the table's other triggers). The guard is driven by the
--                          request identity (auth.uid(), the tenant headers), never current_user, so
--                          it also covers SECURITY DEFINER functions owned by postgres. It is the
--                          second line behind the api views.
--                            1. System paths bypass it: private.field_guard_bypassed() (S2).
--                            2. S8: on UPDATE, a row never changes tenant_id.
--                            3. A sensitive, non-generated column is written when, on UPDATE, it
--                               differs from OLD, or, on INSERT, from its default: the default
--                               expression when it is constant (constants and immutable functions
--                               only, evaluated in the guard), else NULL.
--                            4. A written field passes when the row's tenant is one where the user
--                               may write it (private.field_write_tenants). public.user has no
--                               tenant: a user writes their own personal data, or that of users
--                               private.field_user_ids(field, TRUE) returns.
--                          A later migration that adds or reclassifies a sensitive column calls
--                          this again for its table; the column is unguarded until it does.
--
--   field_write_forbidden      (42501) a written field the user may not write; DETAIL names
--                              <table>.<field>, never a value
--   tenant_move_forbidden      (42501) an UPDATE changes tenant_id
--   field_security_unsupported (generator) a table without tenant_id, other than public.user, has
--                              sensitive fields

CREATE OR REPLACE FUNCTION private.enable_field_write_guard (p_table TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    rel REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    fn TEXT := p_table || '_field_write_guard';
    has_tenant BOOLEAN;
    is_user BOOLEAN := p_table = 'user';
    col RECORD;
    allowed TEXT;
    raise_forbidden TEXT;
    on_update TEXT := '';
    on_insert TEXT := '';
    n_fields INT := 0;
BEGIN
    has_tenant := EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = rel AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    );

    IF has_tenant THEN
        on_update := on_update || $s$
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'tenant_move_forbidden' USING ERRCODE = '42501';
        END IF;$s$;
    END IF;

    FOR col IN
        SELECT a.attname::TEXT AS field,
               CASE
                   WHEN d.adbin IS NULL THEN 'NULL'
                   -- Constant: no node that reads state or calls a function that is not immutable.
                   WHEN d.adbin::TEXT !~ '\{(SUBLINK|NEXTVALEXPR|SQLVALUEFUNCTION|COERCEVIAIO|PARAM|VAR|CURRENTOFEXPR) '
                    AND NOT EXISTS (
                        SELECT 1
                        FROM regexp_matches(d.adbin::TEXT, ':(funcid|opfuncid|opno) (\d+)', 'g') AS m
                        JOIN pg_catalog.pg_proc p ON p.oid = CASE m[1]
                            WHEN 'opno' THEN (SELECT o.oprcode::OID FROM pg_catalog.pg_operator o WHERE o.oid = m[2]::OID)
                            ELSE m[2]::OID
                        END
                        WHERE p.provolatile <> 'i'
                    ) THEN '(' || pg_catalog.pg_get_expr(d.adbin, d.adrelid) || ')'
                   ELSE 'NULL'
               END AS default_expr
        FROM public.field_class f
        JOIN pg_catalog.pg_attribute a ON a.attrelid = rel AND a.attname = f.field AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE f.resource_name = resource AND f.class = 'sensitive' AND a.attgenerated = ''
        ORDER BY a.attnum
    LOOP
        n_fields := n_fields + 1;
        IF is_user THEN
            allowed := format('NEW.id = auth.uid() OR NEW.id = ANY (private.field_user_ids(%L, TRUE))', col.field);
        ELSIF has_tenant THEN
            allowed := format('NEW.tenant_id = ANY (private.field_write_tenants(%L, %L))', resource, col.field);
        ELSE
            RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = resource;
        END IF;

        raise_forbidden := format(
            $s$
            IF NOT coalesce(%s, FALSE) THEN
                RAISE EXCEPTION 'field_write_forbidden' USING ERRCODE = '42501', DETAIL = %L;
            END IF;$s$,
            allowed, p_table || '.' || col.field
        );
        on_update := on_update || format(E'\n        IF NEW.%1$I IS DISTINCT FROM OLD.%1$I THEN%2$s\n        END IF;', col.field, raise_forbidden);
        on_insert := on_insert || format(E'\n        IF NEW.%1$I IS DISTINCT FROM %2$s THEN%3$s\n        END IF;', col.field, col.default_expr, raise_forbidden);
    END LOOP;

    EXECUTE format(
        $f$
CREATE OR REPLACE FUNCTION private.%1$I () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $g$
BEGIN
    IF private.field_guard_bypassed() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN%2$s
    ELSE%3$s
        NULL;
    END IF;
    RETURN NEW;
END;
$g$
        $f$,
        fn, on_update, on_insert
    );
    EXECUTE format('ALTER FUNCTION private.%I () OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I () FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format(
        'CREATE OR REPLACE TRIGGER aa_field_write_guard BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION private.%I ()',
        rel, fn
    );
END;
$$;

REVOKE ALL ON FUNCTION private.enable_field_write_guard (TEXT) FROM PUBLIC, anon, authenticated;

-- Every public table with tenant_id or a sensitive field. A partitioned table (audit_log) carries the
-- trigger for its partitions, which are skipped.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relispartition
          AND (
              EXISTS (
                  SELECT 1 FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
              )
              OR EXISTS (
                  SELECT 1 FROM public.field_class f WHERE f.resource_name = 'public.' || c.relname AND f.class = 'sensitive'
              )
          )
        ORDER BY c.relname
    LOOP
        PERFORM private.enable_field_write_guard(t);
    END LOOP;
END;
$$;
