# Project review — 2026-09-30

Subsequent owner decision: prioritize an MVP this week with one experimental bot, local hands and review; defer accounts/sync. [PLAN.md](../PLAN.md) supersedes statements below that all earlier gates remain mandatory. Findings are retained as historical rationale.

This is a product, architecture, and delivery review of local commit `4ac8b7d` plus the existing uncommitted planning documents. Recommendations are proposals, not accepted scope changes. Existing v1 gates remain in force. No application code, deployment, account settings, or release tags were changed.

## Assessment

The project has a sensible technical foundation and a working local prototype. It is not yet a verified release candidate. The main mistake has been developing many layers before proving the complete play/save/review/sync journey. The next phase should close those journeys, not expand the feature list.

The engineering objective is clear: free, private-source, heads-up, 100bb, local-first practice with experimental opponents and optional account synchronization. The user outcome is less clear. An enjoyable poker game, a tool for learning fundamentals, and a serious strategy trainer need different evidence. Current heuristics and uniform-range equity can support the first two in a limited, explicitly explained way; they do not establish the third.

Proposed product statement, pending owner input: “I can play a short heads-up practice session, reliably keep it, and revisit a decision with a clear explanation of what the numbers mean and what they cannot tell me.”

## Decisions worth keeping

| Decision | Reason | Boundary or cost |
| --- | --- | --- |
| Static frontend and browser worker | Fits local computation and the zero-dollar recurring budget; avoids an inference server | Browser performance must be measured on supported devices |
| Local-first storage and optional cloud | Guest use has value without an account; completed hands can survive network failure | Must actually keep guest play reachable during auth failure and handle storage failure |
| Heads-up, fixed 100bb hands | A bounded game with simpler accounting and a stable policy configuration | Not equivalent to continuous cash or six-max practice |
| Shared contracts and poker adapter | Keeps rules separate from presentation and makes engine replacement possible | Current upstream state exposure weakens that boundary |
| Pinned upstream engine plus independent references | Reuse is reasonable; the blind fix has a regression and independent evidence | The core betting bug warrants stronger qualification, not an automatic rewrite |
| Separate bookmarks and immutable hand records | Prevents a bookmark edit from changing the payload of an upload retry | Multi-device bookmark conflict semantics still need defining |
| Experimental labels and no solver claims | Matches the available evidence | Labels alone cannot turn an arbitrary policy comparison into instruction |
| Private repository and no paid services | Explicit owner constraints | Operating procedures must work without assuming paid repository features |

React/Vite, TypeScript, Dexie, and the small domain packages do not warrant replacement on current evidence. A framework rewrite would delay the missing integration proof.

## Highest-value corrections

### 1. Separate gameplay concepts from upload bookkeeping

Source-confirmed findings, not newly reproduced backend tests:

- `apps/web/src/main.tsx:108` creates a new timestamp while Next hand retains the session ID. `start_sync_session` requires the original timestamp. Policy changes also reuse an upload session with fixed configuration.
- `supabase/migrations/20260929000000_initial.sql:97` counts every unexpired session toward a ten-session cap. Sessions expire after 30 days. `packages/persistence/src/index.ts:44` ends a session only locally; there is no cloud close operation. After ten separate sessions within the expiry window, a new cloud session is rejected even if the user finished all the previous sessions.
- `packages/persistence/src/index.ts:95` queues imported records with original session IDs, dates, and sequences. This conflicts with server rules for expired sessions, another producing device/account, or an incomplete sequence after retention. Export/import promises need a defined archival import path.
- `apps/web/src/cloud.ts:30` aborts synchronization on the first invalid session, so an old rejected upload can block unrelated uploads and cloud downloads.

Define a hand, a user-visible practice session, and an upload stream separately. Decide how an archive is imported without pretending it is the original live producer, and how deduplication survives detail pruning. Keep idempotency and ownership checks; do not fix this by deleting safeguards or silently assigning new hand identities.

The existing quota matrix should test ordinary usage as well as quota attacks: start/end eleven sessions, change policy repeatedly, import a month-old archive, and restore on a second device. These belong with P0-01/V1-03, with the lifecycle decision made before pilot data becomes valuable.

### 2. Prove complete behavior across boundaries

Existing tests establish useful pieces, but leave the composition largely untested:

- The four browser scenarios become twelve tests across three browsers. The completion scenarios immediately fold; they do not prove a browser betting/showdown path.
- The database harness creates abbreviated records that omit required client fields. SQL success therefore does not prove application-generated hands upload correctly.
- The 100-hand bot integration test bypasses React, Web Locks, the worker client, and cloud synchronization.
- Browser release tests use the Vite development server, not the deployed production artifact.

Add a small set of high-value journeys before more isolated checks: a deterministic betting hand through showdown and review; three consecutive signed-in hands with real local Supabase; disconnect/retry without duplicate accounting; reload during bot action; takeover after another tab advances the hand; account switch during a pending sync. The account-switch case is a risk to investigate: synchronization checks the owner once but then uses a mutable global authenticated client throughout its awaits.

Known recovery issues remain important: React `busy` state is not a synchronous action mutex; tab takeover does not reload active state; worker failures reject requests but never replace the worker; auth readiness can gate the entire app. Another direct source finding: missing review records return `undefined`, also used for “loading,” so the intended unavailable-hand branch is not reached (`main.tsx:207`, persistence `getHand`).

### 3. Make review useful without overstating it

Current review uses a fresh random estimate each visit and samples a policy with a fixed RNG result of `0.5`. It neither reproduces the original mixed policy distribution nor establishes the best decision. The existing disclaimer is appropriate but insufficient as the whole teaching design.

The estimator explicitly samples uniform legal opponent hands and does not condition on betting behavior. More Monte Carlo samples reduce sampling noise; they do not improve that range assumption. Keep pot odds, sampled equity, and policy frequencies distinct. Explain that showdown equity versus that assumed range is not a complete decision-value calculation.

Define one bounded learning outcome for v1, such as understanding the price of a call and the assumptions behind its displayed equity. Use stable analysis inputs/seeds and version dispatch. Consider hiding the final outcome until requested to reduce hindsight bias in the person reviewing, separately from protecting the computational information set. A stronger bot beating weak baselines would still not prove the review teaches sound strategy.

### 4. Own durable contracts before collecting important pilot history

`packages/poker/src/index.ts:6` publicly aliases upstream state, and UI/persistence access that layout. The hand format stores decision frames but not complete canonical events. Version labels are present, but frozen dispatch and migration behavior remain incomplete.

Make the owned recovery/history boundary and migration policy an early task. This is justified by current persistence and review needs. Requiring six-seat-capable structures is a separate future-readiness choice. Stable seat identifiers are inexpensive; a broad six-seat settlement abstraction needs a present justification. Existing requirements are not waived by this review, but this is a reasonable scope item to reconsider with the owner.

Extract session transitions, recording, and sync coordination out of the single `main.tsx` as those fixes are made. The purpose is testability and clear ownership, not an aesthetic refactor. Avoid introducing a generalized framework.

### 5. Match benchmark evidence to the shipped policy

Keep legal-action/fairness tests and the agreed final benchmark. Do not launch the long run until rules, policy versions, randomness, and recording are stable.

The browser worker has a 1.5-second deadline; the offline benchmark requests fixed full sample counts without that deadline. Slow devices may therefore use different effective sampling. Define whether the policy includes this adaptive behavior and record actual samples. Either demonstrate target samples on supported devices or qualify what the fixed-sample benchmark establishes.

The benchmark currently shares one RNG stream across shuffling, equity, and actions. Separate streams and verify paired card/position assignments. Add resumable output and a runtime calibration. Define the practical difference the experiment should detect; 10,000 paired deals is an agreed sample count, not a guarantee of decisive confidence intervals. No new run was started in this review.

## Is everything needed?

Keep rules correctness, hidden-card isolation, durable saves, recovery, reproducible review, ownership isolation, export/deletion, and honest claims as essential. With cloud included, real OAuth and integration tests remain essential too.

Candidates for owner-approved simplification are preference synchronization, animation-speed controls without useful animations, elaborate abandoned-session summaries, premature six-seat generalization, and supporting two difficulty labels before their distinction has value. Remove or defer a nonfunctional control instead of treating its presence as completion. These are proposals; they do not alter the current required list.

Cloud is justified if cross-device practice matters. Its implementation and operations are a substantial part of the project. If the owner's main goal is solo strategy improvement, reconsider its priority relative to useful review rather than assuming every infrastructure feature is equally urgent.

Do not add a solver, hosted AI coach, multiplayer, six-seat play, more auth providers, or paid monitoring to solve this phase's problems. The missing additions are product acceptance, lifecycle decisions, boundary tests, and decision rationale.

## Plan quality and proposed delivery structure

`PLAN.md` is a good status index; `roadmap.md` is actionable; `docs/acceptance.md` usefully distinguishes evidence from intention. However:

- M0–M6 are all in progress, M7 is blocked, and M8 has not started. No complete milestone is recorded. This indicates broad partial implementation; it does not provide a credible percentage complete.
- M1→M8 dependencies are mostly release gates now, not a useful day-to-day execution sequence. Rules, review, and cloud fixes have more specific dependencies than a single chain suggests.
- PLAN names P0-01 as next while the roadmap says tooling/P0-04 comes first. Use one ordered work queue with one active implementation task.
- Durable contracts are scheduled after the pilot even though they affect pilot history. Resolve the smallest necessary contract/lifecycle decisions earlier.
- Several documents repeat mutable status. Keep milestone state in PLAN, tasks in roadmap, evidence in acceptance, and rationale in decision records; link instead of duplicating counts everywhere.

Proposed execution checkpoints, mapped to existing gates rather than replacing them:

| Checkpoint | Observable completion | Existing work |
| --- | --- | --- |
| Product and contract decisions | Owner outcome, supported usage, archive/session semantics, and migration policy are explicit | Clarify objective; early V1-01 and P0-01 design |
| Reliable local practice | Betting/showdown, saved recovery, tab handoff, missing/error states, repeatable review | P0-01/P0-03; relevant V1-01/V1-02 |
| Reliable signed-in practice | App-generated hands, retries, session lifecycle, import, account isolation, real deletion verified | P0-01/P0-03; V1-03 |
| Honest pilot | Real URL/OAuth/cross-device smoke plus owner completes play→review without guidance | P0-02/P0-04/P0-05 |
| Verified release | Remaining rules, benchmark, browser/artifact gates, docs and tested tag | V1-01 through V1-05; M0–M8 closure |

For each checkpoint, specify one demo, acceptance cases, blockers, and a concrete artifact/commit. No invented schedule is warranted before the major lifecycle decisions and runtime calibration are resolved.

Decision records should include the need, alternatives, chosen option, costs, evidence, and a trigger for reconsideration. The current single architecture record states the choice but has little rationale. Start with engine reuse, session/import semantics, bot/review assumptions, and cloud necessity. Not every minor coding choice needs a document.

## Budget feasibility

GitHub's current documentation limits private-repository protected branches to eligible paid plans. The owner's actual entitlement was not inspected here. If unavailable, record a procedural PR/green-CI gate as a limitation; do not make payment or publication necessary to finish M0. See [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Supabase documents pausing Free projects after low activity over a seven-day period. Zero recurring cost is compatible with this small app, but not an unconditional always-on cloud promise. The local fallback and restore procedure are part of the product. See [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) and [cost control](https://supabase.com/docs/guides/platform/cost-control). No account billing settings were changed or verified in this review.

## Checks and delivery record

- Read planning, architecture, policy, operations, deployment, acceptance, implementation, tests, migration, workflows, and initial committed plan.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts`: all 20 tests in five files passed, including 12 rules tests and the 100-hand bot integration test. Initial sandbox configuration loading failed; the approved rerun outside the sandbox passed.
- No fresh lint/build/browser/database/PokerKit/benchmark or production checks. Historical CI evidence remains historical.
- Repository: https://github.com/martonkadi/poker-practice. No release URL/tag is recorded. Intended deployment: https://poker-practice.marton-kadi.workers.dev; the preceding acceptance audit recorded HTTP 404. Live status was not rechecked here.
- Remaining blockers: product/scope answers, session/import semantics and implementation gaps, provider migration connectivity, real production OAuth/sync/deletion, full acceptance and benchmark evidence.

Owner questions submitted during this review: which personal outcome matters most, and whether v1 cuts/reordering are welcome. Until answered, recommendations preserve the agreed heads-up v1 and existing gates.
