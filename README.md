# Licet Scire

*"It is permitted to know."* Motto: **Quid, cui, cur, nunc** (what, to whom, why, now).

Licet Scire is a working architecture, and a small reference implementation, for what the customer data platform (CDP) becomes when its main consumer is an agent rather than a marketer: a governed, real-time service that answers one question.

> What may this requester know about this entity, for this purpose, right now?

The motto maps onto the core call. *Quid* is the fields returned, *cui* the requesting agent, *cur* the purpose, *nunc* the freshness bound.

```ts
layer.getContext(entity, { purpose, requester, fields, maxStalenessMs }) // → ContextBundle
```

Everything here is built from public sources and general reasoning.

## What is in this repo

| Path | What it holds |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | The stack, component IDs, migration map from today's CDP, the request path and the design rules |
| [`docs/decisions/`](docs/decisions/) | Open decisions D1–D7, one record each, with the current lean |
| [`docs/status.md`](docs/status.md) | How the thesis evolved, facts checked, known gaps and next steps |
| [`src/`](src/) | Dependency-free TypeScript reference of ING, IDN, HOT, LAKE, DRV, TRG/SUB, PDP, CTX, CMP, AUD and OUT |
| [`test/`](test/) | Tests that pin the design rules (no model on the read path, policy as a hard filter, every read audited, D2, D3, D5) |
| [`examples/service-chat.ts`](examples/service-chat.ts) | The sketch's end-to-end example: a service agent opens a chat |

The reference is in-memory and single-process. It exists to make the contract and the design rules concrete and testable, not to measure latency or scale.

## Running it

Needs Node 22.18 or later (TypeScript runs directly through Node's type stripping, so there is no build step).

```sh
npm test            # node --test, no install needed
npm run example     # prints a ContextBundle for the service-chat example
npm install && npm run typecheck
```

## The four calls

| Call | Component | Replaces |
| --- | --- | --- |
| `getContext(entity, {purpose, requester, fields, maxStalenessMs})` | CTX | Profile lookups and most of the activation surface |
| `subscribe(predicate, purpose, requester, onTransition)` | SUB | Streaming segment membership |
| `compile(intent, purpose)` → `approve(plan)` → `run(plan, requester)` | CMP | The segment builder |
| `recordOutcome(readId, outcome)` | OUT | Closes the loop: outcomes re-enter at ING |
