# Poker Practice roadmap

Updated: 2026-09-29 (America/Chicago). Status: `in_progress`.

This roadmap orders the next implementation work. [PLAN.md](PLAN.md) owns the v1 requirements and milestone status; [acceptance evidence](docs/acceptance.md) records what actually passed. Task statuses are `not_started`, `in_progress`, `blocked`, and `complete`. A passing screen or mocked integration is not a completed gate.

## Decisions made with the owner

- First deployment is an **unannounced test at a public URL**, after critical correctness and data-safety fixes. It is not the final v0.1.0 release or a private deployment.
- After verified v1, prioritize **stronger heads-up strategy and review** ahead of continuous cash sessions and six seats.
- Keep the repository private and recurring infrastructure spending at $0. Do not buy an IPv4 add-on, domain, compute, or paid monitoring to remove a blocker.
- Keep the original full benchmark and acceptance gates for the final v1 release. Early testing does not waive them.
- This planning audit does not start a new deployment, merge dependency upgrades, or launch a long benchmark. The attempted exploratory benchmark in the preceding turn was declined and did not run.

## Verified starting point

| Area | Evidence and current boundary |
| --- | --- |
| Repository | Private [martonkadi/poker-practice](https://github.com/martonkadi/poker-practice), main commit `4ac8b7d2b290e287d5df0c5dbcdc9dd8dea30c6d`; clean working tree before this documentation audit. |
| CI | [Run 36590954889](https://github.com/martonkadi/poker-practice/actions/runs/36590954889) passed both `check` and `database`: install, checks/build, PokerKit, Chromium, local Supabase migrations and the existing authorization/sync suite. |
| Deployment attempt | [Run 36652432418](https://github.com/martonkadi/poker-practice/actions/runs/36652432418) passed checks, all 12 Chromium/Firefox/WebKit tests, and `supabase link`. `db push --linked` failed with an IPv6 connectivity error before migration application. Edge Function and Cloudflare steps were skipped. |
| Intended website | `https://poker-practice.marton-kadi.workers.dev` returned HTTP 404 during this audit. There is no verified app deployment. |
| Provider configuration | Owner completed setup. Five secret names and two public variable names were verified in GitHub's `production` environment. Supabase URL matches project `epivjibibkvzdvazpujv`. This does not prove all credentials, OAuth redirects, or billing settings work. |
| Product | Guest play, saved-hand recovery, history, review, progress and import/export exist. Local and CI tests cover a useful subset, not the complete original acceptance matrix. |
| Benchmark | Five pairs per opponent completed with 2,048/512 samples in the previous turn, with no illegal actions. That is only a harness smoke test. The 10,000-pair-per-opponent benchmark has not run. |
| Repository governance | `main` is unprotected; no release tags exist. Five Dependabot PRs are open. Defer broad upgrades until baseline release failures are resolved. |

## Immediate actions: get to a trustworthy pilot

These are implementation tasks, not requests to recreate the provider accounts.

Execution order: first complete the tooling/branch setup in P0-04, then P0-01 and the independent P0-02 connection diagnosis, then P0-03 and the remaining P0-04 controls. P0-05 is the first live deployment. Its production checks finish the preparation work in P0-02/P0-03; they are not prerequisites for deploying the first candidate. Final milestone dependencies still apply to declaring M0-M8 complete.

### P0-01 — Repair session continuity and cloud upload correctness

Status: `not_started`. Owner: implementing agent. Depends on: current green CI.

Source inspection found that `Play.startNew` retains the session ID for Next hand but assigns a new `startedAt`. The database rejects a different start timestamp for an existing session. Difficulty changes also retain the same session even though its cloud policy configuration is fixed. These are source-confirmed incompatibilities; a browser/backend reproduction is still required.

- [ ] Add a regression that completes and uploads three consecutive hands in one session. Preserve the original session start timestamp; require acknowledged sequences 0, 1, 2 and exactly three aggregate increments.
- [ ] Make a between-hand policy change visibly update the selector and start an appropriate new producing session. Preserve button alternation independently of a newly reset cloud sequence.
- [ ] Test lost acknowledgment/retry and ensure local plus cloud progress totals do not temporarily double-count the same hand.
- [ ] Verify a second device can read retained history but starts a new producing session to play.
- [ ] Preserve outbox data on errors, and make expired-session recovery actionable. An expired session must not block all unrelated valid sessions indefinitely.

Gate: app-level regression plus real local Supabase RPC assertions pass for these flows; cloud configuration and counts remain consistent across reloads.

### P0-02 — Resolve the migration connection without paid infrastructure

Status: `blocked` on provider connection diagnosis. Owner: implementing agent, with owner assistance only for settings inaccessible through the execution environment. Can be investigated alongside P0-01.

Observed error: `IPv6 is not supported on your current network`. `supabase link` succeeded, so do not assume the password or project ref is wrong. The reason no usable IPv4 pooler connection was retained is not yet proven.

- [ ] Check whether the scoped Supabase token includes **Connection Pooling: Read**. The earlier setup checklist did not include this permission; verify the actual API response before treating it as the root cause.
- [ ] Retrieve the project's **Session pooler** endpoint from Supabase Connect or the authorized API. Use the actual hostname and port 5432; do not guess the region or use transaction-pooling port 6543 for migrations.
- [ ] Make migration connection selection explicit in the deployment workflow. If a full database URL is needed, store it only as a GitHub secret and encode credentials correctly; never print it.
- [ ] Add an early connection preflight and inspect remote migration history before writing. Prove the initial migration is pending or already acknowledged; do not reset the hosted database.
- [ ] Run a migration dry run and then apply the reviewed migration during the pilot deployment. Re-running deployment must not recreate tables or erase data.

Preparation gate: authenticated connection and migration dry run succeed through the free session pooler. During P0-05, apply the migration, verify expected schema/functions/grants, and confirm a second migration check reports no unexpected work.

References: [Supabase IPv4/IPv6 compatibility](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP), [session pooling](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO), [token permissions](https://supabase.com/docs/guides/platform/personal-access-tokens). Pooler permission is a diagnostic hypothesis, not a confirmed cause.

### P0-03 — Close pilot reliability and account-safety gaps

Status: `not_started`. Owner: implementing agent. Depends on: P0-01 for end-to-end cloud scenarios.

- [ ] Guard action commits with a synchronous in-flight/sequence check; test rapid clicks and keyboard repeats cannot apply two actions to one decision.
- [ ] Reload active state when a waiting tab acquires the Web Lock. Test takeover after the first tab has advanced several actions, not just an empty session.
- [ ] Recover from worker timeout/crash by terminating/recreating the worker when needed; Retry must work. Cancel obsolete requests on navigation and session changes; test that late replies cannot mutate the new hand.
- [ ] Verify authenticated account deletion through the **Edge Function**, including CORS preflight and the headers actually sent by supabase-js. Current local tests call the admin deletion API directly and do not exercise this endpoint.
- [ ] Review hosted Edge Function API-key/JWT compatibility; support current Supabase keys with secrets confined to server runtime. Test invalid, missing and another user's credentials cannot target an arbitrary account.
- [ ] Prove guest play remains reachable when Supabase is unavailable; auth initialization and rejected requests must not leave the entire app indefinitely loading.
- [ ] Audit the production bundle for privileged credentials and exercise anonymous/foreign-account access against local RLS/grants; repeat the relevant non-destructive checks after deployment in P0-05.

Preparation gate: targeted regression tests pass and a disposable local-backend account can delete its own records through the Edge Function and clear only its local namespace. Repeat the real Google/deployed endpoint flow in P0-05. User authentication is performed through normal sign-in, never by pasting credentials into chat.

### P0-04 — Repository and release controls

Status: `not_started`. Owner: implementing agent; account owner confirms billing controls.

- [ ] Enable main-branch protection where available: required `check` and `database` results, no second reviewer for this solo project, squash merges and branch cleanup.
- [ ] Use a feature branch and PR for each bounded fix. Require green checks on the candidate revision before merging or deploying it.
- [ ] Add useful failure artifacts with three-day retention and keep minimum permissions, cancellation and timeouts. Keep expensive release/benchmark work out of routine PR checks where it is not necessary.
- [ ] Confirm GitHub included-use limits/no paid overage and both providers' Free plans. Do not infer billing settings from the existence of credentials.
- [ ] Triage the five existing Dependabot PRs separately. Avoid mixing major TypeScript/router/action upgrades into the migration repair.
- [ ] Restore a documented usable local pnpm invocation. The prior shell could find Node but not pnpm; Corepack encountered a certificate-trust error. Use supported system CA trust if needed, never disable TLS validation. Docker remains optional locally because CI can run the real local Supabase gate.

Gate: a fix PR demonstrates required CI, the deployment target is explicit, and the owner has a zero-dollar usage procedure.

### P0-05 — Unannounced live test

Status: `not_started`. Owner: implementing agent + owner for real Google sign-in. Depends on: P0-01 through P0-04 pilot gates.

- [ ] Use neutral policy labels until ordered strength is demonstrated; keep immutable `easy-v1`/`standard-v1` IDs in records. Explain experimental strategy limits without implying GTO strength.
- [ ] Deploy migrations, authenticated deletion function, then frontend at the intended workers.dev URL. Capture the commit and provider deployment identifiers.
- [ ] Test guest play and reload; direct `/history`, `/settings`, `/about` and missing-review URLs; verify 1440x900 and 390x844 layouts.
- [ ] Complete real Google OAuth back to the intended route. Test sign-out/account switching and the explicit guest-history import choice.
- [ ] Play and sync at least three consecutive hands; read them from another browser/device; verify counts, bookmarks, reconnect and a fresh producing session.
- [ ] Use a disposable tester account for deletion. Do not delete the owner's normal account as a test.
- [ ] Record each pass/fail and follow-up issue in acceptance evidence. Keep this deployment labeled as a test build and do not tag v0.1.0.

Gate: the actual URL works, the signed-in multi-hand path is verified, and every remaining limitation is recorded. This gate enables owner testing while the remaining v1 work continues.

## Finish v1 after the pilot

### V1-01 — Contracts and rules boundary (M1)

Status: `not_started` for the remaining work. Depends on: P0 fixes.

- Replace the exposed upstream `SerializableSessionState` alias with an owned adapter boundary and a versioned private recovery format. Keep upstream poker types out of UI/persistence consumers.
- Add stable numeric seat identifiers and settlement representations capable of describing up to six seats. Keep actual six-seat gameplay and strategy out of v1.
- Tighten shared schemas: safe integer chips, complete legal-action constraints, compatible game/bot/engine versions, and versioned persistent envelopes beyond completed hands. Supply migrations for existing local data.
- Normalize all-in shortcuts to canonical call or raise-to actions before recording and calculating PFR; a capped all-in call is not a preflop raise.
- Extend independently checked fixtures: called river showdown, short all-ins that do/do not reopen raising, partial calls, refunds and unequal-stack/tied side pots. Add randomized legal-action property tests and check conservation on every transition.
- Keep meaningful fixtures under `tests/fixtures` and database tests under their documented responsibility; do not add empty placeholder implementations.

Gate: `pnpm test:rules`, property tests and PokerKit reference checks agree; replay equals the original settled state; consumers no longer depend on upstream state layout.

### V1-02 — Reproducible review and complete product behavior (M3/M4)

Status: `not_started` for the remaining work. Depends on: V1-01 contract changes where applicable.

- Persist canonical events sufficient for stepping through all relevant betting/dealing/settlement states. Current review steps through saved decision frames, not a complete independent hand-record replay.
- Make review equity reproducible from a recorded seed/sample policy and the recorded frozen bot version. Current equity is resampled on each visit and policy comparison uses one arbitrary RNG value of 0.5.
- Expose the policy's action probabilities, not a single sampled action presented as a unique recommendation. Label exact arithmetic, sampled equity and heuristic frequencies separately.
- Add hindsight regression tests that change actual opponent cards/future board while preserving the decision observation; the analysis must stay identical.
- Track session profit independently of reset stacks; display current street commitments and properly labeled bet-size presets. Confirm all-in call/raise behavior and the between-hand selector.
- Make animation-speed controls affect actual behavior; currently `data-speed` has no matching CSS rule. Preserve OS reduced-motion support and add the required explicit preference.
- Store abandoned hands/session summaries separately and exclude them from completed statistics. Add account-specific sync metadata and preference synchronization through an authorized path.
- Finish net chips/net bb and all sample-size displays, grouping by full configuration and bot version. Test statistics, import deduplication, malformed/oversized records and switching accounts.
- Make public About/privacy/notices useful without access to the private source repository.

Gate: a repeat review produces the same report; every required route/control works; statistics and import/export fixtures pass without future-card leakage.

### V1-03 — Cloud limits, data integrity and failure cases (M5)

Status: `not_started` for the remaining work. Depends on: P0-01/P0-03.

- Validate complete hand records server-side as well as in the browser. Existing DB fixtures omit fields required by the client schema, so green SQL tests do not establish full contract enforcement.
- Test 10-hand batching, nonconsecutive sequences within a batch, duplicate/lost acknowledgments, retained conflicts, 16 KiB record limit, 500-hand and 2 MiB retention, and aggregate independence.
- Test atomic concurrent enrollment at the 100-user limit, enrollment/sync switches, ten active sessions, 100 retained session rows, expiry, and retries after session pruning without recreating/recounting old data. Keep these quota/destructive fixtures isolated in the local backend.
- Cover grants and policies on every exposed table/RPC: anonymous access, two accounts, forged ownership, direct insert/update/delete and bookmark ownership.
- Exercise actual offline/reconnect behavior, service errors, sign-out and account switching in browser tests. Ensure one failed old upload does not cause data loss or uncontrolled retry loops.

Gate: local Supabase suite covers the complete matrix, with real production OAuth/sync/deletion checks recorded separately. Never run the local destructive fixture harness against production.

### V1-04 — Bot policy validation and benchmark (M2/M6)

Status: `not_started` for the remaining work. Depends on: stable V1-01 rules and policy/version contracts.

- Move thresholds/probabilities into frozen versioned policy configuration and dispatch review by recorded version. Any strategy-changing update gets a new version.
- Cover threshold boundaries, sizing, both policies' fairness, cancellation, stale replies, watchdog and repeatability at fixed sample counts. Cross-check the independent seven-card evaluator more broadly than the current few hand-class examples.
- Verify paired deals really swap positions and hole-card assignments with the same board deck. Separate deal, equity and action RNG streams for an auditable experiment.
- Make the runner resumable with checkpoints, per-opponent selection, bounded concurrency and durable JSON reports. Prove resuming does not lose or duplicate paired deals. Optimize without reducing the required equity sampling or silently changing policy behavior.
- Measure a small full-sampling runtime calibration before scheduling the long run. Use development seeds for tuning and reserve untouched seeds for final evaluation.
- Run **10,000 paired deals per opponent** (60,000 hands total) against Easy, always-call and random-legal, with Standard 2,048/Easy 512 samples. Record versions, seeds, machine, counts, illegal actions, latency and paired-deal 95% confidence intervals.
- Publish an ordered difficulty claim only if Standard's lower 95% confidence bound against Easy is positive. Otherwise keep neutral labels and report the result as inconclusive; any policy change requires fresh evaluation seeds/versioning.
- Measure browser worker p95 on preflop/flop/turn/river and meaningful edge cases, alongside UI responsiveness. The existing single-observation preflop measurement is not a general guarantee.

Gate: a reproducible report contains the complete sample sizes, zero illegal actions and honest uncertainty. No hosted paid compute or long private Actions run is the default. Schedule long local runs separately from interactive debugging; the earlier declined exploratory run is not resumed automatically.

### V1-05 — Release acceptance and handoff (M6-M8)

Status: `not_started`. Depends on: all P0 and V1 tasks above.

- Complete recovery on every street, rapid-action, navigation, error/empty/loading/offline states, keyboard and two-tab handoff checks; manually smoke-test a full betting/showdown hand.
- Run `pnpm check`, `pnpm test:rules`, `pnpm test:e2e`, `pnpm test:db`, PokerKit, the three-browser release suite and full benchmark on the final candidate as appropriate. Evidence from older commits must be labeled, not silently carried forward after relevant changes.
- Verify the built production artifact and live direct routes/security headers, not only Vite's development server. Document rollback to a previous frontend version without automatically reversing database migrations.
- Refresh actual screenshots, README quickstart, environment references, provider instructions, data retention/export/deletion and usage checks. Verify links and commands.
- Close every required checklist item; squash verified PRs, tag `v0.1.0` at the tested commit, and produce the delivery report with repository/app/release URLs, exact checks, benchmark and limitations.

Gate: every required M0-M8 acceptance item passes. An unannounced working site is progress, not a substitute for this gate.

## After v1: strategy and review first

All items below are `not_started` and remain backlog until V1-05 passes. Each needs a bounded design decision before implementation.

| Order | Milestone | Dependencies | Acceptance criterion |
| --- | --- | --- | --- |
| F1 | Stronger heads-up policy research | Stable v1 observations/versioning and full baseline benchmark | For each candidate, reproduce artifact availability, license, game abstraction, memory/CPU/browser feasibility and held-out strength. Integrate only a reproducible, legally usable candidate that fits local computation or the $0 operating budget; no hosted inference dependency. |
| F2 | Stronger heads-up policy integration | F1 decision and isolated bot information sets | New bot version consistently outperforms its declared baseline on held-out paired deals with confidence intervals, legal actions and responsive worker behavior. Document where its abstraction differs from full no-limit play. This alone does not prove GTO optimality. |
| F3 | Native solver companion | Stable hand/range contracts; solver/license and resource review | Local Rust postflop solver uses explicit ranges, betting trees and abstraction, bounded memory, cancellation and independently checked solutions. Document AGPL/source-distribution obligations before integration. |
| F4 | Solver-backed review | F3 or validated compatible reference solutions | Show action frequencies/EV differences only for compatible solved spots, with ranges, tree, convergence and approximation metadata. Unsupported spots get no EV-loss score. |
| F5 | Study tools | Stable replay; F2/F4 where a feature needs policy/solver evidence | Repeatable situations, focused drills and range displays reproduce the same visible information without hidden-card leakage. Track drill progress separately from game results. |
| F6 | Continuous cash sessions | Verified v1 accounting; strategy labeled by supported stack depth | Persistent stacks, top-ups/rebuys and net accounting pass conservation and recovery tests. Variable-depth strategy is evaluated rather than assumed from 100bb bots. |
| F7 | Six-seat solo cash table | F6; numeric seat contracts; full multiway rules; independent multiway strategy research | Five isolated bots, rotating positions, complete side-pot UI and recovery pass. Multiway policy strength receives its own evaluation; heads-up evidence cannot establish it. |
| F8 | Open-source publication | Explicit owner decision and full dependency/solver license audit | Source/distribution obligations and notices are satisfied; change visibility only with the owner's explicit approval. |

F1 can evaluate open research engines before committing to any integration. F3 is an optional local companion rather than a mandatory server expense. Revisit future priorities after actual pilot usage; do not add empty production implementations for these items.
