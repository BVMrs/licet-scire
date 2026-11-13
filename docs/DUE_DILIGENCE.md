# Due diligence and plan toward a working demo

As of 2026-11-12, at commit `e1f622b`. Every number below comes from a command run on that commit on Node v22.22.2, unless it is marked as a citation.

This report covers what exists and works, what the docs promise that is not built, the prior art and literature the design should be compared against, the open datasets comparable work uses, the risks, and a ranked plan. It does not decide D1–D7. Where a finding bears on a decision, the report records it as evidence.

## 1. What exists and works

### Inventory

| Path | Lines | What it is |
| --- | --- | --- |
| `src/layer.ts` | 334 | `ContextLayer`: ING, DRV scheduling, CTX, SUB/TRG, CMP, OUT |
| `src/policy.ts` | 77 | PDP: purpose → tags/actions, grants, consent, D5 floor and probabilistic tags |
| `src/identity.ts` | 59 | IDN: link graph, weakest-link confidence, no merges |
| `src/state.ts` | 63 | HOT (last-writer-by-`observedAt`), LAKE (array), DRV store |
| `src/audit.ts` | 50 | AUD: queue drained on `setImmediate` |
| `src/expr.ts`, `src/types.ts`, `src/index.ts` | 147 | Predicate language, shared types, exports |
| `test/*.test.ts` | 314 | 26 tests pinning the design rules |
| `examples/service-chat.ts` | 45 | One hand-written entity, one read, one outcome |
| `docs/` | — | Architecture mirror, status, decision records D1–D7 |

The reference has no runtime dependencies. `typescript` and `@types/node` are dev dependencies, used only for `tsc`.

### Runs

```
$ npm test                       # node --test, no install
# tests 26  pass 26  fail 0      duration_ms 492   (wall 0.65 s)

$ npm ci && npm run typecheck    # tsc --noEmit (strict)
added 3 packages ... exit 0, no diagnostics

$ npm run example
{ "identity": { "matchKind": "deterministic", "matchConfidence": 1, "linkedIds": [app_user:u-42, device:ios-7f3a] },
  "facts": [name, plan, open_issues], "derived": [contact_summary (stub-summarizer 0.1)],
  "allowed": ["reply","open_ticket","issue_refund"],
  "withheld": [{ "field": "lifetime_value", "reason": "purpose_not_permitted" }], ... }
context read took 0.42 ms in-process (sketch target: < 50 ms p99 with real stores)
audit records: context_read
```

All 26 tests pass:

- CMP: a plan cannot run until approved, materializes only consented members (D2), and is invalidated by edits.
- OUT: outcomes re-enter at ING; unknown read IDs are rejected.
- CTX/PDP: purpose filtering with `withheld` reasons, LAKE-only for non-schema fields, provenance on facts, out-of-order facts, grant and consent refusal, unknown entity is an error.
- D5: probabilistic link restricts fields and removes actions; below the floor only identity is returned; confidence is non-increasing along a chain.
- AUD: every read (including refusals) is recorded off the read path.
- Rule 1: `getContext` never calls the model. D3: precompute on change, `isActive` gate, `maxStalenessMs`, policy on derived.
- SUB: transitions only on flips, PDP on predicate fields, consent withdrawal leaves the subscription, unsubscribe.

### Defects found by probing

I wrote a throwaway probe against the test fixtures to check edge cases the tests do not cover. All four reproduced:

| # | Probe | Observed | Rule it breaks |
| --- | --- | --- | --- |
| P1 | Consent withdrawal at `t+10`, then a late consent grant stamped `t-10` | Marketing read **allowed**. `setConsent` ignores `event.at`, unlike `EntityStateStore.put` for facts | Rule 2 (consent is deterministic). It also contradicts the out-of-order guarantee the facts already have |
| P2 | `recordOutcome(readId, { type: "resolved", detail: { lifetime_value: 999999, last_outcome: "converted" } })` by `agent:service` | HOT now has `lifetime_value=999999` and `last_outcome=converted`, both with `source agent:service`. `detail` is spread over the ING attributes, so an agent can write any canonical field, including fields its purpose cannot even read, and can override `last_outcome` | Rule 3 (policy as a hard filter) applied to writes; D4 |
| P3 | `getContext` on an unknown ref | Throws `UnknownEntity`, **0 audit records** | Rule 4 (every read is auditable). The test "unknown entities are an error" pins the throw, not the audit |
| P4 | DRV generator returns a field not in the schema | The error is thrown inside the job and swallowed by `job.catch(() => {})`. Nothing is stored and nothing is reported | Observability of D3. A broken summarizer looks like "no summary yet" |

Smaller observations, which the plan covers rather than tracking separately:

- `recordOutcome` writes no audit record of its own. The example prints only `context_read`.
- Fields requested in `fields` that are not in the schema are dropped silently, not reported in `withheld`.
- `AuditLog.find` is a linear scan. That is fine in-process, but it is O(reads) per outcome at replay scale.
- `package.json` says `"license": "UNLICENSED"` while the repo is public. That is the owner's call; noted here.

## 2. Promised by the README and docs but not built

| Promise | Where | State |
| --- | --- | --- |
| Context read p99 < 50 ms, per-step budgets (5/2/10/3 ms) | architecture.md "One request" | **Not measured.** The example times one read with `performance.now()`. status.md lists this as a known gap |
| Freshness ("milliseconds after the event", `nunc`) | architecture.md stack table | Not measured. `maxStalenessMs` covers derived context only, by a stated choice |
| FEAT versioned features, SEM semantic layer | stack table | Not built. The mapping table says so; D7 is open |
| Streams for SUB | four-calls table | Callbacks only |
| IDN entity merges, governed | identity.ts comment | Not built. `link` throws on conflicting refs |
| LAKE as open tables read zero-copy | stack table | In-memory array |
| AUD durable, queryable provenance | rule 4 | In-memory, lost on exit; no query by requester or purpose |
| Policy versioning over time | `policyVersion` | One static version per process; no history |
| EXT external agents | D6 | A purpose name only, by design |
| Cost model (tokens per active entity per day) | D3, status.md | Not started |
| End-to-end demo on real data | owner directive | Not started. The example uses one hand-written entity |

## 3. Prior art and literature to measure the design against

### Purpose-based access control and privacy-aware databases (PDP, rules 3 and 4)

- Agrawal, Kiernan, Srikant, Xu. *Hippocratic Databases.* VLDB 2002, pp. 143–154. [PDF](https://personal.utdallas.edu/~muratk/courses/course_material/hippocratic.pdf). This is the origin of purpose specification, limited disclosure and compliance auditing in the DBMS. Licet Scire's purpose → tags model and per-read audit are a lightweight version of it. The follow-up *Auditing Compliance with a Hippocratic Database* (VLDB 2004) is the comparison point for AUD.
- Byun, Li. *Purpose based access control for privacy protection in relational database systems.* VLDB Journal 17(4):603–619, 2008. [PDF](https://www.cs.purdue.edu/homes/ninghui/papers/pbac_vldbj.pdf), [dblp](https://dblp.org/rec/journals/vldb/ByunL08). This paper has purpose hierarchies, intended versus access purpose, and labelling granularity. Licet Scire labels at field level with a flat purpose list. The paper is the yardstick for whether a hierarchy is needed (D7).
- Pappachan, Yus, Mehrotra, Freytag. *Sieve: A Middleware Approach to Scalable Access Control for DBMSs.* PVLDB 13(11), 2020. [arXiv:2004.07498](https://arxiv.org/abs/2004.07498). Middleware that keeps policy evaluation cheap with thousands of policies. This is the right comparison for the "~2 ms PDP" budget once grants and consent scale beyond a handful.
- Shastri, Banakar, Wasserman, Kumar, Chidambaram. *Understanding and Benchmarking the Impact of GDPR on Database Systems.* PVLDB 13(7):1064–1077, 2020. [arXiv:1910.00728](https://arxiv.org/abs/1910.00728). The paper introduces GDPRbench, whose controller, customer, processor and regulator workloads map onto the PDP, consent and AUD paths. It reports that GDPR metadata and auditing cost Redis and PostgreSQL up to 5× and that GDPR workloads run 2–4 orders of magnitude slower than YCSB. That is direct evidence on what rule 4 costs on the read path, and on D1.
- Pang et al. *Zanzibar: Google's Consistent, Global Authorization System.* USENIX ATC 2019. [Paper page](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/). It reports p95 < 10 ms at millions of checks per second, and its "new enemy" consistency (zookies) applies to P1: a consent decision must reflect the order of the user's actions.
- Policy engines to compare the PDP shape against: [Open Policy Agent](https://www.openpolicyagent.org/) and Cedar (Cutler et al., OOPSLA 2024, [cedarpolicy.com](https://www.cedarpolicy.com/)). For purpose vocabulary, the W3C [Data Privacy Vocabulary (DPV)](https://w3c-cg.github.io/dpv/) is a ready-made purpose taxonomy for D7.

### Identity resolution (IDN, D5)

- Fellegi, Sunter. *A Theory for Record Linkage.* JASA 64(328), 1969. [doi:10.1080/01621459.1969.10501049](https://doi.org/10.1080/01621459.1969.10501049). This is the basis of "match confidence". The D5 floor (`minConfidence`) is a Fellegi–Sunter upper threshold, without the clerical-review band in between.
- Linacre et al. *Splink: Free software for probabilistic record linkage at scale.* IJPDS 7(3), 2022. [doi:10.23889/ijpds.v7i3.1794](https://ijpds.org/article/view/1794). It is the open, production Fellegi–Sunter implementation, used in batch and real-time by the UK Ministry of Justice ([transparency record](https://www.gov.uk/algorithmic-transparency-records/moj-splink-master-record)). It is the comparison for how real confidences are produced and calibrated. The reference currently takes confidence as an input.
- Binette, Steorts. *(Almost) All of Entity Resolution.* Science Advances 2022, [arXiv:2008.04443](https://arxiv.org/abs/2008.04443). This survey covers ER methods and benchmark datasets, including the Febrl caveats below.

### Freshness and serving (HOT, `nunc`, D1)

- Bailis, Venkataraman, Franklin, Hellerstein, Stoica. *Probabilistically Bounded Staleness for Practical Partial Quorums.* PVLDB 5(8), 2012. [arXiv:1204.6082](https://arxiv.org/abs/1204.6082). This gives the vocabulary for stating the freshness bound the README promises: a (t, k) staleness probability rather than a single number.
- Cooper et al. *Benchmarking Cloud Serving Systems with YCSB.* SoCC 2010. [doi:10.1145/1807128.1807152](https://doi.org/10.1145/1807128.1807152). This is the standard harness and reporting convention for read/write-mix latency, and GDPRbench builds on it.
- Feature stores are the closest shipped analogue of HOT + FEAT. [Feast](https://feast.dev/) publishes a benchmark with p99 < 1.5 ms on Redis ([post](https://feast.dev/?p=945), [repo](https://github.com/feast-dev/feast-benchmarks)). It is vendor-reported but reproducible, and gives a realistic floor for "HOT read ~10 ms".

### Agents, derived context and policy-following (DRV, CTX, D3, D4)

- Yao et al. *τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains.* 2024, [arXiv:2406.12045](https://arxiv.org/abs/2406.12045). This benchmark has customer-service agents (retail, airline) that must follow domain policy. It is the closest published evaluation of "policy as a prompt instruction". Licet Scire's rule 3 argues for the opposite, and τ-bench's policy-violation failures are the evidence for that position.
- Packer et al. *MemGPT: Towards LLMs as Operating Systems.* 2023, [arXiv:2310.08560](https://arxiv.org/abs/2310.08560). Model-managed memory sits at the opposite end of D3: memory is written by the model on the request path, while Licet Scire writes it asynchronously.
- [Model Context Protocol](https://modelcontextprotocol.io/) is the likely transport if CTX is exposed to agent platforms. It is relevant to D4 and D6.

### Consent behaviour (for calibrating the demo's consent)

- Utz, Degeling, Fahl, Schaub, Holz. *(Un)informed Consent: Studying GDPR Consent Notices in the Field.* ACM CCS 2019, [arXiv:1909.02638](https://arxiv.org/abs/1909.02638). This is a field study of more than 80,000 users that reports how notice design shifts opt-in rates. No per-user dataset is released, so it can parameterize a consent overlay but not supply one.

## 4. Datasets

The directive asks for an open, well-known customer and consent dataset. **No widely used open dataset combines real customers, timestamps and per-purpose consent.** Consent data is personal by nature, and the consent studies above publish aggregate rates only. The honest set-up is a real customer and event backbone, plus a real conversation corpus, plus a consent overlay that is clearly labelled synthetic and calibrated to published rates. That overlay complements the real data and does not replace it.

| Dataset | Licence | Size, checked 2026-11-12 | Fits | Gaps |
| --- | --- | --- | --- | --- |
| **Online Retail II** (Chen, UCI #502, [doi:10.24432/C5CG6D](https://doi.org/10.24432/C5CG6D)) | CC BY 4.0 | zip 45.6 MB, sha256 `572e3627…08e67bfb`. Two sheets: 525,461 and 541,910 rows; 4,383 and 4,372 customer IDs; 107,927 and 135,080 rows without a customer ID; 10,206 and 9,288 cancellation rows; 40 and 38 countries | Real customer IDs, real timestamps 2009-12 to 2011-12, cancellations (corrections arriving later), guest rows (anonymous traffic for identity scenarios), country (a residency or consent proxy). The same creator's earlier *Online Retail* set (UCI #352) is the data of Chen, Sain, Guo, *Data mining for the online retail industry*, J. Database Marketing & Customer Strategy Mgmt 19(3), 2012, and is widely used in RFM and CLV work | No consent, no conversations, no names. Shipped as `.xlsx` |
| **Bitext customer support** ([HF](https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset), revision `430d1a89`) | CDLA-Sharing 1.0 | 26,872 rows, 11 categories (ACCOUNT 5,986, ORDER 3,988, REFUND 2,992, …). CSV v11 sha256 `6f81102b…1001a434`, 19.2 MB | Real-style utterances with intent labels give the demo's SRC-3 conversation events. Intent labels make DRV summaries checkable | Not tied to customers, so utterances must be assigned to customers with a seeded RNG. Utterances are templated (`{{Order Number}}`) |
| Bank Marketing (Moro, Cortez, Rita, *Decision Support Systems* 2014; UCI #222, [doi:10.24432/C5K306](https://doi.org/10.24432/C5K306)) | CC BY 4.0 | 45,211 rows; zip sha256 `e0bf5f5d…5efbeb4` | Contact channel, previous-campaign outcome: a marketing-purpose scenario | No customer IDs across events, no timestamps per event. Weak for a service-agent read path |
| Febrl synthetic sets (Christen; in Febrl 0.4 and `recordlinkage.datasets`) | Open (synthetic) | 5k–10k records | Ground-truth duplicates for IDN and D5 confidence experiments | Synthetic. Binette & Steorts call Febrl1 an unrealistic benchmark |
| GDPRbench workloads ([gdprbench.org](https://gdprbench.org)) | Open source | Generator | Comparable consent, audit and metadata workload; lets results sit next to a published paper | Synthetic, YCSB-style records, not customers |
| τ-bench retail domain ([arXiv:2406.12045](https://arxiv.org/abs/2406.12045)) | MIT | ~500 users, orders | Service-agent tasks with policies | Synthetic. Evaluates the agent, not the data layer |

**Recommendation.** Run the demo on **Online Retail II** as the entity and event backbone, with **Bitext** utterances as conversation events. The reasons:

- Both are openly licensed and directly downloadable without login, so a checksum can be pinned.
- Online Retail II has real temporal structure: about 1.07M events over two years for about 5.9k customers in the union of both sheets, plus late corrections and guest traffic. That structure is what the freshness, out-of-order and identity paths need.

Consent comes from a seeded overlay. Per-purpose grants are drawn at rates cited from Utz et al., and withdrawals arrive as later events. It is labelled synthetic in the demo output.

Two follow-ups would let the demo's numbers sit next to published work:

- Febrl, as an optional IDN accuracy experiment.
- GDPRbench, as an optional comparison workload.

The datasets are fetched by a script with pinned SHA-256 and are never committed.

## 5. Risks

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| **No real consent data.** The "consent dataset" part of the directive can only be met by an overlay | Certain / medium | Label the overlay as synthetic in output and docs; cite the rates; keep the overlay seeded and separate from the loader. Owner may prefer another source (see summary) |
| **`.xlsx` without dependencies.** Online Retail II is xlsx only; `openpyxl` is not installed here and the reference must stay dependency-free | Certain / low | A small reader using `node:zlib` `inflateRaw` and a streaming XML scan, or a fetch-time conversion to CSV with Python's stdlib (`zipfile` + `xml.etree`). The profile above used the latter: 62 s for both sheets |
| **In-process numbers will be read as production numbers.** A sub-millisecond `getContext` on a Map says nothing about the 50 ms p99 target with real stores | High / high | The report labels every number "in-process reference" and reports per-step breakdown and distribution (p50/p95/p99/max), not a single figure. Real-store latency is a separate later step (D1 evidence) |
| P1/P2 defects make demo results wrong (consent bypass, agent-written facts) | Certain until fixed / high | Plan step 1 comes first |
| Scale: about 1M ingests, each re-evaluating all subscriptions and scheduling a DRV job | Medium / medium | Measure first. `isActive` gate; the replay can sample customers. Do not optimize before the numbers exist |
| Data provenance in a public repo | Low / high | Only the public datasets above. No employer material. Data stays out of git (`.gitignore` `data/`) |
| Licence mix: CDLA-Sharing for Bitext; derived outputs must stay under the same terms | Low / low | Demo output is not redistributed; attribute in DEMO.md |
| A demo that settles D-records by accident (for example, the demo config hard-codes a D5 floor and reports it as "the" answer) | Medium / medium | Demo reports evidence per D-record and leaves the status as proposed |

## 6. Ranked plan to a working demo

Each step is filed in `.agent-work/followups.json`.

1. **Fix the four probe defects with regression tests** (maintenance). P1 consent ordered by `observedAt`. P2 outcome `detail` restricted to outcome-tagged fields, and an `outcome` audit record. P3 unknown-entity reads audited. P4 DRV failures surfaced (counter or audit record, not swallowed). These come first because the demo's results are wrong without them.
2. **Fetch and load the datasets** (feature). The work:
   - `scripts/fetch-data` with pinned SHA-256 for Online Retail II and Bitext, writing to git-ignored `data/`.
   - A dependency-free loader that maps invoice lines to `IngestEvent`s. Customer ID becomes `customer:<id>`. Guest invoices become `invoice:<no>` refs. Cancellations become later events.
   - A seeded consent overlay with cited rates.
   - Acceptance: the loader reproduces the row and customer counts in §4.
3. **End-to-end service-agent demo on the replay** (feature). `demo/service-agent.ts` replays a time window, assigns Bitext utterances to customers as SRC-3 events, and runs a service agent per conversation. That agent does `getContext` → act on `allowed` → `recordOutcome`, with a stub DRV summarizer over the real facts. `docs/DEMO.md` gives one command and the expected output.
4. **Measure the README's latency and freshness bounds** (feature). The harness reports:
   - Per-step timings (IDN, PDP, HOT/DRV read, assembly) and p50/p95/p99/max for `getContext` over all demo reads, against the 5/2/10/3/50 ms targets.
   - Ingest-to-visible lag for facts and for derived context, with the share of reads where derived context was withheld as `stale`.
   - Audit completeness: reads equal audit records.
   - Output as JSON plus a table in DEMO.md, labelled "in-process reference".
5. **Record D-record evidence from the replay without deciding** (feature). The evidence per record:
   - D3: DRV regenerations per active entity per day from real activity, as cost-model input.
   - D5: an identity scenario that links guest invoices to customers probabilistically, reporting how many fields and actions are withheld at different floors.
   - D2: subscription transitions versus approved-plan materialization counts.
   - Each goes in an "Evidence" section of the D-record, with status left as proposed.

Steps after the demo, not filed, for the owner to rank:

- Real-store latency (D1).
- An IDN accuracy experiment on Febrl against Splink.
- A GDPRbench comparison of the audit path.
- An MCP adapter for CTX.
