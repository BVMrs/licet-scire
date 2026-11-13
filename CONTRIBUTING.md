# Contributing to Licet Scire

How changes get into this repository. Most changes are made by agents on branches and reviewed by the owner;
the same rules apply to human contributors. The repository is public and built only from public sources:
do not add employer-internal material.

## Setup

Node 22.18 or later (`package.json` `engines`). TypeScript runs through Node's type stripping, so tests and the
example need no install. Only the type check needs the two dev dependencies.

```sh
npm test               # node --test over test/**/*.test.ts
npm run example        # runs examples/service-chat.ts and prints a ContextBundle
npm ci                 # installs typescript and @types/node from package-lock.json
npm run typecheck      # tsc over src, test and examples (tsconfig.json sets noEmit)
```

## Branch naming

- Agent branches: `claude/<slug>`, a short kebab-case description of the one concern, e.g. `claude/add-contributing-v2`.
- Branch from the main branch (currently `claude/project-thread-lrls38`, the remote's default `HEAD`).
- One branch per pull request. Do not reuse a merged branch; start a new one (a `-v2` suffix is fine).

## Commit messages

As in `git log`:

- A single-line subject in the imperative mood, capitalised, no trailing period
  (`Start Licet Scire: architecture docs, decisions D1–D7, reference context layer`).
- A blank line, then a body saying what changed and why; a bullet list of touched areas is fine.
- Refer to components by their IDs (CTX, PDP, AUD, ...) and decisions by D1–D7, as the docs do.
- Agent commits end with the `Co-Authored-By:` trailer for the model that wrote them.
- Commit in small steps; the history is squashed on merge, so intermediate commits are for review only.

## Pull request process

1. Before opening or updating a PR, run the full check locally:

   ```sh
   npm test && npm ci && npm run typecheck && npm run example
   ```

   This is the command CI is expected to run. There is no workflow in `.github/workflows/` yet; until one
   exists, the local run is the gate and the PR description must show its result.
2. Agents do not push or open PRs themselves; the runner pushes the branch and opens the PR.
3. The description contains: what changed and why, how it was verified (commands, inputs, observed output and
   numbers), risks, and follow-ups. For agent PRs this is `.agent-work/summary.md`.
4. The owner approves every PR. Nothing merges without that approval.
5. PRs are squash-merged: one commit per PR on the main branch.
6. After each merge the runner rebases the open agent PRs onto the new main branch. Keep PRs small and away from
   shared files (below) so those rebases stay clean.

## PR sizing

- One concern per PR: a fix, a feature, a decision's evidence, or a doc. Not two of them.
- Aim for under ~400 changed lines (excluding lock files). If it grows past that, split it and note the
  remaining parts as follow-ups.

## Shared files

Many PRs are open at once. Files that every PR would want to touch stay out of feature PRs:

- `README.md`, `docs/architecture.md`, `docs/status.md`, and `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` or
  `CLAUDE.md` if they are added. Edit them only in a PR that is about them; otherwise put the suggested edit
  in the PR description.
- `docs/decisions/` records D1–D7 are open. Never decide one in code: add evidence and research to the record,
  and leave the status to the owner.
- Dependency lists (`package.json` and any later `flake.nix`, `Cargo.toml`, `dune-project`): one entry per
  line, kept sorted.
- The reference implementation is dependency-free: `src/` imports only `node:` built-ins and its own modules.
  A new runtime dependency needs a decision first. Dev dependencies are `typescript` and `@types/node` only.
- `.agent-work/` holds agent scratch notes and is removed before the PR.

## Testing conventions

- Runner and assertions: `node:test` and `node:assert/strict`. No test framework dependency.
- Files: `test/<area>.test.ts`; shared setup lives in `test/fixtures.ts` (`makeLayer`, the schema, the policy
  and an injected clock). Use the injected clock, never wall time, so tests are deterministic.
- Name a test by the rule it pins, prefixed with the component or decision ID where there is one:
  `"PDP refuses a requester without a grant for the purpose"`, `"D5: below the confidence floor ..."`.
- The tests pin the design rules: no model call on the read path, policy as a hard filter, every read audited,
  and the current leans of D2, D3 and D5. A change that weakens one of these needs an owner decision, not a test edit.
- Never modify a test to make it pass. A failing test is evidence; fix the code or raise it in the PR.
- New behaviour comes with a test. Tests run offline and do not fetch data.
- Demo data comes from openly licensed datasets fetched by a script with a pinned checksum, cited with the
  paper that uses them. Large data is never committed; synthetic data only complements real data for edge cases.

## Review rubric

Reviewers (the owner and review agents) grade findings Critical, High, Medium or Low.

- **Blocks merge:** a failing test, a failing type check or example, or a Critical/High finding (wrong
  behaviour, a broken design rule, a policy or audit bypass, internal material in a public repo).
- **Does not block:** Medium and Low findings, style, naming and suggestions. Record them as follow-ups
  (`.agent-work/followups.json` for agents) rather than holding the PR.

## Definition of done

A change is done when all of these hold:

- [ ] It type-checks: `npm ci && npm run typecheck` exits 0.
- [ ] Tests pass locally (`npm test`) and in CI once CI exists.
- [ ] The demo still runs: `npm run example` prints a ContextBundle.
- [ ] Any doc the change makes stale is updated in the same PR (shared files: suggest the edit instead).
- [ ] The PR description records what was run and what it showed.
