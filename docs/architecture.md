# Architecture

Source of truth: the *Customer Context Layer* architecture sketch v0.1 (2026-11-08). This file mirrors it so the repo stands on its own. Component IDs and D1–D7 are stable handles for discussion and appear in the code.

The design is a governed, real-time service between raw signal and the agents that act on it. Data flows top to bottom. Consumers reach entity data only through the serving layer, so the policy check sits on every read.

## The stack

| Layer | Components | Notes |
| --- | --- | --- |
| Sources | SRC-1 web and app events, SRC-2 business systems (CRM, commerce, billing), SRC-3 conversations (support, chat, agent logs), SRC-4 customer-side agents | SRC-4 is external and speculative |
| Ingest and identity | **ING** stream ingest (validation, consent captured at collection), **IDN** identity graph (streaming resolution, match confidence per link) | Milliseconds after the event |
| State | **HOT** entity state store (current state, millisecond reads), **LAKE** lakehouse (history and raw signal in open tables, read zero-copy) | Split by temperature |
| Meaning | **FEAT** versioned features, **DRV** derived context (model-written summaries and intents, async, versioned), **TRG** trigger engine (predicates over state, emits transitions), **SEM** semantic layer (entities, metrics, relationships, purposes) | Derived and declared |
| Serving | **CTX** context API, **SUB** subscriptions, **CMP** query compiler, all inside **PDP** (policy decision point on every read and subscription) | The product surface |
| Consumers | AG-* business agents, BI analytics, RETL legacy channels, EXT external agents | Mostly not humans |
| Side rail | **AUD** audit and provenance, **OUT** outcome loop | AUD records every read; OUT feeds outcomes back into ING |

## Where today's CDP components go

| Today | Goes to | How it changes |
| --- | --- | --- |
| Event collection and streaming ingest | Context layer | Stays. Adds support transcripts, agent conversation logs and queries from customers' own agents. |
| Modeled schema (schema-on-write) | Context layer, warehouse | Splits. A thin canonical entity model stays strict because identity and consent depend on it. The long tail lands raw in open tables and gets meaning from semantic definitions. |
| Identity graph | Context layer | Becomes the core asset. Match confidence is exposed so an agent can tell a deterministic match from a guess. |
| Unified profile store | Context layer, warehouse | Splits by temperature. Current state in a millisecond store; full history in the warehouse, read zero-copy. |
| Computed attributes and propensity scores | Context layer | Become versioned features, joined by model-derived context stored with model version and timestamp. |
| Batch segmentation | Warehouse | SQL over the lakehouse, often compiled from a natural-language request and reviewed before it runs. |
| Streaming segmentation | Context layer, shrinks | Membership lists give way to subscriptions. Precomputed membership survives where volume demands it (paid media, bulk email). |
| Segment builder UI | Shrinks | Intent in, compiled plan out, with human or policy approval between. |
| Journey orchestration | Agent platform | Static journeys become agent plans bounded by policy and caps the context layer supplies. |
| Destinations and activation | Agent platform, warehouse | Agents act through tools. Legacy channels keep receiving syncs, increasingly via reverse ETL. |
| Governance labels and consent | Context layer | Moves into the read path, enforced per purpose and per requesting agent. |
| Reporting and journey analytics | Warehouse | Agent outcome data joins the same tables. |

## One request, end to end

A customer writes in from a logged-in app session and a service agent opens a chat. Latencies are design targets, not measurements.

| Step | What happens | Target |
| --- | --- | --- |
| 1. Resolve identity | IDN maps the device ID to a canonical entity and reports match confidence | ~5 ms |
| 2. Policy decision | PDP checks purpose "service", the agent's grants and the customer's consent | ~2 ms |
| 3. Read state and derived context | HOT returns current state; DRV returns the precomputed summary of recent contacts | ~10 ms |
| 4. Assemble bundle | Apply redactions, attach allowed actions, issue a read ID | ~3 ms |
| 5. Audit write | AUD records the read off the critical path | 0 on path |
| Total | Context read, p99 | < 50 ms |

`examples/service-chat.ts` runs this path against the reference implementation.

## Design rules

1. No model call on the context read path. Model work runs asynchronously in DRV or inside the consuming agent.
2. Identity, consent and eligibility are deterministic and never pass through a model.
3. Policy is a hard filter at read time, not an instruction in a prompt.
4. Every read is auditable: requester, purpose, fields returned and withheld, policy version.
5. Precomputed audiences survive only where volume makes per-request evaluation too expensive.

## How the reference implementation maps to this

| ID | Where | Simplification |
| --- | --- | --- |
| ING | `ContextLayer.ingest` | Fields outside the canonical schema go to LAKE only |
| IDN | `src/identity.ts` | No entity merges; confidence is the weakest link on the chain |
| HOT, LAKE, DRV | `src/state.ts` | In-memory maps; LAKE is an append-only array |
| PDP | `src/policy.ts` | Purposes map to policy tags and actions; grants per agent; D5 field restriction and confidence floor |
| CTX | `ContextLayer.getContext` | Synchronous, reads stores only (rule 1 is structural) |
| TRG, SUB | `ContextLayer.subscribe`, `src/expr.ts` | Declarative predicates so PDP can see which fields they read; callbacks instead of streams |
| CMP | `compile`, `approve`, `run` | The intent compiler is injected; plans are invalid if edited after approval |
| AUD | `src/audit.ts` | Queued and drained on a later tick |
| OUT | `recordOutcome` | Writes `last_outcome` back through the ingest path |
| FEAT, SEM | not built | Features are plain HOT fields; the schema map stands in for SEM (see D7) |

Two choices in the reference go slightly beyond the sketch and are open to argument: a probabilistic match returns no `allowed` actions at all, and `maxStalenessMs` applies to derived context, not to facts.
