# Status

As of 2026-11-09. Carried over from the handover.

## How the thesis evolved

The current position: the CDP survives as a function and fades as a category, absorbed into a context layer for agents. Each step replaced the one before it.

1. **"AI makes CDPs obsolete."** Dropped: identity, ingestion, consent and the profile store become more necessary under AI, not less.
2. **"The value inverts."** The manual layer (segment builder, hand-tuned rules, static journeys) loses value; the data substrate gains it. Basis of the blog post "The Schema Was the Bottleneck".
3. **"Next-gen CDP."** Five layers: ingest and identity, hybrid storage, semantic layer, reasoning with materialization, governance in the loop. Basis of the earlier design doc.
4. **"Is the CDP even the right target?"** The category is squeezed from three sides: the warehouse absorbs storage, agent platforms absorb activation, customers' own agents may change demand.
5. **"Customer context layer."** Governed, low-latency, identity-resolved entity state served to automated decision-makers, with consent enforced at read time. Basis of the architecture sketch and this repo.

Expected path, with confidence falling over time: agents layered onto existing platforms until about 2027; storage settling in the warehouse and activation moving to agent platforms around 2027–2029; the "CDP" label fading later.

## Facts checked

All were checked against search results, not full page reads. Reopen the sources before publishing anything.

| Claim | Verdict |
| --- | --- |
| Oracle pulled out of the CDP space | Not supported: Oracle Unity is still in Gartner's 2026 CDP Magic Quadrant |
| Oracle fired its whole CDP division in late 2025 | Not found: the 2026 layoffs named other units |
| Standalone CDPs are under pressure | Supported |
| Phase 1 is "copilots for segment building" | Partly right |
| Zero-copy is becoming the default | Supported, contested |

## Known gaps

- No cost model and no measured numbers. Latency figures are design targets.
- No cost model for derived context (D3) or for running agents at campaign volume.
- Agent-mediated buying is speculative, with no adoption data.
- The D1 boundary rests on an unchecked judgment about warehouse roadmaps.
- Sources were read from search results only.
- The blog post and earlier design doc exist only as downloads from the original chat; they are not in this repo.

## Next steps

- [ ] Decide D1 and D2, then update the sketch and the decision records.
- [ ] Rewrite the design doc around the context layer, keeping its failure modes (cost, non-determinism, governance bypass, semantic drift, audit) and adding the warehouse boundary.
- [ ] Rough cost model: tokens per active entity per day for derived context, against read volume.
- [ ] Decide the audience (public blog, internal proposal or architecture essay) before the next draft.
- [ ] Reopen and cite the full source pages before anything is published.
- [x] Reference implementation of the four-call contract with tests for the design rules.
