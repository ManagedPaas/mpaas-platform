-- Up Migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpaas_migration_owner') THEN
    CREATE ROLE mpaas_migration_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpaas_api_runtime') THEN
    CREATE ROLE mpaas_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpaas_worker_runtime') THEN
    CREATE ROLE mpaas_worker_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpaas_audit_writer') THEN
    CREATE ROLE mpaas_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpaas_analytics_reader') THEN
    CREATE ROLE mpaas_analytics_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE mpaas_migration_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS NOLOGIN;
ALTER ROLE mpaas_api_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS NOLOGIN;
ALTER ROLE mpaas_worker_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS NOLOGIN;
ALTER ROLE mpaas_audit_writer NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS NOLOGIN;
ALTER ROLE mpaas_analytics_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS NOLOGIN;

CREATE SCHEMA app AUTHORIZATION mpaas_migration_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO mpaas_api_runtime, mpaas_worker_runtime, mpaas_audit_writer, mpaas_analytics_reader;

CREATE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE TABLE app.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  external_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, external_subject)
);

CREATE TABLE app.memberships (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  membership_role text NOT NULL CHECK (membership_role IN ('owner', 'admin', 'developer', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES app.users(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE app.repository_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, external_id)
);

CREATE TABLE app.manifests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  source_commit text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE app.executions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  manifest_id uuid NOT NULL,
  execution_status text NOT NULL CHECK (execution_status IN ('queued', 'running', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, manifest_id) REFERENCES app.manifests(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE app.deployments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  deployment_status text NOT NULL CHECK (deployment_status IN ('pending', 'deploying', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, execution_id) REFERENCES app.executions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL,
  event_hash text NOT NULL,
  previous_event_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES app.users(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE app.tenants OWNER TO mpaas_migration_owner;
ALTER TABLE app.users OWNER TO mpaas_migration_owner;
ALTER TABLE app.memberships OWNER TO mpaas_migration_owner;
ALTER TABLE app.repository_connections OWNER TO mpaas_migration_owner;
ALTER TABLE app.manifests OWNER TO mpaas_migration_owner;
ALTER TABLE app.executions OWNER TO mpaas_migration_owner;
ALTER TABLE app.deployments OWNER TO mpaas_migration_owner;
ALTER TABLE app.audit_events OWNER TO mpaas_migration_owner;
ALTER FUNCTION app.current_tenant_id() OWNER TO mpaas_migration_owner;

ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.repository_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE app.users FORCE ROW LEVEL SECURITY;
ALTER TABLE app.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.repository_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE app.manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE app.executions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.deployments FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.tenants
  USING (id = app.current_tenant_id())
  WITH CHECK (id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.users
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.memberships
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.repository_connections
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.manifests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.executions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.deployments
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON app.audit_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.tenants, app.users, app.memberships,
  app.repository_connections, app.manifests, app.executions, app.deployments TO mpaas_api_runtime;
GRANT SELECT ON app.audit_events TO mpaas_api_runtime;
GRANT SELECT ON app.manifests, app.executions, app.deployments TO mpaas_worker_runtime;
GRANT INSERT, UPDATE ON app.executions, app.deployments TO mpaas_worker_runtime;
GRANT INSERT ON app.audit_events TO mpaas_audit_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO mpaas_analytics_reader;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO mpaas_api_runtime, mpaas_worker_runtime, mpaas_audit_writer, mpaas_analytics_reader;

-- Down Migration
DROP TABLE IF EXISTS app.audit_events CASCADE;
DROP TABLE IF EXISTS app.deployments CASCADE;
DROP TABLE IF EXISTS app.executions CASCADE;
DROP TABLE IF EXISTS app.manifests CASCADE;
DROP TABLE IF EXISTS app.repository_connections CASCADE;
DROP TABLE IF EXISTS app.memberships CASCADE;
DROP TABLE IF EXISTS app.users CASCADE;
DROP TABLE IF EXISTS app.tenants CASCADE;
DROP FUNCTION IF EXISTS app.current_tenant_id();
DROP SCHEMA IF EXISTS app CASCADE;
DROP ROLE IF EXISTS mpaas_analytics_reader;
DROP ROLE IF EXISTS mpaas_audit_writer;
DROP ROLE IF EXISTS mpaas_worker_runtime;
DROP ROLE IF EXISTS mpaas_api_runtime;
DROP ROLE IF EXISTS mpaas_migration_owner;
