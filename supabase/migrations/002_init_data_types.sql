CREATE TYPE type_permission_command AS ENUM('select', 'insert', 'update', 'delete');

CREATE TYPE type_permission_kind AS ENUM('read', 'create', 'modify');

CREATE DOMAIN valid_permission_resource AS TEXT CHECK (VALUE ~ '^[a-zA-Z_]+(\.[a-zA-Z_]+)?$');

CREATE DOMAIN valid_currency_code AS CHAR(3) CHECK (VALUE ~ '^[A-Z]{3}$');
