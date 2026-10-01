# Poker Practice MVP plan

Updated 2026-10-01 (America/Chicago). This file is the only place that records milestone status. `roadmap.md` and `README.md` link here and carry no status values. Release state: not delivered. Candidate_Commit `911e9e90d398e4b8a7f290423434e05edea973ff` is superseded: its Deploy_Workflow run failed on 2026-10-01 at the browser suite (`/about` overflowed the 390 px viewport on the Linux runner), so `wrangler deploy` did not run. The new Candidate_Commit `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` carries the layout fix. It passed every local Release_Check and the PokerKit reference (7 fixtures, 0 mismatches) on 2026-10-01. Its deployment, live smoke and prerelease are not run yet.

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
- Commit: `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (Candidate_Commit on `release/guest-mvp`; supersedes `911e9e9`).
- Evidence (2026-10-01, clean tree at the Candidate_Commit, see [Candidate_Commit Release_Checks](#candidate_commit-release_checks)):
  - lint: pass
  - typecheck: pass
  - production build: pass
  - check:dist: pass (entry chunk 467,530 bytes ≤ 500,000)
  - Deploy_Workflow run on `9d15c68`: not run (Owner dispatch pending; the run on superseded `911e9e9` failed, see MVP-4)

### MVP-2 Reliable play/storage

- Status: in progress (2026-10-01)
- Gate: betting/showdown and three-hand browser journeys; synchronous action guard; tab takeover reload; cancellation/retry; correct saved actions/session continuity.
- Commit: `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (Candidate_Commit).
- Evidence (2026-10-01, Candidate_Commit):
  - Vitest: pass, 21 files / 75 passed / 0 failed
  - rules fixtures (`pnpm test:rules`, `packages/poker`): pass, 4 files / 30 passed / 0 failed (incl. `rules-fixtures.test.ts` 8/8)
  - three-browser suite (`pnpm test:e2e:release`, retries 0): pass, 105 passed / 0 failed (Chromium 35, Firefox 35, WebKit 35)
  - PokerKit reference (`tools/reference/pokerkit_rules.py`, pokerkit 0.7.6): pass, 7 rules fixtures compared / 0 mismatches

### MVP-3 Review and data

- Status: in progress (2026-10-01)
- Gate: saved visible state/pot odds, missing/error states, history/export/deletion, current screenshots/copy.
- Commit: `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (Candidate_Commit).
- Evidence (2026-10-01, Candidate_Commit):
  - Vitest: pass, 75 passed / 0 failed
  - three-browser suite (review, missing review, export, deletion, keyboard, 390px): pass, 105 passed / 0 failed
  - wide-font 390 px probe (ad-hoc script outside the repo against the Candidate `dist`, all 9 routes of the 390 px test, Chromium/Firefox/WebKit, default fonts and forced `"DejaVu Sans", Verdana, sans-serif`, at 390 and 320 px): pass, 108 of 108 measurements within the viewport width (maximum scrollWidth 390 at 390 px and 320 at 320 px)
  - screenshots: unchanged screens, no recapture needed for `9d15c68`. The fix only touches `.prose`, which is used only on About and is not in a screenshot, and a `max-width: 359px` rule. The screenshots are 1440 and 390 px wide. The current images were captured from the `911e9e9` `dist` on 2026-10-01 with Chromium via `tools/serve-dist.mjs`: `table-desktop.png` 1440x1288, `review-desktop.png` 1440x931, `table-mobile.png` 390x1421. They show no deferred-feature UI.

### MVP-4 Publish and verify

- Status: in progress (2026-10-01)
- Gate: candidate checks, real Cloudflare URL, built/live routes and guest smoke, tested commit/tag/limitations recorded.
- Commit: `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (Candidate_Commit; supersedes `911e9e9`).
- Evidence:
  - local Release_Checks on the clean Candidate_Commit `9d15c68`: pass (2026-10-01; lint, typecheck, Vitest, test:tools, rules fixtures, build, check:dist, three-browser suite 105/105, wide-font 390 px probe 108/108)
  - PokerKit reference on the Candidate_Commit `9d15c68`: pass (2026-10-01; 7 rules fixtures compared, 0 mismatches)
  - Deploy_Workflow on Candidate `9d15c68`: not run (Owner dispatch pending from `deploy/9d15c68`; see [Deploy dispatch ref convention](#deploy-dispatch-ref-convention))
  - release branch push for superseded `911e9e9`: done (2026-10-01; `git push -u origin release/guest-mvp` created the new remote branch at `b6fe332a46f2e88c052f6b7b9686a58df085d5fd`, which contains the Candidate_Commit plus evidence commits only; secret re-check of all 5 commits since `4ac8b7d` found no credential files and no key/token content)
  - `ci.yml` run on the pushed branch (`911e9e9` plus evidence commits): result not available (run URL not available; see the `ci.yml` run result gate). `ci.yml` also builds with the full SHA, so it probably failed the same 390 px test. This was not verified. Owner can view it at https://github.com/martonkadi/poker-practice/actions?query=branch%3Arelease%2Fguest-mvp
  - Deploy_Workflow on Candidate `911e9e9`: fail (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36937212698, dispatched by the Owner on `deploy/911e9e9`). Step "Browser suite (Chromium, Firefox, WebKit) on dist" (`pnpm test:e2e:release`): 102 passed, 3 failed. The failing test was `tests/e2e/data-layout.spec.ts` › "every route fits a 390 px viewport without horizontal page overflow" in all three browsers, error `/about scrollWidth` 426 > 390. `wrangler deploy` was not run, the Live_Site is unchanged and the deployment is not delivered. Candidate `911e9e9` is superseded (see [Superseded candidates](#superseded-candidates)).
  - live smoke (`pnpm smoke:live`): not run
  - `v0.1.0-rc.1` prerelease: not run
- Deployment: not delivered.

## Release checks

Run lint, TypeScript, existing unit/integration/rules tests and production build (`pnpm check` or documented direct Node equivalents), plus the independent PokerKit reference. Add regressions for changed betting/recording/recovery. Exercise the built artifact: full betting/showdown, three consecutive hands, refresh, rapid input, worker retry/cancellation, advanced tab takeover, missing review, export/deletion, keyboard and 390px layout. Adapt/run the three-browser suite.

A check counts as passed only when it exits 0 with zero failed tests and retries disabled. A check that cannot run locally is recorded here with its exact error, then run in GitHub Actions on the same Candidate_Commit SHA with the run URL and result recorded before deployment.

Smoke the live URL and direct routes. Verify no auth/cloud calls or privileged credentials. Existing hidden-card isolation and conservation remain mandatory. The full strength benchmark is deferred, not passed.

### Candidate_Commit Release_Checks

Candidate_Commit `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` on `release/guest-mvp`, run locally on 2026-10-01 (Windows, Node 24.20.0, pnpm 12.6.0) from a clean `git status`. The only uncommitted files were the two Kiro spec tracking files under `.kiro/specs/`, which are not part of the build. Build env matched `deploy.yml`: `VITE_SUPABASE_URL=''`, `VITE_SUPABASE_PUBLISHABLE_KEY=''`, `VITE_APP_ENV=production`, `VITE_GIT_COMMIT=<Candidate SHA>` (the SHA is embedded in the entry chunk). `pnpm check` exited 0; the browser suite then ran against that same `dist` with no rebuild and retries 0. The tree was still clean afterwards.

| Check | Command | Result | Passed | Failed |
| --- | --- | --- | --- | --- |
| lint | `pnpm lint` (in `pnpm check`) | pass | n/a | 0 errors |
| typecheck | `pnpm typecheck` (in `pnpm check`) | pass | n/a | 0 errors |
| Vitest (unit/integration, property and rules tests) | `pnpm test` (in `pnpm check`) | pass | 75 (21 files) | 0 |
| tool tests | `pnpm test:tools` (in `pnpm check`) | pass | 29 | 0 |
| rules fixtures | `pnpm test:rules` (`packages/poker`) | pass | 30 (4 files; `rules-fixtures.test.ts` 8) | 0 |
| production build | `pnpm build` (in `pnpm check`) | pass | n/a | n/a |
| check:dist | `pnpm check:dist` (in `pnpm check`) | pass (entry-size, cloud-code, test-hook, inline-markup, headers) | n/a | n/a |
| three-browser suite | `pnpm test:e2e:release` (retries 0) | pass | 105 (Chromium 35, Firefox 35, WebKit 35) | 0 |
| PokerKit reference | `python tools/reference/pokerkit_rules.py` | pass (exit 0) | 7 rules fixtures compared (plus built-in blind/limp/min-raise/fold/all-in/side-pot asserts) | 0 mismatches |
| wide-font 390 px probe (ad-hoc, outside the repo) | Playwright script against the same `dist`, forced `"DejaVu Sans", Verdana, sans-serif` and default fonts, 390 and 320 px | pass | 108 measurements (9 routes × 3 browsers × 2 fonts × 2 widths) | 0 |

Entry chunk: `/assets/index-CqHHDFVU.js`, 467,530 bytes (limit 500,000). It embeds the full Candidate SHA.

PokerKit reference: run 2026-10-01 at Candidate_Commit `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (clean tree) with Python 3.14.7 and `pokerkit==0.7.6`, in the existing virtualenv outside the repository (`%LOCALAPPDATA%\poker-pokerkit-venv`, installed via `python -m pip install --require-hashes --no-deps -r tools/reference/requirements.txt`). Output: `7 rules fixtures compared, 0 mismatches`.

Superseded results for `911e9e90d398e4b8a7f290423434e05edea973ff` (2026-10-01): the same local checks passed on Windows, entry chunk `/assets/index-B-oJAD1B.js` 467,529 bytes, and PokerKit found 7 fixtures and 0 mismatches. Its Deploy_Workflow browser suite then failed on Linux (see [Superseded candidates](#superseded-candidates)).

### Superseded candidates

- `911e9e90d398e4b8a7f290423434e05edea973ff` (2026-10-01): superseded. Local Release_Checks passed on Windows, but the Deploy_Workflow run https://github.com/martonkadi/poker-practice/actions/runs/36937212698 failed at "Browser suite (Chromium, Firefox, WebKit) on dist" with 102 passed / 3 failed (`/about scrollWidth` 426 > 390 in Chromium, Firefox and WebKit). `wrangler deploy` did not run, so this candidate was not delivered.
  - Root cause: the About page prints the full 40-character build SHA in a `.prose` paragraph. A hex SHA is one unbreakable word. At a 390 px viewport the page has 358 px of content width (16 px padding each side). The SHA is about 351 px wide in the Windows fallback fonts, so it fits. In wider sans-serif fallbacks such as DejaVu Sans, which is common on Linux runners, it is about 407–410 px wide, and its text run ends at 423–426 px. Reproduced locally by forcing `"DejaVu Sans", Verdana, sans-serif`: `/about` scrollWidth was 423 in all three browsers. No other route overflowed at 390 px.
  - Fix: `overflow-wrap: anywhere` on `.prose` in `apps/web/src/styles.module.css`, so the SHA wraps inside the paragraph. The displayed value stays the full SHA. The same probe found one more overflow, at a 320 px viewport only: the `/play` bet row's min-content was wider than the panel (scrollWidth 337–342). A `max-width: 359px` rule now lets that row wrap. Neither rule changes layout at the 390 px and 1440 px screenshot sizes with the default fonts.

### Deploy dispatch ref convention

The Owner dispatches the Deploy_Workflow from a branch named `deploy/<first 7 characters of the Candidate SHA>` that points exactly at the Candidate_Commit, not at a later evidence commit. The agent creates and pushes that branch without checking it out, and confirms with `git ls-remote origin refs/heads/deploy/<short-sha>` that it equals the full Candidate SHA. The run's first step prints `github.sha`, which must equal the Candidate SHA (Req 11.8). Old `deploy/*` refs are left in place.

### Evidence commit rule (confirmed by the Owner 2026-10-01)

Commits that touch only `PLAN.md`, `docs/screenshots/*` or the Delivery_Report are evidence commits. They may land after the Candidate_Commit passes, and they are never deployed or tagged. Screenshots are captured from the Candidate_Commit's `dist` before the evidence commit. Any other file change after the Release_Checks pass creates a new Candidate_Commit, and all Release_Checks must be rerun on it (Req 10.9).

## Evidence and risks

Baseline `4ac8b7d`: 20 unit/integration tests and TypeScript passed September 30. Historical evidence: [acceptance.md](docs/acceptance.md). No MVP release exists yet; last recorded intended-site response was 404.

Preservation commit `da3ed2fc292ed0d874522e80aa99b0c9ef47de2f` on `release/guest-mvp` (2026-09-30), measured on the untouched tree against the preview build before any change: Vitest 23/23 passed, Playwright Chromium 11/11 passed, no failing tests.

Working-tree evidence (2026-10-01, local, uncommitted, so no SHA): `pnpm check` passed (lint, typecheck, Vitest 21 files / 75 tests, build, check:dist entry chunk 467,506 bytes ≤ 500,000); `pnpm test:e2e:release` passed 105/105 (Chromium 35, Firefox 35, WebKit 35), retries 0. Superseded by the [Candidate_Commit Release_Checks](#candidate_commit-release_checks) on `911e9e90d398e4b8a7f290423434e05edea973ff`.

MVP risks: action/tab/worker recovery, incomplete browser journeys, saved call/all-in representation, local tooling, unverified Cloudflare access. Supabase IPv6/OAuth issues are deferred cloud blockers. Browser data can be lost on storage clearing; export and honest copy are required. Localhost does not count as a delivered web MVP.

## Decisions

- September 30: owner prioritizes this week's MVP and allows revising prior decisions.
- September 30: owner approves a public link, one experimental bot, local hands/review; accounts and cross-device sync deferred.
- Preserve useful implementation; reduce scope rather than rewrite. Archive prior gates without claiming completion.
- October 1: Owner confirmed the evidence commit rule above.
- October 1: Owner authorized running git with a per-command `-c safe.directory=C:/Users/marto/projects/poker` override (no git config file changed).

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
- Gate: `ci.yml` run result for `release/guest-mvp` — blocked (2026-10-01)
  Step: local `gh run list --branch release/guest-mvp` (gh unavailable); unauthenticated GET https://api.github.com/repos/martonkadi/poker-practice/actions/runs?branch=release/guest-mvp
  Error: Response status code does not indicate success: 404 (Not Found).
  Run: not available (Owner view: https://github.com/martonkadi/poker-practice/actions?query=branch%3Arelease%2Fguest-mvp)
  Commit: b6fe332a46f2e88c052f6b7b9686a58df085d5fd
  Owner action: Report the `ci.yml` run URL and result for this push, or provide authenticated gh access so it can be read. The run is not counted as passed until recorded.
