# Acceptance evidence

Local machine for the recorded development runs: Windows, Node 24.20.0, pnpm 12.6.0, Chromium from Playwright 1.63.0. Date: 2026-09-29. These are development checks, not production acceptance. The status audit below distinguishes historical results from checks performed during the planning turn.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm check` | Passed | ESLint, strict TypeScript, 20 unit/integration tests including 100 automated hands, Vite production build. Bundle warns about a 564 KB JavaScript chunk. |
| `pnpm test:rules` | Passed: 12 tests | Blind order/call, minimum raise, fold, all-in, short all-in, uncalled refund, board-only royal-flush tie, multiway side-pot and odd-chip settlement, full three-seat all-in and six-seat passive replay, 100 passive hands and conservation. |
| `python tools/reference/pokerkit_rules.py` with PokerKit 0.7.6 | Passed | Independent heads-up blind, limp, min-raise, fold and all-in reference, plus three-player main/side-pot contribution split. |
| `pnpm test:e2e` | Passed: 4 Chromium tests | Guest completes/reloads/reviews a hand, history entry, 390px viewport without horizontal scrolling, keyboard hand completion, and automatic handoff of a Web Lock from one tab to another. |
| `pnpm test:e2e:release` | Passed: 12 tests, one worker | The same four guest flows passed in Chromium, Firefox and WebKit. A first parallel run stalled three page loads on this Windows machine; sequential execution passed. |
| `pnpm benchmark --deals 5 --samples-standard 16 --samples-easy 16` | Passed harness smoke | Five paired deals per opponent, zero illegal actions. Sample size and equity sampling are far below the release benchmark; no bot-strength inference. |
| `pnpm benchmark:browser` | Passed measurement | Windows 10.0.26200, Intel i7-13620H, 16 logical CPUs, 31.7 GiB RAM, Playwright Chromium 153.0.8010.12. Thirty repeated preflop Web Worker round trips per policy using the same legal observation: Standard median 273 ms, p95 304 ms, max 364 ms; Easy median 40 ms, p95 48 ms, max 76 ms. This measures one decision shape and does not guarantee all streets or devices. |
| `pnpm exec wrangler deploy --dry-run` | Passed | Six static assets read; no provider deployment performed. |

Actual interface captures from the passing Chromium flow: [table](screenshots/table-desktop.png) and [review](screenshots/review-desktop.png). The review capture waits for sampled equity and sample count.

## Remote results verified during the status audit

Current main commit: `4ac8b7d2b290e287d5df0c5dbcdc9dd8dea30c6d`.

| Evidence | Result | What it establishes |
| --- | --- | --- |
| [CI 36590954889](https://github.com/martonkadi/poker-practice/actions/runs/36590954889) | `check` and `database` passed | Clean-checkout frozen install, existing lint/type/unit/build checks, PokerKit, Chromium, local Supabase migration and `pnpm test:db`. |
| [Deployment 36652432418](https://github.com/martonkadi/poker-practice/actions/runs/36652432418), started 2026-09-30 00:52:56 UTC (September 29 locally) | Failed at `pnpm exec supabase db push --linked` | `pnpm check`, all 12 three-browser release tests (38.6 seconds) and `supabase link` passed. Migration failed with `IPv6 is not supported on your current network`. Edge Function and Wrangler deploy steps were skipped. |
| GitHub repository/branch/tag/PR API reads | Private; main unprotected; no tags; five open Dependabot PRs | Repository status is verified; required branch protection and final release remain unfinished. |
| Production environment settings, checked in preceding turn | Five expected secret names and two variable names present | Public Supabase URL matches project `epivjibibkvzdvazpujv`. Presence does not prove Cloudflare credentials or OAuth configuration work. |
| HTTP GET of `https://poker-practice.marton-kadi.workers.dev` during audit | 404, no application root | No app was reachable at the intended production address. |
| `node --import tsx tools/benchmarks/run.ts --deals 5`, preceding turn | Completed at 2,048 Standard / 512 Easy samples; zero illegal actions | Five pairs against each of three opponents (30 hands total). Smoke only; confidence intervals do not establish ordering. No full benchmark was started. |

The subsequent proposed 1,000-pair/16-sample exploratory run was declined before execution. It contributes no evidence. The planning audit did not rerun app tests or trigger another deployment.

## Limits of the passing tests and source findings

- The DB harness uses two local password-based fixture accounts with Google-only enrollment temporarily disabled. It tests selected owner isolation, direct-write denial, sequence/retry/conflict accounting, wrong producing device, an expired start, two-hand retention, bookmark pruning and admin deletion cascade. It does **not** verify real Google OAuth, the Edge Function deletion endpoint, atomic enrollment or the full byte/session quota matrix.
- The release browser suite runs four guest scenarios in each browser against Vite's development server. It does **not** establish production-build correctness, signed-in multi-hand sync, recovery on every street, or complete cloud-error coverage.
- The 100-hand bot integration run uses 16 equity samples per decision. It proves the tested legal-action/conservation behavior, not full-sampling strategy strength.
- Source audit: `Play.startNew` creates a new `startedAt` for Next hand while preserving session ID; `start_sync_session` rejects a changed start timestamp. Difficulty changes also reuse a fixed-configuration cloud session. Reproduce and repair with application/backend regressions (`P0-01`).
- Source audit: review resamples equity and uses `chooseAction(..., () => 0.5)`; it does not yet report reproducible policy probabilities. Completed records contain decision frames rather than complete canonical hand events. The animation-speed value has no corresponding CSS behavior.
- Source audit: public adapter state exposes the upstream engine type and actors are still `hero`/`bot`. Numeric seat and owned settlement contracts required by v1 remain unfinished despite passing upstream multiway fixtures.

These source findings are not newly executed test results. [roadmap.md](../roadmap.md) gives reproduction tasks, dependencies and completion gates.

**Still required:** critical session/recovery fixes, free IPv4 migration connection, real Google/cross-device multi-hand sync and deletion, full server validation/quota/concurrency cases, owned contract/rule coverage, reproducible review and missing controls, the 10,000-pair/full-sampling benchmark, wider browser latency/quality checks, production-build/live verification, and final release tag/report. No v0.1.0 release exists.
