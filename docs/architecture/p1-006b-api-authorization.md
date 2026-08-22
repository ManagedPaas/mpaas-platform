# P1-006B API authorization boundary

## Decision

The API accepts an already verified opaque principal subject and a requested
tenant resource identifier. It establishes `app.subject` transaction-locally,
resolves a membership for that exact tenant, and only then establishes
`app.tenant_id` transaction-locally. Repository methods receive no tenant id;
they operate inside the authorized transaction context.

The API module imports the persistence boundary and repository interfaces. It
does not import `pg`, issue SQL, or expose a database client.

## Scope and contracts

- `AuthenticatedPrincipal.subject` is an opaque, non-empty string of at most
  512 characters.
- The upstream authentication layer must verify the provider token and map its
  stable subject claim to this value before calling the API boundary.
- The requested tenant id is a resource target, not an authorization claim.
  Membership lookup must succeed before the tenant context is set.
- Missing, malformed, or non-member principals fail closed with
  `TENANT_ACCESS_DENIED`.
- `app.subject` and `app.tenant_id` are transaction-local and are never set by
  interpolated SQL.

## Security and failure modes

The 006B policies allow the API role to look up only membership rows associated
with the transaction-local subject. They add no tenant identifier to the
principal and do not weaken the existing tenant RLS policies. If membership
lookup fails, the transaction rolls back and no repository method runs. A
failed rollback marks the connection for discard through the existing
transaction helper.

This change does not implement AWS token verification, an identity provider,
SSO, or claim discovery. Those remain an integration contract and must be
verified before production wiring. This implementation does not accept a
caller-supplied `tenant_id` as proof of access.

## Observability, rollout, and rollback

Authorization failures should be counted by the API caller using the stable
error code without logging subject values or raw tokens. Migration 002 is
forward-only for the API boundary and can be rolled back by dropping its two
policies and `current_subject()` before any API code depends on them.

## Verification

Static tests prove the API boundary contains no direct table access. Live
PostgreSQL tests prove positive membership access, cross-tenant read and
mutation denial, unknown-subject denial, and transaction-scoped repository
behavior against the 006A foundation plus migration 002.

## Alternatives considered

- Setting `app.tenant_id` from a request path was rejected because it would
  turn a caller-controlled resource id into authorization.
- A security-definer membership lookup was rejected because it would add
  privileged execution semantics to the RLS path.
- Adding an HTTP framework was deferred because the repository has no API
  transport contract yet; this ticket implements the reusable API boundary.

## Unresolved assumption

The exact AWS-native provider and claim mapping are still external to this
repository. The required input is a verified stable subject string; provider
verification and mapping must be supplied by the authentication integration
before release.
