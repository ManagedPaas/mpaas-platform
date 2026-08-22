# P1-006A PostgreSQL foundation

## Decision

Use PostgreSQL 16.15 as the Phase 1 persistence boundary, `pg` for parameterized queries and explicit transactions, and `node-pg-migrate` with SQL-first migrations. Runtime roles are separate from the migration owner and have `NOBYPASSRLS`; tenant context is transaction-local through `set_config('app.tenant_id', value, true)`.

## Boundary and ownership

This ticket owns the schema, role grants, RLS policies, and transaction primitive for the eight Phase 1 tenant tables. It does not own identity-provider integration, principal-to-membership mapping, API routes, SSO/SCIM, cloud resources, or production data. P1-006B consumes this boundary at the API authorization layer.

## Failure modes

- Missing tenant context produces no visible tenant rows and prevents tenant-owned inserts.
- A context for another tenant cannot read or write that tenant’s rows.
- A malformed tenant identifier is rejected before a database transaction begins.
- A failed transaction rolls back and always releases its checked-out client.
- Runtime roles cannot bypass RLS or write through the analytics role.

## Security and observability

All tenant-owned tables enable and force RLS with a policy derived from the local transaction setting. Foreign keys carry `tenant_id` to prevent cross-tenant object references. Audit writes are assigned to a dedicated insert-only role. Migration output and the integration suite provide the initial evidence; application-level audit events and metrics remain follow-on work.

## Validation and rollout

The CI job runs the migration against a pinned PostgreSQL service, then executes live positive, cross-tenant, missing-context, wrong-role, and transaction-reset tests. Rollout is additive through one reversible migration; rollback drops only the foundation objects and is appropriate only before dependent application code is deployed.

## Alternatives rejected

SQLite, static-only migration tests, and application-only tenant filters do not exercise PostgreSQL RLS behavior and therefore cannot satisfy this ticket’s isolation acceptance criteria. API authorization and AWS-native identity remain in the dependent P1-006B ticket.
