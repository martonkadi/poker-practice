# Poker Practice MVP plan

Updated 2026-10-01 (America/Chicago). This file is the only place that records milestone status. `roadmap.md` and `README.md` link here and carry no status values. Release state: prerelease published; the Delivery_Report (task 15.8) is pending. MVP-1, MVP-2 and MVP-4 passed at Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1`. MVP-3 is still in progress because its screenshots were captured from the superseded `911e9e9` build, not from the Candidate build (see MVP-3). The GitHub prerelease `v0.1.0-rc.1` was published on 2026-10-01 21:03 CDT at https://github.com/martonkadi/poker-practice/releases/tag/v0.1.0-rc.1 (prerelease, not a draft, not latest) on the existing annotated tag, which peels to the Candidate. The Owner's Deploy_Workflow run on the Candidate (dispatched from `deploy/3b431ed`) passed every step on 2026-10-01, including `wrangler deploy` (Cloudflare version `8562db59-6141-4249-859d-380f9c3f1e6d`) and the in-workflow live smoke (12/12). The agent read that run with `gh` and confirmed `headSha` and the printed `Candidate commit 3b431ed369705604feb3602d268a98aaffcaedd1` line. The agent's live smoke of `3b431ed` against https://poker-practice.marton-kadi.workers.dev passed all 12 steps on 2026-10-01 20:05 CDT (exit 0), and a manual-style product check passed 42 of 42 at 1280x720 and 390x844. `ci.yml` passed on evidence commits `343ac3f` and `a0381eb`, whose files equal the Candidate's except `PLAN.md` (see [`ci.yml` runs](#ciyml-runs-on-releaseguest-mvp)). Previous summary: Candidate_Commit `d4f22b9f8f0af432b99aa192f90fa7819c3f3189` is superseded: its Deploy_Workflow run deployed it (Cloudflare version `ca03b60e-f4bb-4361-9e2b-c380fbfa9862`), but the live smoke step failed 1 of 12 steps ("about commit"). During edge propagation Cloudflare served the old and the new version side by side. The smoke's direct fetches passed while checking the old build, because they did not verify which build the shell belonged to. A later local check found that the Live_Site now serves `d4f22b9` on every request and passes the smoke. The new Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1` makes every fetch step verify the entry script's embedded commit, and it makes the wait require 5 consecutive matching probes (see [Superseded candidates](#superseded-candidates)). It passed every local Release_Check and the PokerKit reference (7 fixtures, 0 mismatches) on 2026-10-01. Earlier Candidates `9d15c68` and `911e9e9` are also superseded.

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

- Status: passed (2026-10-01). Every evidence check below passed at Candidate_Commit `3b431ed`.
- Gate: guest-only app/deployment path, one opponent, inactive promises removed, no Supabase build dependency.
- Commit: `3b431ed369705604feb3602d268a98aaffcaedd1` (Candidate_Commit on `release/guest-mvp`; supersedes `d4f22b9`, `9d15c68` and `911e9e9`).
- Evidence (2026-10-01, clean tree at the Candidate_Commit, see [Candidate_Commit Release_Checks](#candidate_commit-release_checks)):
  - lint: pass
  - typecheck: pass
  - production build: pass
  - check:dist: pass (entry chunk 467,530 bytes ≤ 500,000)
  - Deploy_Workflow run on `3b431ed`: pass (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36947927596/job/110654137598, dispatched by the Owner on `deploy/3b431ed`; Cloudflare version `8562db59-6141-4249-859d-380f9c3f1e6d`; `headSha` and every step verified by the agent with `gh`, see MVP-4). Its "Confirm static deployment configuration" and "Release checks and production build" (`pnpm check`, including `check:dist`) steps passed with the guest-only build inputs.

### MVP-2 Reliable play/storage

- Status: passed (2026-10-01). Every evidence check below passed at Candidate_Commit `3b431ed`.
- Gate: betting/showdown and three-hand browser journeys; synchronous action guard; tab takeover reload; cancellation/retry; correct saved actions/session continuity.
- Commit: `3b431ed369705604feb3602d268a98aaffcaedd1` (Candidate_Commit).
- Evidence (2026-10-01, Candidate_Commit):
  - Vitest: pass, 21 files / 75 passed / 0 failed
  - rules fixtures (`pnpm test:rules`, `packages/poker`): pass, 4 files / 30 passed / 0 failed (incl. `rules-fixtures.test.ts` 8/8)
  - three-browser suite (`pnpm test:e2e:release`, retries 0): pass, 108 passed / 0 failed / 6 skipped (Chromium 38, Firefox 35, WebKit 35; the three Chromium-only smoke regression tests are skipped by design in Firefox and WebKit)
  - PokerKit reference (`tools/reference/pokerkit_rules.py`, pokerkit 0.7.6): pass, 7 rules fixtures compared / 0 mismatches
  - Deploy_Workflow run on `3b431ed` (GitHub Actions, run https://github.com/martonkadi/poker-practice/actions/runs/36947927596): pass. Read by the agent from the run log on 2026-10-01: "Browser suite (Chromium, Firefox, WebKit) on dist" printed `108 passed` and `6 skipped`, and "PokerKit reference check" printed `7 rules fixtures compared, 0 mismatches`.

### MVP-3 Review and data

- Status: in progress (2026-10-01). Every check below passed at `3b431ed` except the screenshot check, which has not run at the Candidate build.
- Gate: saved visible state/pot odds, missing/error states, history/export/deletion, current screenshots/copy.
- Commit: `3b431ed369705604feb3602d268a98aaffcaedd1` (Candidate_Commit).
- Evidence (2026-10-01, Candidate_Commit):
  - Vitest: pass, 75 passed / 0 failed
  - three-browser suite (review, missing review, export, deletion, keyboard, 390px): pass, 108 passed / 0 failed / 6 skipped
  - wide-font 390 px probe (ad-hoc script outside the repo against the Candidate `dist`, all 9 routes of the 390 px test, Chromium/Firefox/WebKit, default fonts and forced `"DejaVu Sans", Verdana, sans-serif`, at 390 and 320 px): pass, 108 of 108 measurements within the viewport width (maximum scrollWidth 390 at 390 px and 320 at 320 px)
  - screenshots captured from the Candidate_Commit build (Req 13.6, task 15.3): not run at `3b431ed`. The current images were captured from the superseded `911e9e9` `dist` on 2026-10-01 with Chromium via `tools/serve-dist.mjs` (evidence commit `b6fe332`): `table-desktop.png` 1440x1288, `review-desktop.png` 1440x931, `table-mobile.png` 390x1421. They show no deferred-feature UI.
    - Why the earlier "unchanged screens" reasoning is not counted as a pass (re-judged 2026-10-01): the release changes did alter these screens, which is why task 15.3 replaced them. Req 13.6 then requires the replacement to be "a capture from the Candidate_Commit production build", and the evidence commit rule says screenshots are captured from the Candidate_Commit's `dist`. `911e9e9` is not the Candidate.
    - What differs: `git diff 911e9e9 3b431ed -- apps packages` changes only `apps/web/src/styles.module.css` (from `9d15c68`): `overflow-wrap:anywhere` on `.prose`, which only About uses, and `@media(max-width:359px){.betRow{flex-wrap:wrap}}`. The Play and Review screens at 1440 and 390 px should render the same. The build commit is shown only on About. This is an inference from the diff; no capture or pixel comparison was made from the `3b431ed` `dist`.
    - To close: capture the three images from the `3b431ed` `dist` (built with the Candidate's `VITE_GIT_COMMIT`) and commit them, or a recorded byte or pixel match, as an evidence commit. This does not change the Candidate_Commit or the tag.

### MVP-4 Publish and verify

- Status: passed (2026-10-01). Every evidence check for Candidate_Commit `3b431ed` below passed: the local Release_Checks, the Deploy_Workflow run (verified by the agent from its log), `ci.yml` on the Candidate's evidence-only descendants, the live smoke, the product check, the tag and the GitHub prerelease. The entries for `d4f22b9`, `9d15c68` and `911e9e9` are superseded candidates and are not evidence for this gate. The Delivery_Report (task 15.8) is pending and is not part of this gate.
- Gate: candidate checks, real Cloudflare URL, built/live routes and guest smoke, tested commit/tag/limitations recorded.
- Commit: `3b431ed369705604feb3602d268a98aaffcaedd1` (Candidate_Commit; supersedes `d4f22b9`, `9d15c68` and `911e9e9`).
- Evidence:
  - Deploy_Workflow on Candidate `3b431ed`: pass (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36947927596/job/110654137598, dispatched by the Owner on `deploy/3b431ed`). The agent read the run with `gh` 2.102.0 on 2026-10-01 at about 21:00 CDT. `gh run view 36947927596 --json` returned `conclusion: success`, `event: workflow_dispatch`, `headBranch: deploy/3b431ed` and `headSha: 3b431ed369705604feb3602d268a98aaffcaedd1`. All 16 steps of job `deploy` were `success`, from "Print candidate commit" through "Live smoke check (Chromium)". Log lines, from `gh run view 36947927596 --log`:
    - "Print candidate commit": `Candidate commit 3b431ed369705604feb3602d268a98aaffcaedd1`
    - "Browser suite (Chromium, Firefox, WebKit) on dist": `108 passed (8.0m)`, `6 skipped`
    - "PokerKit reference check": `PokerKit reference: 7 rules fixtures compared, 0 mismatches`
    - "Deploy static assets": `Current Version ID: 8562db59-6141-4249-859d-380f9c3f1e6d`
    - "Live smoke check (Chromium)": `smoke:live: expected build served after 15.2 s: stable on 5 consecutive probes at least 3 s apart (0 of 5 probes mismatched)`, then 12 `PASS` lines and `smoke:live: PASS all 12 steps`
    - Deployed SHA = Candidate `3b431ed369705604feb3602d268a98aaffcaedd1` (Req 11.8): the run's `headSha` and printed line both equal it, and `git ls-remote origin refs/heads/deploy/3b431ed` returned the same SHA (re-checked 2026-10-01 20:01 CDT).
    - Independent Live_Site check (2026-10-01, 20:01:55–20:02:25 CDT, local, read-only Node `fetch` GETs with `NODE_OPTIONS=--use-system-ca` against https://poker-practice.marton-kadi.workers.dev): 10 probes about 3 s apart over 29.7 s, rotating `/`, `/play` and `/about`. Each probe fetched the HTML's module entry script. Result: 10 of 10 returned 200 with entry `/assets/index-Zh9Q6LmR.js` (the entry of the local Candidate build), served 200 `text/javascript` with `nosniff` and `no-referrer`. Each embedded exactly one full SHA, `3b431ed369705604feb3602d268a98aaffcaedd1`.
    - This is not the task 15.6 live smoke record; that is recorded below.
  - local Release_Checks on the clean Candidate_Commit `3b431ed`: pass (2026-10-01; lint, typecheck, Vitest 75, test:tools 36, rules fixtures 30, build, check:dist, three-browser suite 108 passed / 6 skipped / 0 failed, wide-font 390 px probe 108/108, PokerKit 7 fixtures / 0 mismatches)
  - local smoke of the `3b431ed` `dist` (2026-10-01): `pnpm smoke:live --url http://127.0.0.1:4185 --commit 3b431ed369705604feb3602d268a98aaffcaedd1` against `tools/serve-dist.mjs` printed `PASS all 12 steps`. The build was stable on 5 consecutive probes after 13.7 s, with 0 of 5 mismatched, and every fetch step's entry `/assets/index-Zh9Q6LmR.js` embedded the Candidate SHA. The e2e regression runs (`--unrouted-ms 8000`, a 10 s mixed window, and a mixed state that never ends) passed as part of the three-browser suite. Localhost does not count as the live smoke.
  - `3b431ed`'s smoke script against the Live_Site, which still serves `d4f22b9` (2026-10-01, 19:45 CDT, local): `--commit d4f22b9f8f0af432b99aa192f90fa7819c3f3189` printed `PASS all 12 steps`. The build was stable on 5 consecutive probes after 16.2 s, with 0 of 5 mismatched. All 7 fetch steps observed entry `/assets/index-BPXF_Fko.js` (200 `text/javascript`) embedding `d4f22b9f8f0af432b99aa192f90fa7819c3f3189`, and a hand completed in 3.8 s (+933 chips) with the review matching History (23 requests, 8 responses). This confirms the stricter checks pass on real Cloudflare. It is not the smoke of the new Candidate.
  - release branch push for `3b431ed`: done (2026-10-01). `git push origin release/guest-mvp` moved the remote from `3becba4` to `e31d8fa7a0f30e1b9ebdc669f9127976188b6963`, which is the Candidate plus evidence commit `e31d8fa`. The secret re-check of both new commits, and of the earlier `d4f22b9` push range `652c03a..3becba4`, found no credential file names and no key or token content. `deploy/3b431ed` was created without checkout and pushed. `git ls-remote origin refs/heads/deploy/3b431ed` returned `3b431ed369705604feb3602d268a98aaffcaedd1`, which equals the Candidate. The older `deploy/*` refs are unchanged.
  - `ci.yml` for Candidate `3b431ed` (GitHub Actions, read with `gh` 2026-10-01): pass on evidence commits `343ac3f` (run https://github.com/martonkadi/poker-practice/actions/runs/36947812346) and `a0381eb` (run https://github.com/martonkadi/poker-practice/actions/runs/36949941258). Both descend from the Candidate, and `git diff --quiet 3b431ed <sha> -- . ':!PLAN.md' ':!docs/screenshots'` exited 0 for each (only `PLAN.md` differs). Each run printed `Checking commit <its own SHA>` and logged `Tests 75 passed (75)`, `check:dist: PASS entry-size, cloud-code, test-hook, inline-markup, headers` (entry 467,530 bytes), `108 passed` / `6 skipped` and `PokerKit reference: 7 rules fixtures compared, 0 mismatches`. `ci.yml` never ran with `headSha` `3b431ed` itself: it was pushed together with `e31d8fa`, whose run was cancelled by the next push, and `deploy/*` pushes do not trigger `ci.yml`. These runs build with their own SHA as `VITE_GIT_COMMIT`, so the artifact differs from the Candidate `dist` only in the embedded commit. The Deploy_Workflow run above is the Actions run at the exact Candidate SHA. Every run is listed in [`ci.yml` runs](#ciyml-runs-on-releaseguest-mvp).
  - Deploy_Workflow on Candidate `d4f22b9`: fail (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36944049410/job/110641918075, dispatched by the Owner on `deploy/d4f22b9`). The pre-deploy checks passed. "Deploy static assets" (`wrangler deploy`) succeeded with `Current Version ID: ca03b60e-f4bb-4361-9e2b-c380fbfa9862`. The smoke step ran with `--commit ${{ github.sha }}` and matched the full 40-character SHA `d4f22b9f8f0af432b99aa192f90fa7819c3f3189` shown on `/about`, so the run's SHA equals the Candidate. The agent read this from the Owner's copy of the log; `gh` is unavailable. "Live smoke check (Chromium)" failed 1 of 12 steps:
    - The wait printed `smoke:live: expected build served after 0.4 s`.
    - All 7 fetch steps passed, each with `200 text/html, entry /assets/index-CqHHDFVU.js, headers ok`. That entry is the `9d15c68` chunk. The `d4f22b9` build's entry is `/assets/index-BPXF_Fko.js`, and the hash differs because the chunk embeds `VITE_GIT_COMMIT`. These steps therefore checked the old build and still passed.
    - "about commit" failed: `build commit d4f22b9f8f0af432b99aa192f90fa7819c3f3189 after 0.4 s, then build commit 9d15c68115aef6a486bc4f6ba36e649a4280b5bf in a fresh profile`.
    - "play hand" (3.1 s, −544 chips), "review matches history", "browser request origins" (11 requests) and "browser response headers" (8 responses) passed.
    - Result: deployed but failed. `d4f22b9` is superseded (see [Superseded candidates](#superseded-candidates)).
  - Live_Site consistency check after that run (2026-10-01, 19:14–19:16 CDT, local, read-only Node `fetch` GETs against https://poker-practice.marton-kadi.workers.dev): 20 probes about 3 s apart over 63 s, rotating `/`, `/play` and `/about`. Each probe fetched the HTML's entry module script and searched it for both SHAs. Result: 20 of 20 served entry `/assets/index-BPXF_Fko.js` embedding `d4f22b9f8f0af432b99aa192f90fa7819c3f3189`, and 0 served `9d15c68`. The old entry path `/assets/index-CqHHDFVU.js` now returns the SPA fallback (200 `text/html`), so the old version no longer answers. The live entry script is `text/javascript` with `nosniff` and `no-referrer`.
  - live smoke of `d4f22b9` re-run locally after that check (2026-10-01, 19:16 CDT): the unchanged script `pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit d4f22b9f8f0af432b99aa192f90fa7819c3f3189` printed `PASS all 12 steps`. The wait passed after 0.9 s, all 7 fetch steps observed entry `/assets/index-BPXF_Fko.js`, and a hand completed in 4.3 s (−233 chips) with the review matching History (11 requests, 8 responses). The strengthened script in the working tree then also printed `PASS all 12 steps` against the Live_Site. Its wait passed after 18.9 s with 5 consecutive matching probes and 0 of 5 mismatched, and every fetch step's entry script embedded `d4f22b9f8f0af432b99aa192f90fa7819c3f3189`. Neither run counts as the Deploy_Workflow smoke result.
  - release branch push for `d4f22b9`: done (2026-10-01 19:02 CDT; not recorded at the time). `git push origin release/guest-mvp` moved the remote from `652c03a` to `3becba4b68929f3c752ce620368fdcc9e0ed9a65`, which is Candidate `d4f22b9` plus evidence commit `3becba4`. `deploy/d4f22b9` was created without checkout and pushed at 19:02 CDT. `git ls-remote origin` returns `d4f22b9f8f0af432b99aa192f90fa7819c3f3189` for `refs/heads/deploy/d4f22b9`.
  - local Release_Checks on the clean superseded Candidate `d4f22b9`: pass (2026-10-01; lint, typecheck, Vitest 75, test:tools 30, rules fixtures 30, build, check:dist, three-browser suite 106 passed / 2 skipped / 0 failed, wide-font 390 px probe 108/108, PokerKit 7 fixtures / 0 mismatches)
  - local smoke of the `d4f22b9` `dist` (2026-10-01): `pnpm smoke:live --url http://127.0.0.1:4185 --commit d4f22b9f8f0af432b99aa192f90fa7819c3f3189` against `tools/serve-dist.mjs` printed `PASS all 12 steps`. The e2e regression run against `--unrouted-ms 8000` also passed 12 of 12. Localhost does not count as the live smoke.
  - new smoke script against the Live_Site, which still serves `9d15c68` (2026-10-01, local): `--commit 9d15c68115aef6a486bc4f6ba36e649a4280b5bf` printed `PASS all 12 steps`, with the expected build served after 0.6 s. This confirms that the new ordering passes on real Cloudflare. It is not the smoke of the new Candidate.
  - local Release_Checks on superseded `9d15c68`: pass (2026-10-01; lint, typecheck, Vitest, test:tools, rules fixtures, build, check:dist, three-browser suite 105/105, wide-font 390 px probe 108/108)
  - PokerKit reference on superseded `9d15c68`: pass (2026-10-01; 7 rules fixtures compared, 0 mismatches)
  - release branch push for `9d15c68`: done (2026-10-01). `git push origin release/guest-mvp` moved the remote from `4e2b014` to `6821b1aefdb2086d137962f97303665046504780`, which is the Candidate plus evidence commit `6821b1a`. The secret re-check of both new commits found no credential file names and no key or token content. `deploy/9d15c68` was created without checkout and pushed. `git ls-remote origin refs/heads/deploy/9d15c68` returned `9d15c68115aef6a486bc4f6ba36e649a4280b5bf`, which equals the Candidate. `deploy/911e9e9` was left unchanged at `911e9e9`.
  - Deploy_Workflow on Candidate `9d15c68`: fail (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36940616645/job/110630998860, dispatched by the Owner on `deploy/9d15c68`). Every step before deploy passed: `pnpm check`, the three-browser suite and PokerKit. "Deploy static assets" (`wrangler deploy`) succeeded with `Current Version ID: 34af887f-ab67-4cc0-9588-b6458c59638e`. This was the first deploy of the `poker-practice` Worker, because the `911e9e9` run stopped before deploy. "Live smoke check (Chromium)" then failed 8 of 12 steps:
    - All 7 fetch steps (`/`, `/play`, `/history`, `/settings`, `/about`, `/review/smoke-unknown-hand-id`, `/smoke-no-such-page`) observed: `status 404, expected 200; no same-origin <script type="module" src> entry script; missing X-Content-Type-Options (expected "nosniff"); Referrer-Policy is "same-origin", expected "no-referrer"; missing Content-Security-Policy`.
    - "browser response headers" failed with `/about (404): missing X-Content-Type-Options (expected "nosniff"), Referrer-Policy is "same-origin", expected "no-referrer", missing Content-Security-Policy`.
    - "about commit" (full SHA shown), "play hand" (3.1 s), "review matches history" and "browser request origins" (12 requests, all same origin) passed.
    - Result: the Live_Site serves `9d15c68`, but the run is failed and `9d15c68` is superseded (see [Superseded candidates](#superseded-candidates)).
  - Live_Site probe after that run (2026-10-01, local, plain GET/HEAD with `curl.exe` and Node `fetch`, against https://poker-practice.marton-kadi.workers.dev):
    - All 7 smoke paths, `/_headers` and `/assets/does-not-exist.js` returned 200 `text/html` with the `index.html` shell (`/assets/index-CqHHDFVU.js`). They carried every `_headers` value: the CSP, `nosniff`, `no-referrer`, `X-Frame-Options: DENY` and `Permissions-Policy`. This held without `Sec-Fetch-*` headers, with `Sec-Fetch-Mode: cors`, `no-cors` and `navigate`, and with Node `fetch`.
    - `/assets/index-CqHHDFVU.js` was `text/javascript` and the CSS was `text/css`; both had the same headers. `/license.txt` was `text/plain` with `nosniff` and `no-referrer` and no CSP, as `_headers` specifies. `/index.html` gave a 307 redirect to `/`, with the headers.
  - live smoke of `9d15c68` re-run locally, unchanged script, after the probe (2026-10-01): `pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit 9d15c68115aef6a486bc4f6ba36e649a4280b5bf` printed `PASS all 12 steps`. This shows that the config and artifact are correct and that the run's failure was timing. It is not counted as the Deploy_Workflow result.
  - release branch push for superseded `911e9e9`: done (2026-10-01; `git push -u origin release/guest-mvp` created the new remote branch at `b6fe332a46f2e88c052f6b7b9686a58df085d5fd`, which contains the Candidate_Commit plus evidence commits only; secret re-check of all 5 commits since `4ac8b7d` found no credential files and no key/token content)
  - `ci.yml` run on the pushed branch (`911e9e9` plus evidence commits): result not available (run URL not available; see the `ci.yml` run result gate). `ci.yml` also builds with the full SHA, so it probably failed the same 390 px test. This was not verified. Owner can view it at https://github.com/martonkadi/poker-practice/actions?query=branch%3Arelease%2Fguest-mvp
  - Deploy_Workflow on Candidate `911e9e9`: fail (2026-10-01; run https://github.com/martonkadi/poker-practice/actions/runs/36937212698, dispatched by the Owner on `deploy/911e9e9`). Step "Browser suite (Chromium, Firefox, WebKit) on dist" (`pnpm test:e2e:release`): 102 passed, 3 failed. The failing test was `tests/e2e/data-layout.spec.ts` › "every route fits a 390 px viewport without horizontal page overflow" in all three browsers, error `/about scrollWidth` 426 > 390. `wrangler deploy` was not run, the Live_Site is unchanged and the deployment is not delivered. Candidate `911e9e9` is superseded (see [Superseded candidates](#superseded-candidates)).
  - live smoke (`pnpm smoke:live`, task 15.6) for Candidate `3b431ed`: pass (2026-10-01, 20:05:12–20:05:38 CDT, local; Windows, Node 24.20.0, `NODE_OPTIONS=--use-system-ca`). Before the run, `git diff --quiet 3b431ed HEAD -- tools tests apps packages` exited 0, so the script at HEAD `6927143` is the Candidate's. Command: `pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit 3b431ed369705604feb3602d268a98aaffcaedd1`. Exit code 0, `smoke:live: PASS all 12 steps`. The wait printed `expected build served after 16.0 s: stable on 5 consecutive probes at least 3 s apart (0 of 5 probes mismatched)`. Steps (target URL https://poker-practice.marton-kadi.workers.dev):
    - PASS fetch `/`, `/play`, `/history`, `/settings`, `/about`, `/review/smoke-unknown-hand-id`, `/smoke-no-such-page` (7 steps, direct requests): each observed `200 text/html, entry /assets/index-Zh9Q6LmR.js (200 text/javascript, build commit 3b431ed369705604feb3602d268a98aaffcaedd1), headers ok` (Requirement 8 CSP, `nosniff`, `no-referrer`). The SPA fallback paths (`/review/smoke-unknown-hand-id`, `/smoke-no-such-page` and the client routes) carry the `_headers` values, so no alternative is needed.
    - PASS about commit (`/about`): `build commit 3b431ed369705604feb3602d268a98aaffcaedd1 (stable on 5 consecutive probes after 16.0 s; confirmed in a fresh profile)`.
    - PASS play hand (`/`): `hand complete in 3.7 s: +400 chips this hand`.
    - PASS review matches history (`/review/3a738f66-2b9c-5497-8363-ed42a09153a6`): `first History row links /review/3a738f66-2b9c-5497-8363-ed42a09153a6 with result +400 chips`.
    - PASS browser request origins: `23 requests, all to https://poker-practice.marton-kadi.workers.dev`.
    - PASS browser response headers: `8 responses checked, headers ok`.
  - manual-style product check on the Live_Site (2026-10-01, 20:09:49–20:10:09 CDT, local): pass, 42 of 42 checks. An ad-hoc Playwright script outside the repo (deleted afterwards) ran in a fresh Chromium profile at 1280x720 and again in a fresh profile at 390x844. Guest local data only. Each run:
    - played three consecutive hands: check/call only; a raise (typed `Bet / raise to` value at 1280x720, the `½ pot` preset at 390x844); and a fold. Every hand started with stack plus street commitment = 10,000 for both seats, and "Next hand" dealt each new hand.
    - reloaded mid-hand at hand 3's first decision: the same hero cards and action list came back with the hero to act.
    - History listed 3 rows whose results matched the played hands, newest first. A review stepped Next to "Decision 2 of N" and Previous back to "Decision 1 of N". "Reveal completed-hand outcome" showed the same result as History.
    - "Show bb" switched Play stacks and result (for example `9,950 chips` to `99.5 bb`) and the History amounts to bb; turning it off restored chips.
    - Settings "Export JSON" downloaded `poker-practice-2026-10-02.json` with `format: poker-practice`, `schemaVersion: 1`, `exportedAt` and 3 hands. "Delete local data" showed the confirmation, was accepted, returned to `/`, and History then showed "No completed hands yet."
    - Direct loads of `/definitely-not-a-page` showed "Page not found", and `/review/does-not-exist` showed "Hand unavailable" and "This hand is not saved in this browser."
    - 0 console errors and 0 page errors; 15 requests, all to the Live_Site origin.
    - Two earlier attempts at 390x844 (20:08) reported failures from the script, not the app: the bot folded preflop before the hero could raise, and the next run clicked through a hand before "Next hand" had rendered the new deal. The script was fixed to raise in hand 1 and to wait for the new deal. Neither showed a console error or a foreign request.
  - `v0.1.0-rc.1` tag: done (2026-10-01 20:12 CDT, task 15.7). Preconditions confirmed in this file first: every Release_Check in [Candidate_Commit Release_Checks](#candidate_commit-release_checks), PokerKit, the Deploy_Workflow run and the live smoke (12/12) passed at `3b431ed`. Before tagging, `git tag --list "v0.1.0*"` and `git ls-remote --tags origin` returned no tags. `package.json` at the Candidate is `0.1.0-rc.1` (Req 13.5). Command: `git tag -a v0.1.0-rc.1 3b431ed369705604feb3602d268a98aaffcaedd1 -m "v0.1.0-rc.1 (guest MVP)" -m <candidate, Live_Site, Cloudflare version and run URL>` (annotated tag object `4abb57386dbefce69c5d29bb2f1d63088ed35cc9`, author from the existing git identity, no config change). `git push origin v0.1.0-rc.1` printed `* [new tag] v0.1.0-rc.1 -> v0.1.0-rc.1` (exit 0); only the tag was pushed. `git ls-remote --tags origin` returned `4abb57386dbefce69c5d29bb2f1d63088ed35cc9 refs/tags/v0.1.0-rc.1` and `3b431ed369705604feb3602d268a98aaffcaedd1 refs/tags/v0.1.0-rc.1^{}`, so the remote tag peels to the Candidate_Commit.
  - `v0.1.0-rc.1` GitHub prerelease: done (published 2026-10-01 21:03:13 CDT, `publishedAt` `2026-10-02T02:03:13Z`). URL: https://github.com/martonkadi/poker-practice/releases/tag/v0.1.0-rc.1, title `v0.1.0-rc.1 (guest MVP)`, created from the existing tag, which peels to the Candidate. Verified by the agent on 2026-10-04 with `gh` 2.102.0 (logged in as `martonkadi`, scopes `repo` and `workflow`): `gh release view v0.1.0-rc.1 --json tagName,isPrerelease,isDraft,url,publishedAt` returned `isPrerelease: true` and `isDraft: false`, and `gh release list --json tagName,isLatest,isPrerelease` returned it as the only release with `isLatest: false`.
    - Earlier record (2026-10-01): pending Owner action, not passed. `gh --version` failed with `gh: The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.`, and `gh.exe` is not in `%ProgramFiles%\GitHub CLI` or `%LOCALAPPDATA%\Programs\GitHub CLI`. The unauthenticated API cannot create a release on the private repository. The release notes were written outside the repo to `%LOCALAPPDATA%\Temp\poker-release-notes-v0.1.0-rc.1.md`. Prerelease URL: not available until the Owner publishes it (see the "GitHub prerelease creation" Blocked_Gate).
- Deployment: deployed (2026-10-01). The Live_Site serves Candidate `3b431ed369705604feb3602d268a98aaffcaedd1` (Cloudflare version `8562db59-6141-4249-859d-380f9c3f1e6d`, run https://github.com/martonkadi/poker-practice/actions/runs/36947927596/job/110654137598). The live smoke passed (task 15.6, 2026-10-01). Tag `v0.1.0-rc.1` is pushed at the Candidate, and the GitHub prerelease https://github.com/martonkadi/poker-practice/releases/tag/v0.1.0-rc.1 is published (task 15.7, verified 2026-10-04). The Delivery_Report (task 15.8) is pending.

## Release checks

Run lint, TypeScript, existing unit/integration/rules tests and production build (`pnpm check` or documented direct Node equivalents), plus the independent PokerKit reference. Add regressions for changed betting/recording/recovery. Exercise the built artifact: full betting/showdown, three consecutive hands, refresh, rapid input, worker retry/cancellation, advanced tab takeover, missing review, export/deletion, keyboard and 390px layout. Adapt/run the three-browser suite.

A check counts as passed only when it exits 0 with zero failed tests and retries disabled. A check that cannot run locally is recorded here with its exact error, then run in GitHub Actions on the same Candidate_Commit SHA with the run URL and result recorded before deployment.

Smoke the live URL and direct routes. Verify no auth/cloud calls or privileged credentials. Existing hidden-card isolation and conservation remain mandatory. The full strength benchmark is deferred, not passed.

### Candidate_Commit Release_Checks

Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1` on `release/guest-mvp`, run locally on 2026-10-01 (Windows, Node 24.20.0, pnpm 12.6.0) from a clean `git status`. The only uncommitted files were the two Kiro spec tracking files under `.kiro/specs/`, which are not part of the build. `dist/` was deleted first. Build env matched `deploy.yml`: `VITE_SUPABASE_URL=''`, `VITE_SUPABASE_PUBLISHABLE_KEY=''`, `VITE_APP_ENV=production`, `VITE_GIT_COMMIT=<Candidate SHA>` (the SHA is embedded in the entry chunk). `pnpm check` exited 0. The browser suite, the wide-font probe and the local smoke then ran against that same `dist`, with no rebuild and retries 0. The tree was still clean afterwards.

| Check | Command | Result | Passed | Failed |
| --- | --- | --- | --- | --- |
| lint | `pnpm lint` (in `pnpm check`) | pass | n/a | 0 errors |
| typecheck | `pnpm typecheck` (in `pnpm check`) | pass | n/a | 0 errors |
| Vitest (unit/integration, property and rules tests) | `pnpm test` (in `pnpm check`) | pass | 75 (21 files) | 0 |
| tool tests | `pnpm test:tools` (in `pnpm check`) | pass | 36 (includes the new entry-commit helper and `--stale-dir`/`--stale-ms` tests) | 0 |
| rules fixtures | `pnpm test:rules` (`packages/poker`) | pass | 30 (4 files; `rules-fixtures.test.ts` 8) | 0 |
| production build | `pnpm build` (in `pnpm check`) | pass | n/a | n/a |
| check:dist | `pnpm check:dist` (in `pnpm check`) | pass (entry-size, cloud-code, test-hook, inline-markup, headers) | n/a | n/a |
| three-browser suite | `pnpm test:e2e:release` (retries 0) | pass | 108 (Chromium 38, Firefox 35, WebKit 35); 6 skipped by design (the 3 Chromium-only `smoke-live.spec.ts` tests in Firefox and WebKit) | 0 |
| PokerKit reference | `python tools/reference/pokerkit_rules.py` | pass (exit 0) | 7 rules fixtures compared (plus built-in blind/limp/min-raise/fold/all-in/side-pot asserts) | 0 mismatches |
| wide-font 390 px probe (ad-hoc, outside the repo) | Playwright script against the same `dist`, forced `"DejaVu Sans", Verdana, sans-serif` and default fonts, 390 and 320 px | pass | 108 measurements (9 routes × 3 browsers × 2 fonts × 2 widths; maximum scrollWidth 390) | 0 |
| local smoke (not the live smoke) | `pnpm smoke:live --url http://127.0.0.1:4185 --commit <Candidate SHA>` against `tools/serve-dist.mjs` on the same `dist` | pass | 12 steps | 0 |

Entry chunk: `/assets/index-Zh9Q6LmR.js`, 467,530 bytes (limit 500,000). It embeds the full Candidate SHA.

PokerKit reference: run 2026-10-01 at Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1` (clean tree) with Python 3.14.7 and `pokerkit==0.7.6`, in the existing virtualenv outside the repository (`%LOCALAPPDATA%\poker-pokerkit-venv`, installed via `python -m pip install --require-hashes --no-deps -r tools/reference/requirements.txt`). Output: `7 rules fixtures compared, 0 mismatches`.

Superseded results for `d4f22b9f8f0af432b99aa192f90fa7819c3f3189` (2026-10-01): the same local checks passed (tool tests 30, three-browser suite 106 passed / 2 skipped, probe 108/108, local smoke 12/12), entry chunk `/assets/index-BPXF_Fko.js` 467,530 bytes, PokerKit 7 fixtures / 0 mismatches. Its Deploy_Workflow deployed it and then failed the live smoke 1 of 12 (see [Superseded candidates](#superseded-candidates)).

Superseded results for `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (2026-10-01): the same local checks passed (tool tests 29, three-browser suite 105/105, probe 108/108), entry chunk `/assets/index-CqHHDFVU.js` 467,530 bytes, PokerKit 7 fixtures / 0 mismatches. Its Deploy_Workflow deployed it and then failed the live smoke (see [Superseded candidates](#superseded-candidates)).

Superseded results for `911e9e90d398e4b8a7f290423434e05edea973ff` (2026-10-01): the same local checks passed on Windows, entry chunk `/assets/index-B-oJAD1B.js` 467,529 bytes, and PokerKit found 7 fixtures and 0 mismatches. Its Deploy_Workflow browser suite then failed on Linux (see [Superseded candidates](#superseded-candidates)).

### Superseded candidates

- `d4f22b9f8f0af432b99aa192f90fa7819c3f3189` (2026-10-01): superseded. The Deploy_Workflow run https://github.com/martonkadi/poker-practice/actions/runs/36944049410/job/110641918075 passed every pre-deploy check. `wrangler deploy` then succeeded (version `ca03b60e-f4bb-4361-9e2b-c380fbfa9862`), and the live smoke failed 1 of 12 steps ("about commit", see MVP-4). The Live_Site serves this build.
  - Root cause: right after `wrangler deploy`, Cloudflare answered with the old (`9d15c68`) and the new (`d4f22b9`) version side by side. The wait's single `/about` load showed `d4f22b9`, so the wait ended after 0.4 s. All 7 direct fetches then got the old shell with entry `/assets/index-CqHHDFVU.js`, and the next `/about` load in a fresh profile showed `9d15c68`. Minutes later the Live_Site served only `d4f22b9` (20 of 20 probes, see MVP-4).
  - Cloudflare docs agree with this explanation. Plain `wrangler deploy` creates a version and deploys it to 100% of traffic in one step, with no gradual rollout ([Versions & deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)). A recent deployment change can take up to a couple of seconds to be available globally ([Version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/)), and a Cloudflare blog post says a deploy is live everywhere within a few seconds ([production safety blog](https://blog.cloudflare.com/workers-production-safety/)). For static assets with content-hashed filenames, Cloudflare describes how requests routed to different versions get different HTML and entry chunks, and how an old entry path can fail on the new version ([Gradual rollouts](https://developers.cloudflare.com/workers/static-assets/routing/advanced/gradual-rollouts/)). No gradual deployment is configured here, so the mix seen was a short propagation window. The docs give no exact upper bound for that window.
  - Gap in the smoke check: the fetch steps only checked that the HTML loaded *some* same-origin entry script, not that it belonged to the expected build. The wait also accepted a single matching `/about` load.
  - Fix in Candidate `3b431ed` (no check relaxed; every change raises strictness):
    - Each of the 7 fetch steps now also fetches the HTML's entry module script once (same origin, 10 s timeout). The script must answer 200 with a JavaScript MIME type, `nosniff` and `no-referrer`, and it must embed the expected commit. If the script embeds full 40-hex SHAs, exactly one must start with `--commit`. The `observed` value reports the entry path and the matched commit. The pure helpers (`embeddedCommits`, `entryBuildCommit`, `scriptProblems`, `isJavaScriptContentType`) are in `tools/smoke-live-lib.mjs`, with unit tests.
    - The wait now requires 5 consecutive matching probes, spaced at least 3 s apart (at least 12 s of stability), within the same 90 s cap. Each probe loads `/about` in a new Chromium context and also fetches `/` and its entry script directly. It matches only if both show the expected commit, and any mismatch resets the streak. One `/about` load inside a probe is capped at 10 s, so a page broken by mixed versions cannot use up the wait. The strict checks after the wait still run once each, and a mismatch there still fails.
    - If the wait does not confirm the build, "play hand" and "review matches history" fail as skipped, without playing. Every step still prints one PASS/FAIL line, and the exit code is 0 only when all 12 pass.
    - `tools/serve-dist.mjs` gained `--stale-dir <dir> --stale-ms <n>`. For the first `<n>` ms it serves every second request from an older build, using that build's own `_headers`, and it defines no header values (Req 8.4). `tests/e2e/smoke-live.spec.ts` (Chromium) adds two tests. Each builds a second `dist` with `VITE_GIT_COMMIT=deadbeef…` into a temp dir outside the repo. With a 10 s mixed window, the smoke must report mismatched probes, then pass all 12 steps, with all 7 fetch steps showing the expected commit. With a mixed state that never ends, the smoke must fail with exit 1: the wait is not confirmed, "about commit" fails and all 7 fetch steps fail. The existing `--unrouted-ms` test is unchanged and still passes.
- `9d15c68115aef6a486bc4f6ba36e649a4280b5bf` (2026-10-01): superseded. The Deploy_Workflow run https://github.com/martonkadi/poker-practice/actions/runs/36940616645/job/110630998860 passed every pre-deploy check. `wrangler deploy` then succeeded (version `34af887f-ab67-4cc0-9588-b6458c59638e`), and the live smoke failed 8 of 12 steps (see MVP-4). The Live_Site served this build until the `d4f22b9` deploy replaced it.
  - Root cause: a race between `wrangler deploy` returning and Cloudflare serving the new Worker. It was not a config or header problem. The smoke check sent its 7 direct requests immediately after deploy. On this first deploy of the Worker, the edge was not routing the hostname to it yet. It answered with a bare 404 that had no app shell, none of the `_headers` values and Cloudflare's own `Referrer-Policy: same-origin`. The browser steps came next, and the `/about` poll's first load got the same 404. The browser header check recorded that 404, and the poll then passed once the Worker was live.
  - Evidence: minutes later, the same deployment returned 200 with every `_headers` value on all paths (see MVP-4), and the unchanged smoke script passed 12 of 12 against it. Locally, the unchanged script against `tools/serve-dist.mjs --unrouted-ms 8000` (bare 404s for the first 8 s) reproduced the run exactly: FAIL 8 of 12, with the same 7 fetch steps and the browser header step failing.
  - No `wrangler.jsonc` change was needed. Assets-only `not_found_handling: "single-page-application"` serves `index.html` with 200 for every unmatched path, not only for `Sec-Fetch-Mode: navigate` requests (that distinction applies only when a Worker script exists). `_headers` rules also apply to the SPA fallback response, so the stop condition in task 15.6 does not apply.
  - Fix in the new Candidate:
    - `tools/smoke-live.mjs` first polls `/about` in its own Chromium context until the expected commit is served (up to 90 s, as before). A non-200 `/about` answer is retried after 5 s. Responses in this wait are not header-checked, but their request origins still are.
    - Only after the wait does it run the 7 direct requests, each once with no retry and the same strict status, HTML, entry-script and header checks. It then runs the browser steps in a fresh context, which loads `/about` once more and checks every response's headers.
    - `tools/serve-dist.mjs` gained `--unrouted-ms` to emulate the window, with a unit test. `tests/e2e/smoke-live.spec.ts` (Chromium) runs the smoke check against that mode and requires `PASS all 12 steps`.
    - No header expectation, timeout or status check was relaxed.
- `911e9e90d398e4b8a7f290423434e05edea973ff` (2026-10-01): superseded. Local Release_Checks passed on Windows, but the Deploy_Workflow run https://github.com/martonkadi/poker-practice/actions/runs/36937212698 failed at "Browser suite (Chromium, Firefox, WebKit) on dist" with 102 passed / 3 failed (`/about scrollWidth` 426 > 390 in Chromium, Firefox and WebKit). `wrangler deploy` did not run, so this candidate was not delivered.
  - Root cause: the About page prints the full 40-character build SHA in a `.prose` paragraph. A hex SHA is one unbreakable word. At a 390 px viewport the page has 358 px of content width (16 px padding each side). The SHA is about 351 px wide in the Windows fallback fonts, so it fits. In wider sans-serif fallbacks such as DejaVu Sans, which is common on Linux runners, it is about 407–410 px wide, and its text run ends at 423–426 px. Reproduced locally by forcing `"DejaVu Sans", Verdana, sans-serif`: `/about` scrollWidth was 423 in all three browsers. No other route overflowed at 390 px.
  - Fix: `overflow-wrap: anywhere` on `.prose` in `apps/web/src/styles.module.css`, so the SHA wraps inside the paragraph. The displayed value stays the full SHA. The same probe found one more overflow, at a 320 px viewport only: the `/play` bet row's min-content was wider than the panel (scrollWidth 337–342). A `max-width: 359px` rule now lets that row wrap. Neither rule changes layout at the 390 px and 1440 px screenshot sizes with the default fonts.

### `ci.yml` runs on `release/guest-mvp`

Read by the agent on 2026-10-04 with `gh run list --workflow ci.yml --branch release/guest-mvp` (all `push` events, newest first, times UTC). A run counts only for the SHA it checked. A `cancelled` run was superseded by the next push (`cancel-in-progress: true`) and is not evidence.

| Created (UTC) | Head SHA | Contains | Conclusion | Run |
| --- | --- | --- | --- | --- |
| 2026-10-02 01:14:03 | `a0381eb` | Candidate `3b431ed` + evidence commits | success | https://github.com/martonkadi/poker-practice/actions/runs/36949941258 |
| 2026-10-02 01:11:10 | `e677561` | Candidate `3b431ed` + evidence commits | cancelled | https://github.com/martonkadi/poker-practice/actions/runs/36949708435 |
| 2026-10-02 01:04:00 | `6927143` | Candidate `3b431ed` + evidence commits | cancelled | https://github.com/martonkadi/poker-practice/actions/runs/36949122017 |
| 2026-10-02 00:48:13 | `343ac3f` | Candidate `3b431ed` + evidence commits | success | https://github.com/martonkadi/poker-practice/actions/runs/36947812346 |
| 2026-10-02 00:47:48 | `e31d8fa` | Candidate `3b431ed` + evidence commit | cancelled | https://github.com/martonkadi/poker-practice/actions/runs/36947777437 |
| 2026-10-02 00:02:20 | `3becba4` | superseded `d4f22b9` + evidence commit | success | https://github.com/martonkadi/poker-practice/actions/runs/36943939566 |
| 2026-10-01 23:22:17 | `652c03a` | superseded `9d15c68` + evidence commits | success | https://github.com/martonkadi/poker-practice/actions/runs/36940439776 |
| 2026-10-01 23:21:53 | `6821b1a` | superseded `9d15c68` + evidence commit | cancelled | https://github.com/martonkadi/poker-practice/actions/runs/36940402697 |
| 2026-10-01 22:40:36 | `4e2b014` | superseded `911e9e9` + evidence commits | failure (`pnpm test:e2e:release`: 102 passed, 3 failed, `/about scrollWidth` in all three browsers) | https://github.com/martonkadi/poker-practice/actions/runs/36936484083 |
| 2026-10-01 22:39:43 | `b6fe332` | superseded `911e9e9` + evidence commits | cancelled | https://github.com/martonkadi/poker-practice/actions/runs/36936394995 |

The `4e2b014` failure confirms the inference recorded for `911e9e9` in MVP-4: `ci.yml` failed the same 390 px test as its Deploy_Workflow run.

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
Intended app: https://poker-practice.marton-kadi.workers.dev (live since 2026-10-01; it now serves Candidate `3b431ed`, Cloudflare version `8562db59-6141-4249-859d-380f9c3f1e6d`; deployed, not yet delivered).
Tag: `v0.1.0-rc.1` (annotated, pushed 2026-10-01; peels to Candidate `3b431ed369705604feb3602d268a98aaffcaedd1`).
Prerelease: https://github.com/martonkadi/poker-practice/releases/tag/v0.1.0-rc.1 (published 2026-10-01 21:03 CDT; prerelease, not a draft, not latest; verified 2026-10-04).
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

- Gate: GitHub CLI access — resolved (2026-10-01; blocked 2026-09-30)
  Step: local `gh auth status`
  Error: gh: The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Install GitHub CLI (e.g. `winget install --id GitHub.cli`) and run `gh auth login` with access to martonkadi/poker-practice (repo, workflow scopes).
  Resolved (2026-10-01, at commit `a0381eb`; re-checked 2026-10-04): `gh --version` reports `gh version 2.102.0 (2026-09-30)`, and `gh auth status` reports account `martonkadi` logged in to github.com with token scopes `gist`, `read:org`, `repo` and `workflow`. A new shell may need its PATH refreshed from the Machine and User registry entries before `gh` is found. With it, the agent confirmed the secret names `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the `production` environment (names only, 2026-10-04).
- Gate: Cloudflare secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) — resolved (2026-10-01; blocked 2026-09-30)
  Step: local `gh secret list` and `gh secret list --env production`
  Error: not run; gh is not installed (see GitHub CLI access gate), so secret names could not be listed
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Confirm both secrets exist on martonkadi/poker-practice (repo or `production` environment); add any that are missing. Names only need confirming, not values.
  Resolved (2026-10-01, Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1`): in run https://github.com/martonkadi/poker-practice/actions/runs/36947927596/job/110654137598, the step "Confirm static deployment configuration" (`test -n "$CLOUDFLARE_API_TOKEN" && test -n "$CLOUDFLARE_ACCOUNT_ID"`) passed, and Cloudflare accepted the credentials: `wrangler deploy` reported `Current Version ID: 8562db59-6141-4249-859d-380f9c3f1e6d` (per the Owner). The earlier `9d15c68` and `d4f22b9` runs had also deployed successfully.
- Gate: `production` environment — resolved (2026-10-01; blocked 2026-09-30)
  Step: local `gh api repos/martonkadi/poker-practice/environments` (gh unavailable); unauthenticated GET https://api.github.com/repos/martonkadi/poker-practice/environments
  Error: Response status code does not indicate success: 404 (Not Found).
  Run: local
  Commit: da3ed2fc292ed0d874522e80aa99b0c9ef47de2f
  Owner action: Confirm the `production` environment exists in repository Settings → Environments (create it if missing), or provide authenticated gh access so it can be checked.
  Resolved (2026-10-01, Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1`): the `deploy.yml` job declares `environment: production`, and its run https://github.com/martonkadi/poker-practice/actions/runs/36947927596/job/110654137598 completed every step, including the deploy step, in that environment (per the Owner).
- Gate: `ci.yml` run result for `release/guest-mvp` — resolved (2026-10-04; blocked 2026-10-01)
  Step: local `gh run list --branch release/guest-mvp` (gh unavailable); unauthenticated GET https://api.github.com/repos/martonkadi/poker-practice/actions/runs?branch=release/guest-mvp
  Error: Response status code does not indicate success: 404 (Not Found).
  Run: not available (Owner view: https://github.com/martonkadi/poker-practice/actions?query=branch%3Arelease%2Fguest-mvp)
  Commit: b6fe332a46f2e88c052f6b7b9686a58df085d5fd
  Owner action: Report the `ci.yml` run URL and result for this push, or provide authenticated gh access so it can be read. The run is not counted as passed until recorded.
  Still open (2026-10-01): the results for the later `release/guest-mvp` pushes, which include Candidate `3b431ed` and its evidence commits, are also not available to the agent. The repository is private and `gh` is unavailable. The Owner can view it at the link above.
  Resolved (2026-10-04, commit `a0381eb`): read with `gh run list --workflow ci.yml --branch release/guest-mvp`. The `b6fe332` push's run https://github.com/martonkadi/poker-practice/actions/runs/36936394995 was cancelled by the next push, and that push's run (`4e2b014`, https://github.com/martonkadi/poker-practice/actions/runs/36936484083) failed the 390 px test. For Candidate `3b431ed`, the runs on its evidence-only descendants `343ac3f` and `a0381eb` passed. Every run is listed in [`ci.yml` runs](#ciyml-runs-on-releaseguest-mvp).
- Gate: GitHub prerelease creation (`v0.1.0-rc.1`) — resolved (2026-10-01; blocked 2026-10-01)
  Step: local `gh release create v0.1.0-rc.1 --prerelease --verify-tag` (not run; `gh --version` failed first)
  Error: gh: The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.
  Run: local
  Commit: 3b431ed369705604feb3602d268a98aaffcaedd1 (tag `v0.1.0-rc.1` already pushed and peels to it)
  Owner action: On https://github.com/martonkadi/poker-practice/releases choose "Draft a new release", pick the existing tag `v0.1.0-rc.1` (do not create a new tag), set the title `v0.1.0-rc.1 (guest MVP)`, paste the notes from `%LOCALAPPDATA%\Temp\poker-release-notes-v0.1.0-rc.1.md`, tick "Set as a pre-release" (leave "Set as the latest release" unticked), then "Publish release" and report the release URL. Alternatively install and authenticate `gh` (see the GitHub CLI access gate) so the agent can create it.
  Resolved (2026-10-01 21:03 CDT, Candidate_Commit `3b431ed369705604feb3602d268a98aaffcaedd1`): the prerelease https://github.com/martonkadi/poker-practice/releases/tag/v0.1.0-rc.1 was published from the existing tag. Verified on 2026-10-04 with `gh release view` and `gh release list`: `isPrerelease: true`, `isDraft: false`, `isLatest: false`.
