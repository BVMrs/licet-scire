# Charter

**Status:** draft for owner edit and approval (2026-11-12). Items marked `(proposed)` are the drafter's guesses, not owner-stated scope.
The planner proposes only work that moves the **current milestone** (section 4).

## 1. Objective

Make concrete and testable a governed, real-time context layer that answers one question for agents: *what may this requester know about this entity, for this purpose, right now?* (README). Keep D1–D7 open and gather evidence for them rather than deciding them in code.

## 2. Demo

The end-to-end service-agent example (`examples/service-chat.ts`, architecture "One request, end to end"), driven by an open dataset instead of one hand-written customer.

- **Command** `(proposed)`: `npm run data:fetch && npm run demo`
- **Dataset** `(proposed)`: Action-Based Conversations Dataset (ABCD): about 10k customer-service dialogues, each with a customer profile (name, account, membership level, order) and the agent actions taken. Chen, Chen, Yang, Lin, Yu, *"Action-Based Conversations Dataset: A Corpus for Building More In-Depth Task-Oriented Dialogue Systems"*, NAACL 2021, <https://github.com/asappresearch/abcd> (MIT licence; `data/abcd_v1.1.json.gz`, 37 MB). ABCD has profiles and service intents but no consent flags, so a small synthetic consent overlay (seeded, documented) complements it for the marketing-purpose cases.
- **What the owner sees**: for each replayed conversation, the `ContextBundle` the service agent receives (fields returned and withheld, `allowed` actions, match confidence), then a summary: reads served, reads denied, fields withheld by purpose, audit records = reads, and p50/p95/p99 `getContext` latency plus derived-context staleness against `maxStalenessMs`.

## 3. Success criteria

1. `npm test` passes, and the tests pin the design rules: no model on the read path, policy as a hard filter, every read audited, D2, D3, D5.
2. The demo run on the full pinned dataset reports exactly one audit record per read and zero fields returned outside the purpose's policy tags (checked by the demo itself, exit code non-zero on violation).
3. The demo reports `getContext` p99 and derived-context staleness against the architecture targets (< 50 ms p99 context read; staleness within `maxStalenessMs`), and anyone can repeat it on Node ≥ 22.18 with no install.
4. Each of D1–D7 carries an **Evidence** section that cites a source or a reproducible measurement; none is marked decided by code.
5. The runtime stays dependency-free: `package.json` has no `dependencies` (dev-only TypeScript and types).

## 4. Current milestone: M1 · Dataset-driven service-chat demo `(proposed)`

**Why first.** It is the directive's demo target, and today's example uses one invented customer and prints a single 0.4 ms in-process read. Every later claim (latency, freshness, D3 cost) needs a repeatable run on real-shaped data first.

Acceptance criteria:

1. `npm run data:fetch` downloads ABCD to a git-ignored `data/` directory and verifies a pinned SHA-256; a corrupted file makes it exit non-zero. `git ls-files data/` prints nothing.
2. `npm run demo` ingests every ABCD customer profile, replays each conversation as a `getContext(…, { purpose: "service" })` read and prints the summary from section 2; it exits 0.
3. `npm run demo -- --check` exits non-zero if any read lacks an audit record, any returned field is outside the purpose's tags, or any marketing read returns data for a customer without consent in the overlay.
4. `npm test` passes, including a new test that runs the demo loader on a small checked-in fixture (a handful of ABCD-shaped records, not the dataset).
5. `docs/DEMO.md` gives the command, the dataset citation and licence, and a sample of the expected output with real numbers from a run.
6. `node -e "process.exit(Object.keys(require('./package.json').dependencies ?? {}).length)"` exits 0.

**Next.**
- M2 · Freshness under replay `(proposed)`: stream ABCD (or UCI Online Retail II, Chen et al. 2012) events at a fixed rate and measure ingest-to-readable lag and DRV staleness.
- M3 · Decision evidence `(proposed)`: D3 cost model (model calls per active entity per day against read volume, from M2 runs) and D1 vendor serving-tier evidence, recorded in the decision files.

## 5. Non-goals

- Deciding D1–D7, in code or otherwise, before the owner does.
- Production stores, distributed deployment or scale testing; the reference stays in-memory and single-process (README).
- Calling a model on the read path, or putting policy in a prompt (design rules 1–3).
- Shipping external-agent serving (D6: "design now, ship later").
- Publishing the blog post or design doc, or choosing the audience (docs/status.md lists that as an owner decision).

## 6. Constraints

- **Language and platform**: TypeScript run directly by Node ≥ 22.18 (type stripping, no build step); `node --test`; no runtime dependencies unless a decision says otherwise.
- **Data**: open, well-known datasets only, cited, fetched by a script with a pinned checksum, never committed. Synthetic data only to complement (edge cases, consent overlay).
- **Sources**: public repo, built only from public sources; no employer-internal material.
- **GPU and budget**: none needed or assumed; derived context stays a stub generator until the owner sets a model budget `(proposed)`.
- **Decisions**: D1–D7 stay `proposed`; work records evidence in `docs/decisions/`.

## 7. Open questions for the owner

1. **Which dataset drives the demo?** No well-known open dataset carries per-customer consent. *Recommendation:* ABCD for profiles and service conversations, plus a seeded synthetic consent overlay, documented as synthetic.
2. **What may the latency numbers claim?** The README says the reference "is not to measure latency or scale"; the directive asks the demo to measure the README's latency and freshness bounds. *Recommendation:* report in-process p50/p95/p99 and staleness, labelled clearly as in-memory numbers that check the contract's overhead, not the < 50 ms target with real stores; adjust the README sentence accordingly.
3. **Licence.** `package.json` says `UNLICENSED` in a public repo, which blocks reuse and makes dataset-licence compatibility unclear. *Recommendation:* pick a permissive licence (MIT or Apache-2.0) before the demo ships.
