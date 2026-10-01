# Implementation Plan: guest-mvp-release

## Overview

This plan finishes and ships the guest-only heads-up MVP in TypeScript (React + Vite in `apps/web`, `packages/poker`, `packages/persistence`, `packages/contracts`), Node `.mjs` release tooling in `tools/`, Vitest + fast-check, and Playwright. It follows the design's "Order of work". First it preserves the existing uncommitted work and checks access. Then it fixes the busy-state and action-recording defects, isolates MVP scope, unifies chip display and adds the release machinery. The final tasks reconcile the docs and run the Candidate_Commit through the release checks, deployment, live smoke and prerelease.

Assumptions and stop conditions:

- **Evidence commit rule (adopted pending Owner confirmation):** commits that touch only `PLAN.md`, `docs/screenshots/*` or the Delivery_Report are evidence commits. They may land after the Candidate_Commit passes, and they are never deployed or tagged. Screenshots are captured from the Candidate_Commit's `dist` before the evidence commit. If the Owner rejects this rule, every such change creates a new Candidate_Commit, and all Release_Checks must be rerun on it (Req 10.9).
- **SPA fallback headers:** if the live smoke check shows that Cloudflare does not apply the `_headers` rules to the SPA fallback response, stop and ask the Owner. A small Worker script probably stays on the free tier, but it changes the static-only posture and is a scope decision.
- Tasks marked **Owner action** cannot be completed by the agent alone. The agent prepares the step, asks, and waits.

## Tasks

- [ ] 1. Preserve existing work before any change
  - [x] 1.1 Report the git ownership error and obtain Owner consent (Owner action)
    - Run a read-only git command (e.g. `git status`). If git refuses because of repository ownership (`safe.directory`), report the exact error text to the Owner
    - Leave the working tree and all git config unchanged. Wait for explicit Owner consent before running any `git config` change (global or repository)
    - _Requirements: 1.5_
  - [x] 1.2 Scan the working tree for secret files
    - List modified and untracked files. Flag every `.env*` file other than `.env.example`, and any file containing private keys, access tokens or credentials
    - Leave flagged files unchanged on disk and keep them out of every commit. Name them (without their contents) in the report
    - Check existing commits reachable from `4ac8b7d` for such files. If any are found, report the file name and commit SHA, and stop before any push
    - _Requirements: 1.6, 1.7_
  - [x] 1.3 Run baseline tests on the untouched tree
    - Build, then run Vitest and Playwright Chromium against the preview build without modifying any file
    - Record the passed/total counts and the name of every failing test. Do not describe the state as passing if any test fails
    - _Requirements: 1.3, 1.4_
  - [-] 1.4 Create the preservation commit on `release/guest-mvp`
    - Create the branch `release/guest-mvp` from `4ac8b7d`. Stage the existing modified and untracked files by name, excluding the files from 1.2
    - Commit with a message that contains the Vitest and Playwright Chromium counts from 1.3, plus failing test names if any
    - Confirm that `git status` shows nothing left except the excluded files. Report the commit SHA and branch name to the Owner
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Check GitHub and Cloudflare access
  - [~] 2.1 Verify release access and record any Blocked_Gate immediately
    - Run `gh auth status`. Run `gh secret list` and check for the names `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (names only, never values). Check whether the `production` environment exists
    - For each missing item, add a Blocked_Gate entry to `PLAN.md` in the design's fixed format (step, error, run, commit, Owner action), so the Owner can act in parallel
    - _Requirements: 11.5, 11.6, 13.2_

- [ ] 3. Implement the busy-state play machine
  - [~] 3.1 Create `apps/web/src/playMachine.ts`
    - Implement the `Phase` and `PlayEvent` types, `playReducer`, `isBusy` and `controlsFor` as specified in the design
    - Events with a stale `requestId` or `token` leave the phase unchanged. A stale `BOT_DECIDED` and `BOT_CANCELLED` both go to `idle` with no error. `RETRY` goes from `botFailed` to `idle`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [~] 3.2 Write property test for busy-state liveness
    - **Property 1: Busy-state liveness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.6**
    - File: `apps/web/src/playMachine.test.ts`; generate event sequences with stale, duplicated and out-of-order ids/tokens
  - [~] 3.3 Write property test for control enablement
    - **Property 2: Busy rejects input and controls follow legality**
    - **Validates: Requirements 2.7, 2.8**
    - File: `apps/web/src/playMachine.test.ts`
  - [~] 3.4 Rewrite `useGame` on top of `playReducer`
    - `useReducer` plus a synchronously updated `phaseRef`, so a second click in the same tick is dropped
    - Bot effect with `AbortController` and `requestId`. Effect cleanup dispatches `BOT_CANCELLED`. Stale decisions are discarded unsaved
    - Add a `runSave(op, requestId?, work)` helper that dispatches `SAVE_OK`/`SAVE_FAILED` on every exit path. On failure, `active.current` keeps the last saved state
    - Add a "Retry bot" control when `botFailed`, plus messages for a failed bot decision and an unsaved action. Keep the 5 s worker timeout
    - Play buttons and keyboard shortcuts both use `controlsFor`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [~] 3.5 Write hook regression tests with a fake Worker
    - One test each for a stale decision after session change (2.1), cancellation by unmount/navigation (2.2), bot failure/timeout followed by Retry bot (2.4, 2.5) and save failure (2.6)
    - Each test asserts that busy is clear and hero controls are enabled once the hero is the actor
    - _Requirements: 2.9_

- [ ] 4. Implement canonical action recording
  - [~] 4.1 Add amount-based canonicalization and `recordedAction` to `packages/poker/src/index.ts`
    - `history()` tracks the round's running highest commitment, starting from the max of the opening contributions. A contributing turn is `raiseTo(total)` if the actor's street total exceeds that highest commitment, otherwise `call`. `fold`/`check` record amount 0. Engine `all-in` labels are ignored
    - `recordedAction(before, after, actor)` filters both histories to the actor, requires exactly one new entry and returns it. Otherwise it throws `RecordError`
    - Export `BIG_BLIND = 100` and `TOTAL_CHIPS = 20_000`
    - _Requirements: 3.1, 3.2, 3.3, 3.9_
  - [~] 4.2 Use `recordedAction` in `session.actAndSave`
    - The Decision_Record frame stays `frame(before)`, so a street-closing call carries its own street
    - On `RecordError`, save nothing, leave the active session and Hand_Records unchanged, and surface "This action could not be recorded."
    - _Requirements: 3.4, 3.9_
  - [~] 4.3 Add rules regression fixtures for the seven Req 3.10 cases
    - Add fixed-deck hands for: preflop all-in call, postflop all-in call, short all-in call (less than the outstanding bet), all-in raise, street-closing call, fold after a raise, and split pot
    - Assert the Canonical_Action and amount of every Decision_Record. Keep the fixture format readable by `tools/reference/pokerkit_rules.py`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.10_
  - [~] 4.4 Write unit test for the `RecordError` path
    - Use a crafted before/after state pair with no matching new actor entry. Assert that nothing is saved and the message is shown
    - _Requirements: 3.9_
  - [~] 4.5 Write property test for canonical action consistency
    - **Property 3: Canonical action consistency**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - File: `packages/poker/src/record.property.test.ts`. Build the shared hand generator here: a seeded PRNG for the deck, a random button and a weighted random legal policy for both seats. Use `numRuns: 200` and report the deck and actions on failure (Req 3.8)
  - [~] 4.6 Write property test for decision ordering by street
    - **Property 4: Decision ordering by street**
    - **Validates: Requirements 3.4**
  - [~] 4.7 Write property test for chip conservation
    - **Property 5: Chip conservation**
    - **Validates: Requirements 3.5, 3.8**
  - [~] 4.8 Write property test for replay round trip
    - **Property 6: Replay round trip**
    - **Validates: Requirements 3.6, 3.8, 5.8**
  - [~] 4.9 Write property test for hero contribution sum
    - **Property 7: Hero contribution sum**
    - **Validates: Requirements 3.7, 3.8**

- [~] 5. Checkpoint: busy state and recording
  - Run `pnpm check` (lint, typecheck, test, build) and the rules fixtures. Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Isolate MVP scope
  - [~] 6.1 Remove deferred cloud and equity code
    - Delete `apps/web/src/cloud.ts` and every import of it. Remove the `equity` message kind and the `estimateEquity` import from `bot.worker.ts`, so it accepts only `decide`/`cancel`
    - `workerClient.requestBot` posts exactly `{ kind, id, observation, difficulty }`, where `observation = observe(state, 'bot')`
    - _Requirements: 4.1, 4.5, 5.1, 5.4_
  - [~] 6.2 Write property test for bot observation isolation
    - **Property 8: Bot observation isolation**
    - **Validates: Requirements 4.1, 4.2, 4.5**
    - File: `packages/poker/src/observation.property.test.ts`, plus a fake-`Worker` payload capture test for `workerClient`. Run at least 100 hands, biased so bot decisions occur on all four streets
  - [~] 6.3 Update opponent labeling and remove forbidden UI
    - Show "standard-v1 · experimental" on Play and About. Remove any sign-in, sync, import, difficulty, animation-speed, equity or recommendation controls, plus any GTO/solver/EV-loss/strength wording that is not an explicit denial
    - Confirm that `/signin`, `/sync` and `/import` fall through to the not-found view
    - _Requirements: 5.2, 5.3, 5.9, 5.10_
  - [~] 6.4 Add `openStore` and the store-status message
    - Add `openStore()` in `packages/persistence`, returning `{ ok: true } | { ok: false; reason }`. Add a `StoreStatusProvider` that calls it once at boot
    - On failure, disable writes and show "Saved hands could not be loaded. They have not been deleted." on Play, History and Settings
    - _Requirements: 5.5, 5.6_
  - [~] 6.5 Write the Dexie v1/v2 migration test
    - Under fake-indexeddb, seed a raw v1 database and a raw v2 database, each with at least one Hand_Record, one bookmark (in v1, `record.bookmarked = true`) and one active session. Open `PracticeDatabase` and compare counts and field values
    - Add a forced upgrade failure case that asserts the stored data is unmodified and `openStore` returns `ok: false`
    - _Requirements: 5.5, 5.6, 5.7_

- [ ] 7. Unify chip display, review view and settings
  - [~] 7.1 Create `apps/web/src/format.ts` with `formatAmount`
    - Chips use whole numbers in en-US format plus " chips". Big blinds use `|n|/100` to one decimal plus " bb". With `signed`, the prefix is "+" above 0, "−" (U+2212) below 0, and nothing at 0
    - _Requirements: 7.1, 7.2, 7.4_
  - [~] 7.2 Write property test for formatter consistency
    - **Property 11: Formatter consistency**
    - **Validates: Requirements 7.1, 7.2, 7.4**
    - File: `apps/web/src/format.test.ts`
  - [~] 7.3 Add `ChipUnitProvider` and use it on Play and History
    - In `apps/web/src/chipUnit.tsx`, load the preference once. If it is missing or fails to load, use chips without writing. `setUnit` updates the context immediately and persists in the background
    - Wrap the app root in the provider. Play stacks, pot and bets, and History results (`formatAmount(heroNet, unit, { signed: true })`), use the same unit. Reset to chips after local data is deleted
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [~] 7.4 Write unit tests for preference fallback
    - When the preference is missing or loading fails, History shows chips, lists every hand, and the stored value is untouched
    - _Requirements: 7.3_
  - [~] 7.5 Implement the `reviewView` selector and use it on Review
    - Add `reviewView(record, index, { outcomeOpen })` as a pure function. The Review_Screen renders only through it. The outcome section is collapsed by default on every load. Bot hole cards appear only when the outcome is open and the hand reached showdown
    - _Requirements: 4.3, 4.4, 4.6, 4.7_
  - [~] 7.6 Write property test for the review view
    - **Property 9: Review view shows only decision-time cards**
    - **Validates: Requirements 4.3, 4.7**
    - File: `apps/web/src/reviewView.test.ts`
  - [~] 7.7 Harden Settings export and deletion
    - On export failure, download nothing and show "Export failed. Your saved data has not been changed." Ask for explicit confirmation before deleting. Cancelling keeps the data and stays on Settings
    - If another tab holds the lock, keep the data and ask the Guest to close the other tab. If deletion fails, stay on Settings with an error. A successful deletion removes hands, bookmarks, the active session and the chip preference, then navigates home
    - Show a statement that there is no account or cloud backup and that clearing browser data deletes saved hands
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [~] 7.8 Write property test for export round trip
    - **Property 10: Export round trip**
    - **Validates: Requirements 6.1, 6.2**
    - File: `packages/persistence/src/export.property.test.ts` (fake-indexeddb), including the empty set

- [~] 8. Checkpoint: scope, display and data
  - Run `pnpm check` and the migration test. Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Headers, artifact checks and browser suite
  - [~] 9.1 Update the Cloudflare `_headers` file
    - Replace the contents with the exact `/*` rule from the design: CSP, `nosniff`, `no-referrer`, `X-Frame-Options` and `Permissions-Policy`. Header values may not be defined anywhere else
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [~] 9.2 Create `tools/serve-dist.mjs`
    - A static server for `dist/` with an SPA fallback to `index.html`. It applies every rule parsed from `dist/_headers` and uses the fixed MIME map from the design. It defines no header values of its own
    - _Requirements: 8.4, 8.5, 10.3_
  - [~] 9.3 Create `tools/check-dist.mjs` and wire it into `pnpm check`
    - Fail with a named reason on any of the following:
      - the entry chunk is over 500,000 bytes (print the measured size and the limit);
      - a `.js` file contains `supabase` (case-insensitive) or a cloud module identifier;
      - a test-hook marker is present;
      - `index.html` contains an inline `<script>` or `<style>`;
      - `dist/_headers` is missing a header, has a different value, or contains forbidden CSP tokens
    - Add the `check:dist` script and run it after `build` in `run-check.mjs`
    - Note: the size gate is expected to fail until 10.1 lands
    - _Requirements: 5.1, 8.2, 8.7, 9.5, 9.6, 9.7, 10.5_
  - [~] 9.4 Configure Playwright for release runs and add the CSP fixture
    - In `playwright.config.ts`: `webServer.command` runs `serve-dist.mjs`, with `retries: 0`, `forbidOnly: true` and the Chromium, Firefox and WebKit projects. Add a `test:e2e:release` script
    - `tests/e2e/fixtures.ts` registers `securitypolicyviolation` and console listeners and fails the test with the blocked resource and URL. Worker/IDB overrides stay test-only through `page.addInitScript`
    - _Requirements: 8.6, 8.7, 10.3, 10.5, 10.6_
  - [~] 9.5 Write e2e gameplay scenarios
    - A showdown hand, a fold hand, three hands with an alternating Dealer label, a mid-hand reload that restores the same state, five rapid clicks/keys producing exactly one Decision_Record, and a keyboard-only hand
    - _Requirements: 2.7, 10.4_
  - [~] 9.6 Write e2e resilience scenarios
    - A worker failure followed by Retry bot completing the turn, navigating away during a bot turn and returning with controls enabled, takeover after another tab advanced the hand, and an unknown review id showing "Hand unavailable"
    - _Requirements: 2.2, 2.4, 2.5, 10.4_
  - [~] 9.7 Write e2e data and layout scenarios
    - Export (download, then parse and validate), deletion (confirm, IDB empty, home page), and every route at a 390 px viewport with `scrollWidth <= 390`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.4_
  - [~] 9.8 Write e2e header and real-worker CSP tests
    - Assert headers and MIME types on HTML routes, a JS chunk, the worker script, a CSS file, `/license.txt` and an unknown path
    - With the real module worker and the CSP fixture active, play a full hand, open the review, export, then open `/license.txt` with zero violations
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_
  - [~] 9.9 Write e2e scope, label and chip-unit tests
    - Deferred paths render not-found. No page has forbidden controls or terms. The opponent label is present on Play and About. Toggling the chip unit updates Play and History within 1 s and survives a reload
    - _Requirements: 5.2, 5.3, 5.9, 5.10, 7.5, 7.6_

- [ ] 10. Bundle size and code organization
  - [~] 10.1 Lazy-load the Play route
    - Use `React.lazy(() => import('./pages/Play'))` (or the equivalent module path before extraction) inside `Suspense`, with a "Loading table…" status
    - Verify that `@poker/analysis` (`potOdds`) does not import `poker-engine-ts`. If it does, move `potOdds` to a dependency-free module. Confirm that `check:dist` reports an entry chunk of 500,000 bytes or less
    - _Requirements: 9.5, 9.6, 9.7_
  - [~] 10.2 Extract page modules (optional polish, cuttable if October 2 is at risk)
    - Move Home, Play, History, Review, Settings, About and NotFound into `apps/web/src/pages/*.tsx`, one per module, with the same routes and visible text
    - _Requirements: 9.1, 9.3_
  - [~] 10.3 Extract shared components (optional polish, cuttable)
    - Move `CardFace`/`Cards` and `Shell` to `components/`, and `displayAction` to `format.ts`. `main.tsx` keeps only bootstrap and the route table
    - _Requirements: 9.2_
  - [~] 10.4 Verify the extraction without changing tests (optional polish, cuttable)
    - Run lint, typecheck, Vitest and the three-browser suite against the production build, with zero assertions added, removed or changed
    - _Requirements: 9.4_

- [~] 11. Checkpoint: full local release checks
  - Run `pnpm check` (including `check:dist`) and `pnpm test:e2e:release` in all three browsers. Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Reconcile status documentation
  - [~] 12.1 Restructure `PLAN.md` as the single status source
    - Each milestone gets exactly one status (`not started`, `in progress`, `passed`, `failed`, `blocked`) with a YYYY-MM-DD date, the evidence checks and the commit SHA
    - Document the Blocked_Gate format and the evidence commit rule (pending Owner confirmation)
    - _Requirements: 13.1, 13.2_
  - [~] 12.2 Rewrite `README.md` to describe MVP behavior only
    - Describe one experimental `standard-v1` opponent, local browser storage, pot-odds review, export and deletion, plus the `pnpm smoke:live` command
    - Add a section headed exactly "Not in this MVP" listing accounts, OAuth, cloud sync, archive import, difficulty levels, equity coaching, EV-loss grading and strength benchmarking. Link to `PLAN.md` for status and include no status values
    - _Requirements: 13.3, 13.4, 13.7, 12.6_
  - [~] 12.3 Remove status values from `roadmap.md`
    - Remove milestone statuses, completion dates and gate results. Add a relative link to `PLAN.md`
    - _Requirements: 13.7_
  - [~] 12.4 Set the version to `0.1.0-rc.1`
    - Update the root `package.json` version (and the `apps/web` version if it is displayed)
    - _Requirements: 13.5, 13.8_

- [ ] 13. Live smoke tooling and workflows
  - [~] 13.1 Create `tools/smoke-live.mjs` and the `smoke:live` script
    - Fetch the seven paths with a 10 s timeout each. Check for status 200, HTML, the entry module script, the CSP and the two headers
    - In a fresh Chromium context:
      - record every request origin and fail on any foreign origin;
      - poll `/about` for up to 90 s until the commit matches a prefix of at least 7 characters;
      - play one hand within 120 s, open the review, and compare the History result
    - Print a pass/fail line per step with the URL, expected and observed values. Exit with 0 only if every step passes
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [~] 13.2 Write unit tests for smoke-check helpers
    - Cover header validation, foreign-origin detection, commit prefix matching and the non-zero exit on failure
    - _Requirements: 12.4, 12.5, 12.7_
  - [~] 13.3 Update `.github/workflows/deploy.yml`
    - Add a first step that prints `github.sha`. Build with empty Supabase vars, `VITE_APP_ENV=production` and `VITE_GIT_COMMIT=${{ github.sha }}`. Run `pnpm check` (with `check:dist`), then the three-browser e2e on the same `dist`, then PokerKit, then `wrangler deploy` (no rebuild, static assets only)
    - Keep the 25-minute timeout. After deploy, add a `pnpm smoke:live` step with Chromium only
    - _Requirements: 10.3, 11.1, 11.2, 11.3, 11.4, 11.8_
  - [~] 13.4 Update `.github/workflows/ci.yml` for the release branch
    - On pushes to `release/guest-mvp`, run `pnpm check`, the three-browser suite with retries 0, and PokerKit. This serves as the GitHub Actions fallback for checks that cannot run locally
    - _Requirements: 10.6, 10.7_

- [~] 14. Checkpoint: pre-candidate review
  - Run `pnpm check` and `pnpm test:e2e:release`, and confirm that `actionlint` or a YAML parse accepts both workflows if available. Ensure all tests pass, ask the user if questions arise, including confirmation of the evidence commit rule.

- [ ] 15. Candidate_Commit, deployment and delivery
  - [~] 15.1 Commit the Candidate_Commit and run Release_Checks on a clean tree
    - Commit all release changes. Confirm `git status` is clean. Run lint, typecheck, Vitest, the rules fixtures, the build, `check:dist` and the three-browser suite against that `dist`, with no rebuild and retries 0
    - Record in `PLAN.md` (as an evidence commit) each check's name, result, passed/failed counts, the SHA, the date and the entry chunk size
    - For any check that cannot run locally, record the error and use the `ci.yml` run on the same SHA. If any check fails, fix it and start a new Candidate_Commit, or stop and report
    - _Requirements: 9.7, 10.1, 10.3, 10.6, 10.7, 10.8, 10.9_
  - [~] 15.2 Run the PokerKit reference script
    - Run `python tools/reference/pokerkit_rules.py` against the Candidate_Commit fixtures. Record the result, the number of fixtures compared and the number of mismatches in `PLAN.md`
    - _Requirements: 10.2_
  - [~] 15.3 Capture replacement screenshots from the Candidate_Commit build
    - Replace every `docs/screenshots` image whose screen changed, captured from the Candidate_Commit `dist`. No screenshot may show deferred-feature UI. Commit as an evidence commit
    - _Requirements: 13.6_
  - [~] 15.4 Push the release branch
    - Before pushing, re-check that no secret file is in any commit on the branch (stop and report if one is found). Push `release/guest-mvp` with `-u`, never to main. Record the `ci.yml` run URL and result
    - _Requirements: 1.7, 10.7_
  - [~] 15.5 Owner dispatches the Deploy_Workflow on the Candidate_Commit (Owner action)
    - Give the Owner the exact SHA and the dispatch instructions, then wait. Confirm that the run's printed SHA equals the Candidate_Commit SHA (otherwise the deployment is "not delivered")
    - On success, record the run URL, the Cloudflare deployment id and the SHA in `PLAN.md`. On missing or rejected credentials, record a Blocked_Gate with the step, exact error, run URL and Owner action, and mark the deployment "not delivered"
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8_
  - [~] 15.6 Run the live smoke check and record the result
    - Run `pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit <sha>` and record the result, URL, SHA and date in `PLAN.md`
    - If the SPA fallback responses lack the `_headers` rules, stop and ask the Owner about a Worker script (a scope decision)
    - _Requirements: 8.1, 8.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.8_
  - [~] 15.7 Create the `v0.1.0-rc.1` prerelease
    - Only if every Release_Check and the live smoke passed at the Candidate_Commit: run `gh release create v0.1.0-rc.1 --target <sha> --prerelease`, not marked as latest
    - Otherwise leave the tag uncreated and list the unpassed checks. If creating the release fails, record a Blocked_Gate and mark the prerelease "not delivered"
    - _Requirements: 13.5, 14.1, 14.2, 14.7_
  - [~] 15.8 Deliver the Delivery_Report to the Owner
    - Include the delivered behavior; each check run with its result, SHA and location (local or run URL); each check not run with its reason; the repository, Live_Site and prerelease URLs (or "not available" with the reason); the Candidate_Commit SHA; and the open Blocked_Gates
    - State the known limitations. Describe the benchmark and cloud features as deferred. Mark a check as passed only if it has a recorded result in `PLAN.md` or an Actions log
    - _Requirements: 11.6, 11.7, 14.3, 14.4, 14.5, 14.6, 14.8_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Requirements 3.8, 4.2 and 6.2 call for these property tests, so skipping 4.5–4.9, 6.2 or 7.8 leaves those criteria unverified. Record that in `PLAN.md` and the Delivery_Report rather than claiming them.
- Tasks 10.2–10.4 (Req 9.1–9.4) are cuttable polish. The lazy Play route (10.1) and the `check:dist` size gate stay.
- The rules fixtures (4.3), the hook regression tests (3.5), the migration test (6.5) and every e2e scenario (9.5–9.9) are release gates and are required.
- Owner actions: 1.1 (git config consent), 2.1 follow-up (secrets/environment if missing), 14 (evidence commit rule), 15.5 (deploy dispatch), 15.6 stop condition (SPA fallback headers).
- Each property test carries the comment `// Feature: guest-mvp-release, Property N: <title>` and uses at least 100 runs (200 for Properties 3–7).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["3.1", "4.1", "7.1", "6.4"] },
    { "id": 6, "tasks": ["3.2", "4.2", "4.3", "7.2", "6.5"] },
    { "id": 7, "tasks": ["3.3", "3.4", "4.4", "4.5"] },
    { "id": 8, "tasks": ["3.5", "4.6", "6.1"] },
    { "id": 9, "tasks": ["4.7", "6.2", "6.3"] },
    { "id": 10, "tasks": ["4.8", "7.3"] },
    { "id": 11, "tasks": ["4.9", "7.4", "7.5"] },
    { "id": 12, "tasks": ["7.6", "7.7", "9.1", "9.2"] },
    { "id": 13, "tasks": ["7.8", "9.3", "9.4"] },
    { "id": 14, "tasks": ["9.5", "9.6", "9.7", "9.8", "9.9"] },
    { "id": 15, "tasks": ["10.1"] },
    { "id": 16, "tasks": ["10.2"] },
    { "id": 17, "tasks": ["10.3"] },
    { "id": 18, "tasks": ["10.4"] },
    { "id": 19, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 20, "tasks": ["13.1", "13.3", "13.4"] },
    { "id": 21, "tasks": ["13.2"] },
    { "id": 22, "tasks": ["15.1"] },
    { "id": 23, "tasks": ["15.2"] },
    { "id": 24, "tasks": ["15.3"] },
    { "id": 25, "tasks": ["15.4"] },
    { "id": 26, "tasks": ["15.5"] },
    { "id": 27, "tasks": ["15.6"] },
    { "id": 28, "tasks": ["15.7"] },
    { "id": 29, "tasks": ["15.8"] }
  ]
}
```
