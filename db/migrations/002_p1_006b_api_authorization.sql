-- Up Migration
CREATE FUNCTION app.current_subject()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.subject', true), '');
$$;

ALTER FUNCTION app.current_subject() OWNER TO mpaas_migration_owner;

CREATE POLICY subject_membership_lookup ON app.users
  FOR SELECT TO mpaas_api_runtime
  USING (external_subject = app.current_subject());

CREATE POLICY subject_membership_lookup ON app.memberships
  FOR SELECT TO mpaas_api_runtime
  USING (
    EXISTS (
      SELECT 1
      FROM app.users AS subject_user
      WHERE subject_user.tenant_id = memberships.tenant_id
        AND subject_user.id = memberships.user_id
        AND subject_user.external_subject = app.current_subject()
    )
  );

GRANT EXECUTE ON FUNCTION app.current_subject() TO mpaas_api_runtime;

-- Down Migration
DROP POLICY IF EXISTS subject_membership_lookup ON app.memberships;
DROP POLICY IF EXISTS subject_membership_lookup ON app.users;
DROP FUNCTION IF EXISTS app.current_subject();
