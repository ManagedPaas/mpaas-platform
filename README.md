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
