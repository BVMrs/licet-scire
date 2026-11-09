# D1 · HOT ownership

**Status:** proposed

**Question.** Own the hot entity store, or use the warehouse's low-latency tier?

**Tension.** Warehouses are adding row-store and serving tiers. If those reach millisecond reads under streaming writes, HOT stops being a reason for a separate system. This is also the strongest objection to the whole thesis: the context layer may end up as a warehouse feature plus an agent framework.

**Current lean.** Own it for now. Streaming identity plus per-entity state under heavy writes is where warehouses are weakest.

**What would change it.** Vendor serving tiers shown to sustain millisecond reads under streaming writes at per-entity granularity. The judgment about warehouse roadmaps has not yet been checked against vendor announcements.
