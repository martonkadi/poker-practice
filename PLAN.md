# Poker Practice MVP plan

Updated 2026-09-30 (America/Chicago). Status: `in_progress`.

## Goal and deadline

Ship a usable public web link this week: play heads-up no-limit Hold'em against one experimental bot, save hands in this browser, and review the decisions. Target Friday **October 2**, with October 3–4 as contingency. This is a target, not evidence of delivery.

The owner explicitly approved this smaller guest-only MVP on September 30. It supersedes the previous M0–M8 release scope and cloud/full-benchmark prerequisites. Unfinished previous requirements are preserved in [the archived plan](docs/archive/pre-mvp-plan-2026-09-30.md) and [archived roadmap](docs/archive/pre-mvp-roadmap-2026-09-30.md), not marked complete.

Keep the repository private, recurring costs at $0, and practice chips without cash value.

## Included

- Complete heads-up hands: 50/100 blinds, 10,000 chips per player reset each hand, alternating button.
- One neutrally named experimental opponent using the existing Standard policy; retain its version without claiming measured strength.
- Legal controls, visible bets/results, next hand, safe refresh/tab handoff, recoverable worker failure.
- Local history and decision review: visible cards, actions, pot, call price and exact pot odds. No unvalidated recommendation or EV-loss grade.
- Local export/deletion, clear browser-storage limits, useful errors, keyboard and narrow-screen usability.
- Static Cloudflare deployment, direct routes, commit identification and a tested production build.

## Deferred

Accounts, OAuth, Supabase deployment/sync/deletion, cloud quotas/import semantics, comparative difficulty, the 60,000-hand strength benchmark, sampled-equity coaching, advanced statistics, preference sync, animation controls, generalized six-seat contracts, native solving and continuous stacks. Existing backend code remains unfinished and excluded from MVP execution. No mock cloud feature will substitute for it.

## Milestones

| ID | Status | Completion gate |
| --- | --- | --- |
| MVP-1 Scope and release path | in_progress | Guest-only app/deployment path, one opponent, inactive promises removed, no Supabase build dependency. |
| MVP-2 Reliable play/storage | not_started | Betting/showdown and three-hand browser journeys; synchronous action guard; tab takeover reload; cancellation/retry; correct saved actions/session continuity. |
| MVP-3 Review and data | not_started | Saved visible state/pot odds, missing/error states, history/export/deletion, current screenshots/copy. |
| MVP-4 Publish and verify | not_started | Candidate checks, real Cloudflare URL, built/live routes and guest smoke, tested commit/tag/limitations recorded. |

Ordered tasks: [roadmap.md](roadmap.md). Deployment access can be checked independently of local repairs.

## Release checks

Run lint, TypeScript, existing unit/integration/rules tests and production build (`pnpm check` or documented direct Node equivalents), plus the independent PokerKit reference. Add regressions for changed betting/recording/recovery. Exercise the built artifact: full betting/showdown, three consecutive hands, refresh, rapid input, worker retry/cancellation, advanced tab takeover, missing review, export/deletion, keyboard and 390px layout. Adapt/run the three-browser suite.

Smoke the live URL and direct routes. Verify no auth/cloud calls or privileged credentials. Existing hidden-card isolation and conservation remain mandatory. The full strength benchmark is deferred, not passed.

## Evidence and risks

Baseline `4ac8b7d`: 20 unit/integration tests and TypeScript passed September 30. Historical evidence: [acceptance.md](docs/acceptance.md). No MVP release exists yet; last recorded intended-site response was 404.

MVP risks: action/tab/worker recovery, incomplete browser journeys, saved call/all-in representation, local tooling, unverified Cloudflare access. Supabase IPv6/OAuth issues are deferred cloud blockers. Browser data can be lost on storage clearing; export and honest copy are required. Localhost does not count as a delivered web MVP.

## Decisions

- September 30: owner prioritizes this week's MVP and allows revising prior decisions.
- September 30: owner approves a public link, one experimental bot, local hands/review; accounts and cross-device sync deferred.
- Preserve useful implementation; reduce scope rather than rewrite. Archive prior gates without claiming completion.

## Delivery

Repository: https://github.com/martonkadi/poker-practice (private).
Intended app: https://poker-practice.marton-kadi.workers.dev (unverified).
Only create an MVP prerelease at the tested deployed commit after MVP-4 passes. Record exact checks, URLs and limitations.
