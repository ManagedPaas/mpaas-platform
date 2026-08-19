# Phase 1 Security Invariants Review

Review record for MP-48 / P1-040. This is an independent documentation review
of the Phase 1 threat model; it is not an architecture acceptance or a claim
that runtime controls are implemented.

## Review decision

**Gate verdict: PASS — documentation gate only.**

The Phase 1 threat model in the [P1-007 source task](https://app.notion.com/p/3b724dbcfc61819b91b0fe93955ef249)
covers the supported AWS sandbox path, its actors, assets, data classifications, trust boundaries,
P0 abuse cases, security invariants, role owners, detection and recovery
actions, and reproducible verification tickets. Every listed P0 path maps to a
preventive invariant and a backlog test that must block the relevant unsafe
operation when its implementation ticket lands.

This verdict is limited to the completeness and traceability of the written
requirements. No runtime control is claimed as implemented by this review, and
no architecture decision or residual security risk is accepted.

## Scope and evidence

| Acceptance area | Evidence reviewed | Result |
| --- | --- | --- |
| Assets, actors, entry points, sensitive flows, and trust boundaries | `phase-1-threat-model.md`, sections “Actors, assets, and data classifications” and “Trust boundaries and data flows” | Pass |
| Tenant crossover, token theft, webhook replay, prompt injection, manifest tampering, privilege escalation, runner escape, and supply-chain compromise | P0 abuse-case matrix, `ABUSE-01` through `ABUSE-11` | Pass |
| Preventive control, detection/recovery action, owner role, and reproducible verification for each P0 path | Abuse-case matrix and P0 backlog test table | Pass as documented requirements |
| Residual risks and unknowns separated from confirmed requirements | “Residual risk and unknowns” section; explicit out-of-scope boundaries | Pass |

## P0 control-to-verification traceability

The source threat model is the detailed control record. This compact trace
confirms that each abuse case has a blocking invariant and a verification
ticket; the ticket is not evidence that the future control already exists.

| Abuse case | Blocking invariant | Verification ticket |
| --- | --- | --- |
| ABUSE-01 | INV-01, INV-02 | SEC-T01 |
| ABUSE-02 | INV-07 | SEC-T02 |
| ABUSE-03 | INV-09 | SEC-T03 |
| ABUSE-04 | INV-02, INV-03, INV-04 | SEC-T04 |
| ABUSE-05 | INV-03, INV-04, INV-05 | SEC-T05 |
| ABUSE-06 | INV-05, INV-06 | SEC-T06 |
| ABUSE-07 | INV-10 | SEC-T07 |
| ABUSE-08 | INV-02, INV-04, INV-06 | SEC-T08 |
| ABUSE-09 | INV-08, INV-11 | SEC-T09 |
| ABUSE-10 | INV-05, INV-09, INV-11 | SEC-T10 |
| ABUSE-11 | INV-01, INV-04, INV-08 | SEC-T11 |

## Independent challenge

The design challenger recommends **REFINE**, not because the documentation
gate is incomplete, but because implementation work must preserve these
boundaries:

- **Medium / confirmed — control requirements are not runtime evidence.** The
  repository is still a scaffold. Later implementation tickets must prove each
  invariant with executable code, configuration, policy, or reproducible tests;
  this document must not be used as a release or deployment approval.
- **Medium / confirmed — named accountability is still open.** The threat
  model assigns role owners and verification IDs, but named owners and
  deadlines are not yet recorded. Product and engineering owners must assign
  them before the corresponding security ticket is accepted.
- **Informational / confirmed — customer-cloud and BYOC boundaries remain
  unknown.** They are explicitly out of Phase 1 scope and must stay blocked
  rather than being inferred from the AWS sandbox design.

The simplest safe implementation is to keep the threat model as the source of
requirements, add this traceable review record, and require the follow-on
security tickets to provide runtime evidence. No new service, dependency,
credential, cloud policy, or execution path is needed for this task.

## Required follow-on gates

The following security work remains independently gated before the relevant
trust boundary can be accepted: P1-041 (GitHub App), P1-042 (tenant
isolation), P1-043 (AWS identity), P1-044 (runner isolation), P1-045 (prompt
injection and tool authorization), and P1-046 (software supply chain).

Those gates must verify the applicable controls against actual implementation
evidence. A failure, missing invariant, or unaccepted residual risk blocks the
relevant merge or deployment operation.
