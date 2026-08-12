# MPaaS Platform

MPaaS is an AI-native platform orchestration SaaS. Phase 1 focuses on a safe, transparent GitHub-to-AWS sandbox deployment path for a supported application.

## Phase 1 guardrails

- AWS-first; ECS Fargate before Kubernetes or multi-cloud.
- Planner output is never directly executable.
- Schema validation, policy evaluation, dry run, cost estimate, explicit approval, signed manifests, idempotent tools, and postcondition checks are mandatory.
- Production, customer-cloud, and destructive writes remain disabled until separately approved.
- Secrets must never appear in source, manifests, model context, logs, or audit payloads.

The product brief, architecture decisions, and delivery backlog are maintained in the connected MPaaS Notion workspace.

This is a private, proprietary repository. No public license is included.

## Repository structure

This repository is a TypeScript monorepo with one logical control plane and four
explicit process entrypoints:

```text
apps/web       React/Next.js portal boundary
apps/api       control-plane API boundary
apps/worker    durable workflow worker boundary
apps/runner    isolated infrastructure execution boundary
packages/domain      domain types and invariants
packages/contracts   versioned public interfaces and schemas
packages/tool-sdk    typed tool and compensation contracts
```

Each module exposes its public API from `src/index.ts`. Cross-module imports must
target another module's `src/index.ts`; internal files and direct table access are
not public contracts. The worker and runner are separate process entrypoints for
retry, credential, and runtime isolation, not independent microservices.

## Local verification

```sh
npm install
npm test
npm run typecheck
npm run check:boundaries
npm run build
npm run start:web
npm run start:api
npm run start:worker
npm run start:runner
```

The scaffold contains no product feature or cloud integration. It establishes
module boundaries and start paths so the first vertical slice can be added without
introducing speculative shared libraries.
