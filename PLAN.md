# Poker Practice implementation plan

Status: `in_progress` (updated 2026-09-29). Current milestone: M1/M4 local verification. Next task: add full multiway replay and release browser coverage, then audit cloud tests when a database becomes available. Local Supabase validation is blocked by unavailable Docker; provider account access will follow after the user connects it. This document is the implementation source of truth.

## Objective

Deliver a private-repository, zero-recurring-cost heads-up no-limit Hold'em practice site. A guest must be able to play complete 100bb hands against experimental Easy and Standard bots, review decisions, and retain local history. Signed-in users must be able to synchronize completed hands through Supabase. The game uses practice chips only. The production frontend is static on Cloudflare. The bot is a documented heuristic, never described as GTO optimal.

Defaults: 50/100 blinds, 10,000-chip starting stacks reset each hand, no rake or antes, alternating button, one human and one bot. No real money, multiplayer, six-seat UI, continuous-stack cash play, native solver, or paid service in v1. Keep the repository private until the owner explicitly changes its visibility. First-party code is MIT licensed.

## Milestones

Statuses are `not_started`, `in_progress`, `blocked`, and `complete`. Mark a milestone complete only after its gate passes.

| ID | Status | Work and gate |
| --- | --- | --- |
| M0 Bootstrap | blocked | Local workspace, docs, CI and guest shell exist. Private GitHub remote and clean-clone CI require account access. |
| M1 Rules | in_progress | Adapter, 100-hand conservation/replay, board-only tie and upstream engine-level multiway/odd-chip settlement pass; PokerKit confirms the three-player main/side-pot split, but full multiway replay remains. Depends on M0 source setup. |
| M2 Bots | in_progress | Worker and policies run; full 10,000-pair benchmark and strength gate remain. Depends on M1. |
| M3 Play | in_progress | Heads-up UI, recovery, Web Locks, keyboard completion, two-tab ownership and 100 automated hands pass; manual smoke remains. Depends on M2. |
| M4 Review | in_progress | Local history, review, stats, immutable hand records, offline bookmark queue and import/export implemented; broader persistence and hindsight tests remain. Depends on M3. |
| M5 Cloud | blocked | OAuth wiring, migration, RPC and deletion code exist; local/real backend security and cross-device tests cannot run without Docker or provider access. Depends on M4. |
| M6 Quality | in_progress | Chromium desktop/mobile and keyboard/two-tab checks pass; Firefox/WebKit and measured latency remain. Depends on M5. |
| M7 Deployment | blocked | Workflow and Wrangler dry-run exist; provider credentials/production verification unavailable. Depends on M6. |
| M8 Handoff | not_started | Release tag, all gate evidence, actual URLs and final operating handoff. Depends on M7. |

## Checklist

- [x] Pin Node and pnpm, install exact workspace dependencies and lockfile; local `pnpm check` passes.
- [ ] Complete shared schemas and poker adapter reference fixtures, including multiway and tied-board accounting.
- [ ] Finish bot fairness/cancellation tests and run the full paired-deal benchmark before claiming ordered difficulty.
- [ ] Finish manual/keyboard smoke of table, recovery and single-writer behavior (100 automated hands pass).
- [ ] Finish review hindsight and persistence edge-case tests (UI and data flows implemented).
- [ ] Implement Supabase migrations, grants, policies, transactional sync RPC, OAuth and deletion.
- [ ] Run and record every gate: `pnpm check`, `pnpm test:rules`, `pnpm test:e2e`, `pnpm test:db`, full `pnpm benchmark`, PokerKit reference and release browser matrix. Partial local evidence is in `docs/acceptance.md`.
- [ ] Create private GitHub remote, verify CI, configure free providers, deploy and test production.
- [ ] Update README, screenshots, docs, release tag and final delivery report.

## Required acceptance evidence

Record commands, dates, result summaries and links in `docs/acceptance.md`. The rules gate covers action order, all-in/short raise, ties, chip conservation, multiway side pots and replay. The bot gate covers legal actions, seed reproducibility, cancellation and hidden-card isolation. The cloud gate covers auth, two-account isolation, idempotent/out-of-order uploads, pruning, expiry, offline retry and deletion. The UI gate covers 1440x900 and 390x844, keyboard play, interrupted-hand recovery, direct route loads and no stale worker actions. Benchmark Standard against Easy, random-legal and always-call over paired deals with confidence intervals; strength claims require evidence.

## Blockers

Implementation blockers: Rules adapter and active UI presently name only two actors; multiway pots are tested through the upstream settlement API and independent PokerKit pot split, but full multiway hand replay remains. The full benchmark is unrun. Local Supabase migration may need fixes after execution. These are unfinished implementation work, not accepted waivers.

External access: no GitHub credential or signed-in browser session is available; GitHub CLI is absent. Docker is absent, preventing local Supabase execution here. The user will connect GitHub, Supabase, Cloudflare and Google later. These prevent remote creation, CI evidence and production verification. No secrets should be pasted into tracked files.

## Decisions

- 2026-09-28: Heads-up v1 is the delivery boundary; six-seat and native solving remain backlog.
- 2026-09-28: Keep GitHub private initially and use MIT for first-party v1, deferring AGPL solver integration.
- 2026-09-28: Static Cloudflare frontend, Supabase free backend, browser bot computation, local-first persistence.
- 2026-09-29: Pinned and patched poker-engine-ts blind accounting; the upstream preflop blind call double-charged and skipped the big blind’s option. Regression fixture and independent PokerKit reference were added.
- 2026-09-29: Production deals use a local Web Crypto rejection-sampled Fisher–Yates deck passed into the engine; deterministic RNG is injected only for tests/benchmarks.
- 2026-09-29: Production deploy is manual and migration-first. Guest-only local operation remains available without providers.
- 2026-09-29: Store bookmarks separately from immutable completed hand records so offline edits cannot conflict with idempotent hand upload retries; synchronize bookmark changes after retained hands.

## Evidence and PRs

No PRs or remote CI results exist yet. Local commands, results and actual screenshots are in `docs/acceptance.md` and `docs/screenshots/`. Do not invent release evidence.

## Later roadmap

`docs/roadmap.md` records continuous cash sessions, independently measured stronger bots, local solver, solver-backed review, six-seat solo cash play, focused study tools and a separate repository-visibility decision. These are outside M0-M8.
