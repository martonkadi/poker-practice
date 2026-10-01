# Poker Practice implementation plan

Status: `in_progress` (audited 2026-09-29, America/Chicago). Current work: M3/M5 session correctness and M7 connection diagnosis. Next unfinished task: reproduce and fix multi-hand session timestamp/configuration continuity (`P0-01` in [roadmap.md](roadmap.md)); investigate the deployment's IPv6 failure alongside that fix. This document is the implementation source of truth.

The owner selected an unannounced public-URL pilot after critical fixes, followed by completion of every v1 release gate. Later work prioritizes stronger heads-up strategy and review. The pilot does not complete M7/M8 or waive required v1 tests. This audit changes documentation only; it does not restart deployment or the declined exploratory benchmark.

## Objective

Product/architecture review (2026-09-30): [project review](docs/project-review.md) records proposed priority and scope improvements, newly identified session-quota/import lifecycle issues, and fresh passing TypeScript/20-test results. Recommendations are pending owner discussion; no milestone gate or agreed scope is waived. Resolve the lifecycle decisions alongside P0-01 before treating pilot history as durable.

Deliver a private-repository, zero-recurring-cost heads-up no-limit Hold'em practice site. A guest must be able to play complete 100bb hands against experimental Easy and Standard bots, review decisions, and retain local history. Signed-in users must be able to synchronize completed hands through Supabase. The game uses practice chips only. The production frontend is static on Cloudflare. The bot is a documented heuristic, never described as GTO optimal.

Defaults: 50/100 blinds, 10,000-chip starting stacks reset each hand, no rake or antes, alternating button, one human and one bot. No real money, multiplayer, six-seat UI, continuous-stack cash play, native solver, or paid service in v1. Keep the repository private until the owner explicitly changes its visibility. First-party code is MIT licensed.

## Milestones

Statuses are `not_started`, `in_progress`, `blocked`, and `complete`. Mark a milestone complete only after its gate passes.

| ID | Status | Work and gate |
| --- | --- | --- |
| M0 Bootstrap | in_progress | Private remote is pushed and clean-checkout CI passed. Branch protection and confirmation of no paid Actions overage remain (`P0-04`). |
| M1 Rules | in_progress | 12 rules tests, 100 passive hands, three-/six-seat upstream fixtures and PokerKit checks pass. Owned adapter types, numeric seat/settlement contracts, fuller independent fixtures and randomized legal-action coverage remain (`V1-01`). Depends on M0. |
| M2 Bots | in_progress | Heuristics, worker and basic fairness/integration tests exist. Versioned configuration, cancellation/recovery coverage and the full 10,000-pair-per-opponent benchmark remain (`V1-04`). Depends on M1. |
| M3 Play | in_progress | Guest UI/recovery and 100 automated bot hands pass existing tests. Multi-hand session/configuration bugs, safe action/two-tab handling, missing session/accounting controls and full manual smoke remain (`P0-01`, `P0-03`, `V1-02`). Depends on M2 for final gate. |
| M4 Review | in_progress | History, decision-frame review, statistics and import/export exist. Reproducible equity/policy probabilities, full event review, summaries/preferences and broader data/hindsight tests remain (`V1-02`). Depends on M3. |
| M5 Cloud | in_progress | Local Supabase migration and existing two-user authorization/sync suite passed in GitHub CI. Real Google/cross-device sync, Edge Function deletion, full quota matrix and app-level session continuity remain (`P0-01`, `P0-03`, `V1-03`). Depends on M4 for final gate. |
| M6 Quality | in_progress | All 12 tests in the three-browser release suite passed in the attempted deployment. Broader recovery/error/accessibility cases, built-artifact checks and multi-street latency remain (`V1-04`, `V1-05`). Depends on M5 for final gate. |
| M7 Deployment | blocked | Providers configured; `supabase link` passed, `db push` failed on IPv6, so deletion function and Cloudflare were skipped. Fix free session-pooler connection and run live verification (`P0-02`, `P0-05`). Final gate depends on M6. |
| M8 Handoff | not_started | No release tag exists. Requires all v1 gates, benchmark report, final docs, deployed commit and operating handoff (`V1-05`). Depends on M7. |

## Checklist

- [x] Pin dependencies/lockfile and pass existing checks/build.
- [x] Push private GitHub remote and verify clean-checkout `check` and `database` CI jobs.
- [x] Record owner provider setup and verify GitHub production setting names/public project URL.
- [x] Inspect the interrupted deployment and reconcile status documentation with evidence.
- [ ] Configure branch protection, confirm $0 billing controls and restore reliable local tooling (`P0-04`).
- [ ] Complete multi-hand/cloud continuity, lost-acknowledgment and cross-device regressions (`P0-01`).
- [ ] Complete action races, tab takeover, worker recovery, auth outage and deletion endpoint tests (`P0-03`).
- [ ] Resolve free IPv4 session-pooler connectivity and verify migration state (`P0-02`).
- [ ] Deploy an unannounced test and verify real guest/OAuth/multi-hand sync/deletion (`P0-05`).
- [ ] Complete owned schemas/adapter, numeric seats, independent rules/property fixtures (`V1-01`).
- [ ] Complete reproducible review, policy probabilities, session totals, preferences and remaining controls (`V1-02`).
- [ ] Complete cloud schema validation, quotas/enrollment concurrency, expiry and authorization matrix (`V1-03`).
- [ ] Finish policy/fairness/cancellation/evaluator tests and benchmark preparation (`V1-04`).
- [ ] Run the full 10,000 paired deals per opponent and record confidence bounds; use neutral labels until ordering is established (`V1-04`).
- [ ] Pass the complete browser/manual/performance and production-artifact acceptance gates (`V1-05`).
- [ ] Refresh screenshots/docs, verify release candidate, tag `v0.1.0` and deliver final report (`V1-05`).

Each roadmap task includes dependencies, owner, executable work and an explicit completion condition. Required commands remain `pnpm check`, `pnpm test:rules`, `pnpm test:e2e`, `pnpm test:e2e:release`, `pnpm test:db`, `python tools/reference/pokerkit_rules.py`, `pnpm benchmark` and `pnpm benchmark:browser`. Do not substitute the short benchmark smoke run for the full benchmark.

## Required acceptance evidence

Record commands, dates, result summaries and links in `docs/acceptance.md`. The rules gate covers action order, all-in/short raise, ties, chip conservation, multiway side pots and replay. The bot gate covers legal actions, seed reproducibility, cancellation and hidden-card isolation. The cloud gate covers auth, two-account isolation, idempotent/out-of-order uploads, pruning, expiry, offline retry and deletion. The UI gate covers 1440x900 and 390x844, keyboard play, interrupted-hand recovery, direct route loads and no stale worker actions. Benchmark Standard against Easy, random-legal and always-call over paired deals with confidence intervals; strength claims require evidence.

## Blockers

Implementation blockers: Next hand changes session start time while reusing the session ID; difficulty changes reuse fixed cloud configuration. The code and DB contract disagree even though separate unit/SQL tests pass. Broader client/backend integration, worker recovery, data contracts and review behavior remain unfinished. Shared numeric seats and owned settlement contracts are required v1 extensibility work; actual six-seat gameplay remains backlog. The full benchmark is unrun and its current sequential runner needs practical runtime/resume planning.

Provider/deployment blocker: the attempted hosted migration failed with `IPv6 is not supported on your current network`. Diagnose the free Session pooler and scoped token's Connection Pooling read access; a missing permission is plausible but unproven. Cloudflare token validity and real Google OAuth remain untested because their live steps were not reached. The expected website currently returns 404.

Execution environment: GitHub CLI is absent, but authenticated Git and REST access work through the existing sign-in outside the sandbox; no new GitHub token is needed. Docker is absent locally, but CI runs the local Supabase tests successfully. The local pnpm/Corepack path and certificate trust need repair before assuming README commands work in this shell. No browser session is connected for completing the owner's real Google sign-in. Request access through normal provider/secret-setting flows; never ask for secret values in chat or tracked files.

## Decisions

- 2026-09-28: Heads-up v1 is the delivery boundary; six-seat and native solving remain backlog.
- 2026-09-28: Keep GitHub private initially and use MIT for first-party v1, deferring AGPL solver integration.
- 2026-09-28: Static Cloudflare frontend, Supabase free backend, browser bot computation, local-first persistence.
- 2026-09-29: Pinned and patched poker-engine-ts blind accounting; the upstream preflop blind call double-charged and skipped the big blind’s option. Regression fixture and independent PokerKit reference were added.
- 2026-09-29: Production deals use a local Web Crypto rejection-sampled Fisher–Yates deck passed into the engine; deterministic RNG is injected only for tests/benchmarks.
- 2026-09-29: Production deploy is manual and migration-first. Guest-only local operation remains available without providers.
- 2026-09-29: Store bookmarks separately from immutable completed hand records so offline edits cannot conflict with idempotent hand upload retries; synchronize bookmark changes after retained hands.
- 2026-09-29: The owner chose `martonkadi/poker-practice` as the private GitHub repository name, replacing the handoff's working repository name `poker`.
- 2026-09-29: CI and local DB checks are confirmed green at `4ac8b7d`; the attempted deployment failed at database connection selection before migration, Edge Function or frontend publication.
- 2026-09-29: Owner selected an unannounced public-URL pilot after critical fixes while retaining every final v1 release gate. Prioritize stronger heads-up strategy/review after v1.
- 2026-09-29: Root `roadmap.md` now orders immediate repairs, remaining required v1 work and future milestones; `docs/roadmap.md` preserves old links.

## Evidence and PRs

Current pushed commit: `4ac8b7d2b290e287d5df0c5dbcdc9dd8dea30c6d`. [Green CI](https://github.com/martonkadi/poker-practice/actions/runs/36590954889); [failed deployment with passing release browser suite](https://github.com/martonkadi/poker-practice/actions/runs/36652432418). Dependabot PRs [1](https://github.com/martonkadi/poker-practice/pull/1), [2](https://github.com/martonkadi/poker-practice/pull/2), [3](https://github.com/martonkadi/poker-practice/pull/3), [4](https://github.com/martonkadi/poker-practice/pull/4) and [5](https://github.com/martonkadi/poker-practice/pull/5) are open; no milestone-fix PRs or release tags exist yet. Exact evidence and audit limitations are in `docs/acceptance.md`.

## Later roadmap

[roadmap.md](roadmap.md) records stronger heads-up policies, local solver, solver-backed review and study tools first, followed by continuous cash sessions and six seats. Open-source publication requires a separate owner decision. These future milestones are outside M0-M8.
