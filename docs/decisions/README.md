# Open decisions

Each record has a question, the tension, and a current lean written to be argued with. Status is **proposed** until decided. D1 and D2 matter most: D1 decides whether a separate context layer exists at all, D2 decides what happens to precomputed segments.

| ID | Question | Current lean | Reference implementation |
| --- | --- | --- | --- |
| [D1](D1-hot-ownership.md) | Own the hot entity store, or use the warehouse's low-latency tier? | Own it for now | Owns HOT (in-memory) |
| [D2](D2-segments.md) | Keep precomputed segment membership as a primitive? | Only as a materialized compiled plan | `run(approvedPlan)` is the only way to get a list |
| [D3](D3-derived-context.md) | Precompute model summaries, or generate on request? | Precompute on change for active entities, with a staleness bound | DRV generator runs on change; `isActive` gate; `maxStalenessMs` |
| [D4](D4-policy-placement.md) | Enforce policy in the context layer or the agent platform? | Data access in PDP; actions returned as `allowed` and enforced again by the agent | PDP filters fields; bundle carries `allowed` |
| [D5](D5-identity-confidence.md) | Expose probabilistic identity matches to agents? | Expose with confidence; limit which fields flow through a probabilistic link | `probabilisticTags`, `minConfidence` |
| [D6](D6-external-agents.md) | Serve customers' own agents directly? | Model as a separate purpose now, ship later | `external` is just another purpose |
| [D7](D7-semantic-layer.md) | Own the semantic layer, or adopt the warehouse's? | One definition set, stored once | The schema map is a placeholder |
