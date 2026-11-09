# D3 · Derived context

**Status:** proposed

**Question.** Precompute model summaries, or generate them on request?

**Tension.** Precomputing costs tokens for entities nobody asks about and goes stale. Generating on request adds a model call to the read path.

**Current lean.** Precompute on change for active entities, with a staleness bound. Never generate on the read path.

**Open.** No cost model yet: tokens per active entity per day against read volume.
