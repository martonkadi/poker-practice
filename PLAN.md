# Poker Practice MVP plan

Updated 2026-10-01 (America/Chicago). This file is the only place that records milestone status. `roadmap.md` and `README.md` link here and carry no status values. Release state: not delivered (no Candidate_Commit, deployment, live smoke or prerelease yet).

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

Each milestone has exactly one status: `not started`, `in progress`, `passed`, `failed` or `blocked`. When a gate passes, fails or becomes blocked, update its entry here before starting the next gate, with the date (YYYY-MM-DD), each evidence check with its result (pass, fail or not run) and the Candidate_Commit SHA. A blocked milestone also links its Blocked_Gate entry below. A milestone is `passed` only when every evidence check passed at the same Candidate_Commit.

Ordered tasks: [roadmap.md](roadmap.md). Deployment access can be checked independently of local repairs.

### MVP-1 Scope and release path

- Status: in progress (2026-10-01)
- Gate: guest-only app/deployment path, one opponent, inactive promises removed, no Supabase build dependency.
- Commit: none; evidence is from the uncommitted working tree on `release/guest-mvp` (parent `da3ed2fc292ed0d874522e80aa99b0c9ef47de2f`).
- Evidence:
  - lint: pass (working tree)
  - typecheck: pass (working tree)
  - production build: pass (working tree)
  - check:dist: pass (working tree; entry chunk 467,506 bytes ≤ 500,000)
  - Deploy_Workflow run: not run (see Blocked gates)

### MVP-2 Reliable play/storage

- Status: in progress (2026-10-01)
- Gate: betting/showdown and three-hand browser journeys; synchronous action guard; tab takeover reload; cancellation/retry; correct saved actions/session continuity.
- Commit: none; uncommitted working tree on `release/guest-mvp`.
- Evidence:
  - Vitest including rules fixtures (`packages/poker`): pass, 21 files / 75 tests (working tree)
  - three-browser suite (`pnpm test:e2e:release`, retries 0): pass, 105/105 (Chromium 35, Firefox 35, WebKit 35) (working tree)
  - PokerKit reference (`tools/reference/pokerkit_rules.py`): not run

### MVP-3 Review and data

- Status: in progress (2026-10-01)
- Gate: saved visible state/pot odds, missing/error states, history/export/deletion, current screenshots/copy.
- Commit: none; uncommitted working tree on `release/guest-mvp`.
- Evidence:
  - Vitest: pass, 21 files / 75 tests (working tree)
  - three-browser suite (review, missing review, export, deletion, keyboard, 390px): pass, 105/105 (working tree)
  - replacement screenshots from the Candidate_Commit `dist`: not run

### MVP-4 Publish and verify

- Status: not started (2026-10-01)
- Gate: candidate checks, real Cloudflare URL, built/live routes and guest smoke, tested commit/tag/limitations recorded.
- Commit: none; no Candidate_Commit exists yet.
- Evidence:
  - Release_Checks on a clean Candidate_Commit: not run
  - Deploy_Workflow on the Candidate_Commit: not run (open Blocked gates for GitHub CLI, Cloudflare secrets and `production` environment)
  - live smoke (`pnpm smoke:live`): not run
  - `v0.1.0-rc.1` prerelease: not run
- Deployment: not delivered.

## Release checks

Run lint, TypeScript, existing unit/integration/rules tests and production build (`pnpm check` or documented direct Node equivalents), plus the independent PokerKit reference. Add regressions for changed betting/recording/recovery. Exercise the built artifact: full betting/showdown, three consecutive hands, refresh, rapid input, worker retry/cancellation, advanced tab takeover, missing review, export/deletion, keyboard and 390px layout. Adapt/run the three-browser suite.

A check counts as passed only when it exits 0 with zero failed tests and retries disabled. A check that cannot run locally is recorded here with its exact error, then run in GitHub Actions on the same Candidate_Commit SHA with the run URL and result recorded before deployment.

Smoke the live URL and direct routes. Verify no auth/cloud calls or privileged credentials. Existing hidden-card isolation and conservation remain mandatory. The full strength benchmark is deferred, not passed.

### Evidence commit rule (pending Owner confirmation)

Commits that touch only `PLAN.md`, `docs/screenshots/*` or the Delivery_Report are evidence commits. They may land after the Candidate_Commit passes, and they are never deployed or tagged. Screenshots are captured from the Candidate_Commit's `dist` before the evidence commit. If the Owner rejects this rule, every such change creates a new Candidate_Commit and all Release_Checks must be rerun on it (Req 10.9).

## Evidence and risks

Baseline `4ac8b7d`: 20 unit/integration tests and TypeScript passed September 30. Historical evidence: [acceptance.md](docs/acceptance.md). No MVP release exists yet; last recorded intended-site response was 404.

Preservation commit `da3ed2fc292ed0d874522e80aa99b0c9ef47de2f` on `release/guest-mvp` (2026-09-30), measured on the untouched tree against the preview build before any change: Vitest 23/23 passed, Playwright Chromium 11/11 passed, no failing tests.

Working-tree evidence (2026-10-01, local, uncommitted, so no SHA): `pnpm check` passed (lint, typecheck, Vitest 21 files / 75 tests, build, check:dist entry chunk 467,506 bytes ≤ 500,000); `pnpm test:e2e:release` passed 105/105 (Chromium 35, Firefox 35, WebKit 35), retries 0. These results must be rerun on the clean Candidate_Commit before they count as Release_Checks.

MVP risks: action/tab/worker recovery, incomplete browser journeys, saved call/all-in representation, local tooling, unverified Cloudflare access. Supabase IPv6/OAuth issues are deferred cloud blockers. Browser data can be lost on storage clearing; export and honest copy are required. Localhost does not count as a delivered web MVP.

## Decisions

- September 30: owner prioritizes this week's MVP and allows revising prior decisions.
- September 30: owner approves a public link, one experimental bot, local hands/review; accounts and cross-device sync deferred.
- Preserve useful implementation; reduce scope rather than rewrite. Archive prior gates without claiming completion.
- Pending Owner confirmation: the evidence commit rule above.

## Delivery

Repository: https://github.com/martonkadi/poker-practice (private).
Intended app: https://poker-practice.marton-kadi.workers.dev (not delivered; unverified).
Only create an MVP prerelease at the tested deployed commit after MVP-4 passes. Record exact checks, URLs and limitations.

## Blocked gates

Each Blocked_Gate uses this fixed format. Keep open gates here until resolved, then note the resolution date and commit.

```
- Gate: <name> — blocked (YYYY-MM-DD)
  Step: <workflow/job/step or local command>
  Error: <exact text>
  Run: <URL or "local">
  Commit: <sha>
  Owner action: <what is needed>
```

- Gate: GitHub CLI access — blocked (2026-09-30)
  Step: local `gh auth status`
  Error: gh: The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Install GitHub CLI (e.g. `winget install --id GitHub.cli`) and run `gh auth login` with access to martonkadi/poker-practice (repo, workflow scopes).
- Gate: Cloudflare secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) — blocked (2026-09-30)
  Step: local `gh secret list` and `gh secret list --env production`
  Error: not run; gh is not installed (see GitHub CLI access gate), so secret names could not be listed
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Confirm both secrets exist on martonkadi/poker-practice (repo or `production` environment); add any that are missing. Names only need confirming, not values.
- Gate: `production` environment — blocked (2026-09-30)
  Step: local `gh api repos/martonkadi/poker-practice/environments` (gh unavailable); unauthenticated GET https://api.github.com/repos/martonkadi/poker-practice/environments
  Error: Response status code does not indicate success: 404 (Not Found).
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Confirm the `production` environment exists in repository Settings → Environments (create it if missing), or provide authenticated gh access so it can be checked.
