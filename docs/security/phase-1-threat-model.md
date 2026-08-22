# Phase 1 Threat Model and Abuse-Case Test Plan

Artifact status: design requirements and planned verification. This change does
not claim that the runtime controls below are implemented.

## Purpose and scope

This artifact defines the security boundary for the supported Phase 1 path:

1. A developer installs the GitHub App and selects a repository.
2. The control plane reads repository metadata and content for framework detection.
3. A planner produces a versioned intent manifest.
4. Schema validation, deterministic policy evaluation, cost estimation, and a
   dry run produce a reviewable plan.
5. A developer explicitly approves or rejects the plan.
6. A signed manifest enters the durable workflow.
7. Typed, idempotent tools invoke an isolated runner for the AWS sandbox.
8. Postconditions, audit events, and telemetry record the result.

The supported Phase 1 data plane is AWS sandbox deployment with ECR, ECS
Fargate, ALB, Route 53/ACM, and CloudWatch. PostgreSQL stores tenant and
workflow state; encrypted object storage stores artifacts and audit exports;
KMS and Secrets Manager protect key material and short-lived credentials.

Out of scope: production or customer-cloud writes, BYOC runners, multi-cloud,
EKS/Kubernetes, arbitrary frameworks or Terraform, autonomous incident
remediation, formal penetration testing, compliance certification, and
cross-tenant model training.

## Actors, assets, and data classifications

| Actor | Capability | Trust posture |
| --- | --- | --- |
| Design-partner developer | Selects a repository and approves or rejects a plan | Authenticated human; approval is the authority for the scoped plan only |
| GitHub App | Reads selected repository metadata/content and receives webhooks | External integration; installation and webhook payloads are untrusted |
| Planner/model | Produces a candidate explanation and intent manifest | Untrusted output; it cannot authorize tools |
| Control-plane API | Authenticates requests, validates inputs, evaluates policy, and records state | Trusted enforcement boundary |
| Temporal worker | Advances durable, retry-limited workflow state | Trusted orchestrator; must not broaden approval scope |
| MCP/tool registry | Exposes typed, allowlisted, idempotent operations | Trusted capability boundary |
| Isolated runner | Performs the approved sandbox operation | Constrained execution boundary; assumed compromiseable |
| AWS sandbox | Receives scoped infrastructure mutations | External data plane; access is short-lived and task-scoped |
| Security Architect and human CODEOWNER | Reviews gates, residual risk, and release decisions | Independent human oversight |

| Asset | Classification | Required protection |
| --- | --- | --- |
| Repository content and model context | Customer-sensitive | Treat as untrusted input; prevent secret propagation and tool authorization |
| Tenant, membership, and repository metadata | Confidential | Application authorization plus PostgreSQL RLS |
| Intent manifests, policy results, approvals, and plan diffs | Integrity-critical | Schema validation, provenance, signing, commit binding, immutable history |
| Short-lived AWS credentials and signing keys | Secret | Task scope, least privilege, bounded lifetime, no source/log/prompt storage |
| Infrastructure artifacts and deployment outputs | Confidential/integrity-critical | Encryption, tenant binding, access checks, audit trail |
| Audit events and telemetry | Sensitive operational data | Append-only semantics, redaction, access control, retention and deletion controls |

## Trust boundaries and data flows

| Boundary | Flow and threat | Required boundary rule |
| --- | --- | --- |
| TB-01 GitHub to API | Webhook or repository response can be spoofed, replayed, oversized, or malformed | Verify webhook signatures, enforce replay/idempotency, validate repository selection, and bound payload/resource use |
| TB-02 Repository content to planner | README, source, fixtures, and comments can contain prompt injection or secrets | Content is data only; the planner cannot authorize, select, or execute tools |
| TB-03 Planner to policy gate | Model output can be malformed, tampered with, or over-privileged | Require strict schema validation, provenance, commit binding, deterministic policy evaluation, and rejection on ambiguity |
| TB-04 Approval UI to workflow | A stale, replayed, or over-broad approval can authorize a different action | Bind approval to tenant, user, manifest version, source commit, policy result, cost estimate, and exact tool scope |
| TB-05 Workflow and tool registry to runner | A worker or tool may cross tenant/task boundaries or retry a mutation unsafely | Typed allowlists, task-scoped identity, idempotency keys, compensation contracts, and audit events are mandatory |
| TB-06 Runner to AWS | Runner compromise, egress, credential theft, or uncontrolled Terraform can expand blast radius | Ephemeral isolation, tenant/task workspace separation, egress control, short-lived credentials, and bounded resource policy |
| TB-07 Services to PostgreSQL, object storage, secrets, and telemetry | Direct access, cross-tenant reads, secret leakage, or audit deletion can bypass the API | Enforce application authorization and RLS, encrypt sensitive stores, redact telemetry, and make audit writes tamper-evident |
| TB-08 Build and release inputs | Dependencies, actions, containers, or artifacts can be replaced or compromised | Pin inputs, verify provenance/digests, produce SBOM/provenance, and gate releases on reproducible scans |

## Security invariants

These invariants are requirements for later implementation tickets; the backlog
test IDs are the verification contract.

| ID | Invariant | Verification owner |
| --- | --- | --- |
| INV-01 | Repository content and LLM output are never an authorization source for tools or infrastructure | API/Planner owner |
| INV-02 | Intent manifests are schema-valid, policy-evaluated, provenance-bearing, and rejected when ambiguous or over-scoped | API/Policy owner |
| INV-03 | A manifest is signed, bound to the source commit and policy result, and invalidated when relevant inputs change | Signing/Workflow owner |
| INV-04 | A write requires explicit human approval bound to the exact tenant, manifest version, tool scope, cost estimate, and source commit | Approval/API owner |
| INV-05 | AWS access uses least-privilege, short-lived, task-scoped identity; customer credentials never enter storage, logs, prompts, or source | Runner/Identity owner |
| INV-06 | Runners are ephemeral, tenant/task isolated, egress-controlled, cleaned up, and unable to reuse another run's workspace or credentials | Runner owner |
| INV-07 | Tenant authorization is enforced in the application and PostgreSQL RLS, with negative cross-tenant tests | API/Data owner |
| INV-08 | Tools are typed, allowlisted, idempotent, auditable, and constrained by approval, policy, and compensation contracts; audit history is tamper-evident | Tool/Workflow owner |
| INV-09 | GitHub App permissions are minimal; webhooks are signed, replay-resistant, idempotent, and bound to the installed repository | GitHub integration owner |
| INV-10 | Dependencies, actions, containers, IaC, and release artifacts have pinned inputs and verifiable provenance, scan, and SBOM evidence | Release/Supply-chain owner |
| INV-11 | Secrets and sensitive telemetry are redacted before prompts, logs, audit payloads, or cross-tenant analytics | Platform/Observability owner |

## Abuse-case matrix

The owner column assigns a role for backlog routing. Individual assignees and
deadlines require an explicit product-owner update in the task system.

| ID | Abuse case | Severity | Attack path / precondition | Asset / boundary | Preventive controls | Detection / recovery | Owner role | Backlog test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ABUSE-01 | Prompt injection | P0 | Malicious repository content instructs the planner to ignore policy or invoke a tool | Repository content; TB-02/TB-03 | INV-01, INV-02; isolate content from instructions and reject non-schema output | Record rejection reason, quarantine the plan, and require human review | API/Planner owner | SEC-T01 |
| ABUSE-02 | Tenant crossover | P0 | Authenticated user changes tenant or object identifiers to read or mutate another tenant's state | Tenant data; TB-07 | INV-07; derive tenant context from authorization and enforce RLS | Deny and audit the request; alert on repeated cross-tenant failures; invalidate affected session | API/Data owner | SEC-T02 |
| ABUSE-03 | Webhook spoof or replay | P0 | Attacker sends a forged or previously accepted webhook to start duplicate work | GitHub integration; TB-01 | INV-09; signature verification, timestamp/replay window, repository binding, idempotency key | Reject and audit invalid/replayed events; reconcile accepted event state | GitHub integration owner | SEC-T03 |
| ABUSE-04 | Manifest tampering | P0 | Plan or manifest is modified between policy evaluation, approval, and execution | Manifest integrity; TB-03/TB-04 | INV-02, INV-03, INV-04; commit/version/policy binding | Refuse execution, preserve both versions, and require a fresh plan and approval | API/Workflow owner | SEC-T04 |
| ABUSE-05 | Signer misuse | P0 | Stolen, mis-scoped, or stale signing capability signs an unapproved write | Signing keys and approval; TB-04/TB-05 | INV-03, INV-04, INV-05; least privilege, key isolation, scope and expiry checks | Revoke signer, block affected manifests, and investigate audit chain | Signing/Identity owner | SEC-T05 |
| ABUSE-06 | Runner escape or credential reuse | P0 | Compromised runner accesses another task workspace, credential, or network target | Runner and AWS; TB-06 | INV-05, INV-06; ephemeral isolation, cleanup, egress control, task-bound credentials | Terminate run, revoke credentials, quarantine artifacts, and reconcile AWS state | Runner owner | SEC-T06 |
| ABUSE-07 | Supply-chain compromise | P0 | Dependency, action, container, IaC module, or artifact is replaced before build or release | Build/release integrity; TB-08 | INV-10; pinned references, digest/provenance checks, SBOM and scans | Fail closed, quarantine artifact, rotate affected signing material, and rebuild from known inputs | Release/Supply-chain owner | SEC-T07 |
| ABUSE-08 | Cost or resource abuse | P0 | Approved or injected plan requests unbounded resources, retries, or egress | AWS account and budget; TB-03/TB-06 | INV-02, INV-04, INV-06; policy limits, cost estimate, retry cap, budget alarms | Stop before mutation, alert owner, and reconcile partial resources | Policy/Runner owner | SEC-T08 |
| ABUSE-09 | Audit deletion or forgery | P0 | Service, runner, or tenant attempts to delete or rewrite evidence of a write | Audit and telemetry; TB-07 | INV-08, INV-11; append-only/tamper-evident events and separated write authority | Compare event chain and provider logs; escalate integrity failure | Audit/Observability owner | SEC-T09 |
| ABUSE-10 | Token theft | P0 | Repository or webhook token leaks through logs, prompts, artifacts, or error paths | GitHub/AWS credentials; TB-01/TB-02/TB-06 | INV-05, INV-09, INV-11; redaction, short lifetime, scoped installation tokens | Revoke token, invalidate runs, scrub derived artifacts, and investigate access logs | Identity/Platform owner | SEC-T10 |
| ABUSE-11 | Tool privilege escalation | P0 | A caller or model selects a tool outside the approved manifest or compensation contract | Tool registry; TB-04/TB-05 | INV-01, INV-04, INV-08; allowlist, typed arguments, exact approval binding | Reject invocation, audit mismatch, and require a new approval | Tool/Workflow owner | SEC-T11 |

## P0 abuse-case backlog tests

These are planned tests for the implementation backlog. They are not represented
as passing runtime tests by this artifact.

| Test ID | Backlog test | Fixture / precondition | Expected result | Evidence required |
| --- | --- | --- | --- | --- |
| SEC-T01 | Reject repository prompt injection | Repository fixture contains instruction-like text attempting tool execution | Planner output is treated as untrusted data and no tool is authorized | Test result and rejected-plan audit event |
| SEC-T02 | Deny cross-tenant object access | Tenant A request carries Tenant B object ID and direct SQL context | API and RLS both deny access; no object or side effect is returned | Positive and negative authorization results |
| SEC-T03 | Reject forged and replayed webhooks | Invalid signature and previously accepted delivery ID | Both requests are rejected or deduplicated without duplicate workflow | Signature, replay, and idempotency evidence |
| SEC-T04 | Invalidate changed manifest | Mutate manifest, source commit, or policy result after approval | Execution refuses stale approval and requires a fresh plan | Version-binding test and audit evidence |
| SEC-T05 | Reject out-of-scope signer | Signer lacks scope or uses expired/revoked key | Manifest is not executable and signer event is audited | Key-scope, revocation, and expiry test |
| SEC-T06 | Isolate runner credentials and workspace | Two concurrent task fixtures attempt cross-run file, credential, and egress access | Access is denied; teardown removes task state; credentials cannot be reused | Isolation, egress, cleanup, and negative cross-run evidence |
| SEC-T07 | Fail closed on unverified supply-chain input | Unpinned action/dependency/artifact or mismatched digest | Build/release gate fails before artifact publication or execution | Pin, provenance, SBOM, and scan output |
| SEC-T08 | Block cost and retry abuse | Plan exceeds policy budget or repeats an equivalent failing mutation | No cloud mutation occurs beyond approved bounds; escalation follows the retry cap | Policy decision, budget alarm, and reconciliation evidence |
| SEC-T09 | Preserve audit integrity | Attempt to delete, rewrite, or forge an audit event | Mutation is denied or detected; original evidence remains verifiable | Append-only/integrity verification and provider log comparison |
| SEC-T10 | Prevent credential leakage | Secret-like values pass through error, prompt, log, artifact, and telemetry paths | Value is redacted or rejected and never persisted in sensitive outputs | Redaction fixtures and storage/log scan |
| SEC-T11 | Enforce tool approval scope | Caller or model requests a tool or argument not in the approved manifest | Invocation is rejected before external mutation and mismatch is audited | Allowlist, typed-schema, approval-binding, and idempotency evidence |

## Residual risk and unknowns

- The repository is currently a scaffold with no GitHub App, policy engine,
  database, workflow, runner, or cloud integration. The invariants are therefore
  requirements for later tickets, not evidence that those controls exist today.
- Customer-cloud and BYOC trust boundaries remain explicitly out of scope.
- Individual control owners and deadlines are role-level until the product owner
  assigns named owners in the delivery backlog.
- Provider-specific webhook, AWS IAM, RLS, runner, and supply-chain evidence must
  be collected by the implementation tickets that introduce those boundaries.
- No residual security risk is accepted by this artifact. Any exception requires
  a separate human decision and an auditable record.

## Completion evidence

This artifact satisfies the MP-14 documentation scope when:

- all actors, assets, data classifications, flows, and trust boundaries above
  are reviewed against the current Phase 1 design;
- every listed P0 abuse case has a preventive requirement, detection/recovery
  action, role owner, and mapped backlog test; and
- the security test backlog is carried forward without treating planned tests as
  passing evidence.
