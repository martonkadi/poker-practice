# Requirements Document

## Introduction

This spec finishes and ships the guest-only heads-up no-limit Hold'em practice MVP defined in `PLAN.md` and `roadmap.md` (owner-approved September 30, 2026; target October 2, contingency October 3–4). A guest plays complete hands against one experimental bot, hands are saved in this browser, and each saved decision can be reviewed with visible cards, pot and exact pot odds.

Most gameplay and recovery work (roadmap items 1–4 and 6) already exists as roughly 25 uncommitted files on top of commit `4ac8b7d`. Current verified baseline: TypeScript, ESLint, Vite build, Vitest 23/23 and Playwright Chromium 11/11 pass against the preview build. The Firefox/WebKit suite, the PokerKit reference and deployment have not run. The last recorded response from the intended live URL was 404.

The remaining work: preserve the existing work, fix known defects, close the action-recording and verification gaps, reconcile documentation with actual behavior, deploy to Cloudflare at $0 recurring cost, smoke-test the live site, and deliver an honest report.

Out of scope (deferred by the owner): accounts, OAuth, Supabase deployment and sync, cloud import, difficulty selection, strength benchmarking, sampled-equity coaching, EV-loss grading, advanced statistics, six seats, continuous stacks and native solving. No mock of a deferred feature may be presented as implemented.

## Glossary

- **Owner**: The repository owner who approves scope, credentials and git configuration changes.
- **Guest**: A person using the Web_App without an account.
- **Web_App**: The React single-page application in `apps/web`, served as static files.
- **Play_Controller**: The `useGame` hook and session functions in `apps/web/src` that coordinate hero actions, bot decisions, dealing and saving.
- **Poker_Adapter**: The `packages/poker` module that wraps the upstream rules engine behind shared contracts.
- **Bot_Worker**: The Web Worker that runs the experimental `standard-v1` opponent policy.
- **Session_Store**: The IndexedDB persistence layer in `packages/persistence`.
- **Hand_Record**: A completed hand stored under schema version 1 (`handRecordSchema` in `packages/contracts`).
- **Decision_Record**: One saved decision in a Hand_Record: the table frame before the action, the canonical action, the chips contributed, and the hero's hole cards.
- **Canonical_Action**: One of `fold`, `check`, `call`, or `raiseTo(amount)`. An all-in that only matches the outstanding bet is a `call`.
- **Busy_State**: The Play_Controller flag that disables table controls while an action, deal or bot decision is in progress.
- **Review_Screen**: The `/review/:handId` page.
- **History_Screen**: The `/history` page.
- **Settings_Screen**: The `/settings` page, which offers export and deletion.
- **Export_Archive**: The versioned JSON file produced by the Settings_Screen export.
- **Chip_Display_Preference**: The stored "Show bb" setting that chooses between chip and big-blind units.
- **Release_Checks**: Lint, TypeScript, unit/integration tests, rules fixtures, production build, the PokerKit reference script, and the Chromium/Firefox/WebKit browser suite run against the built artifact.
- **Candidate_Commit**: The exact git commit whose built artifact passes the Release_Checks and is deployed.
- **Deploy_Workflow**: The manually dispatched GitHub Actions workflow `.github/workflows/deploy.yml`.
- **Live_Site**: The deployed Cloudflare Workers static site, intended at `https://poker-practice.marton-kadi.workers.dev`.
- **Live_Smoke_Check**: A repeatable check run against the Live_Site after deployment.
- **Blocked_Gate**: A release step that cannot finish because an external provider, credential or permission is unavailable, recorded with the exact failing step and error.
- **Status_Docs**: `PLAN.md` (the single source of truth for milestone status), `roadmap.md`, and `README.md`.
- **Delivery_Report**: The final report to the Owner listing behavior, checks actually run, URLs, identifiers and remaining limitations.
- **Referrer-Policy value**: Wherever these requirements refer to the `Referrer-Policy` header, the required value is `no-referrer`.

## Requirements

### Requirement 1: Preserve existing work before changes

**User Story:** As the Owner, I want the existing uncommitted implementation saved in version control before new changes start, so that verified work cannot be lost or confused with new work.

#### Acceptance Criteria

1. WHEN release work begins, THE implementing agent SHALL create a new non-main branch from commit `4ac8b7d` and commit all existing modified and untracked files there before modifying, adding or deleting any file in the working tree.
2. WHEN the preservation commit is created, THE implementing agent SHALL confirm that `git status` reports no remaining modified or untracked files other than the files excluded under criterion 6, and SHALL report the commit SHA and branch name to the Owner.
3. WHEN the preservation commit is created, THE implementing agent SHALL record in the commit message or in `PLAN.md` the Vitest passed/total count and the Playwright Chromium passed/total count, run against the preview build of the preserved state before any file is changed.
4. IF Vitest or Playwright Chromium reports one or more failing tests on the preserved state, THEN THE implementing agent SHALL still commit the preserved state, SHALL record the name of each failing test next to the counts from criterion 3, and SHALL NOT describe the preserved state as passing.
5. IF git refuses an operation because of repository ownership, THEN THE implementing agent SHALL report the exact error text to the Owner, SHALL leave the working tree unchanged, and SHALL wait for Owner consent before changing any global or repository git configuration.
6. IF the working tree contains a file whose name starts with `.env` (other than `.env.example`), or a file containing private keys, access tokens or credentials, THEN THE implementing agent SHALL leave that file out of every commit, SHALL leave the file unchanged on disk, and SHALL name each excluded file (without its contents) in its report to the Owner.
7. IF a file with secrets from criterion 6 is found in an existing commit on the branch, THEN THE implementing agent SHALL stop before pushing and report the file name and commit SHA to the Owner.

### Requirement 2: Busy state always recovers

**User Story:** As a Guest, I want the table controls to become usable again after every bot turn, so that I am never stuck with disabled buttons.

#### Acceptance Criteria

1. WHEN a bot decision arrives after the active session has changed since the request was sent, THE Play_Controller SHALL discard the decision without saving it and SHALL clear the Busy_State within 500 ms of the decision arriving.
2. WHEN a pending bot request is cancelled by navigation, unmount or session change, THE Play_Controller SHALL clear the Busy_State that the request set within 500 ms of the cancellation, SHALL save no action from that request, and SHALL show no error message for the cancellation.
3. WHEN a bot decision is accepted, THE Play_Controller SHALL keep the Busy_State set until the resulting save either succeeds or fails, and SHALL clear the Busy_State within 500 ms of the save finishing.
4. IF a bot request fails or returns no decision within 10 seconds, THEN THE Play_Controller SHALL clear the Busy_State, keep the session at the state it had before the request, and show an error message indicating the bot decision failed together with a "Retry bot" control.
5. WHEN the Guest activates the "Retry bot" control, THE Play_Controller SHALL remove the error message, set the Busy_State and send one new bot request for the same unchanged session state.
6. IF saving a hero action, bot action or new deal fails, THEN THE Play_Controller SHALL clear the Busy_State, keep the session at the last successfully saved state, and show an error message indicating the action was not saved.
7. WHILE the Busy_State is set, THE Web_App SHALL disable every table action control and SHALL record no action from clicks or key presses on those controls.
8. WHILE the hero is the actor and the Busy_State is clear, THE Web_App SHALL enable every action control that is in the current legal action set and SHALL disable or hide every action control that is not in that set.
9. THE test suite SHALL include at least one regression test each for criteria 1, 2, 4 and 6, and each test SHALL assert that the Busy_State is clear and hero action controls are enabled when the hero is the actor after the scenario finishes.

### Requirement 3: Canonical action recording and chip conservation

**User Story:** As a Guest reviewing a hand, I want every saved action and amount to match what actually happened at the table, so that the review shows correct information.

#### Acceptance Criteria

1. WHEN a player goes all-in for chips that match or fall short of the outstanding bet, THE Play_Controller SHALL record a Decision_Record with Canonical_Action `call` and an amount equal to the chips that player added to the pot with that action. The amount may be less than the outstanding bet when the caller's stack is smaller.
2. WHEN a player's all-in makes that player's total commitment on the street greater than the current highest bet, THE Play_Controller SHALL record a Decision_Record with Canonical_Action `raiseTo(amount)`, where `amount` equals that player's total commitment on the street after the action. The Decision_Record amount SHALL equal only the chips added by that action.
3. WHEN a player folds or checks, THE Play_Controller SHALL record a Decision_Record with Canonical_Action `fold` or `check` respectively and an amount of 0.
4. WHEN a call closes a betting street, THE Play_Controller SHALL save that call's Decision_Record with a frame whose street is the closing street. THE Decision_Record SHALL appear in the Decision_Record list before the first Decision_Record whose frame shows any card of the next street.
5. FOR ALL completed hands, THE hero stack, bot stack and pot SHALL total 20,000 chips in every Decision_Record frame, and the final hero and bot stacks SHALL total 20,000 chips (conservation invariant).
6. FOR ALL completed hands, replaying the saved Canonical_Actions in saved order through the Poker_Adapter, from the same deck order and button, SHALL reproduce the saved final board, `heroNet`, `reachedShowdown` and `heroWonShowdown` values exactly (replay property).
7. FOR ALL completed hands, the hero's Decision_Record amounts plus the hero's posted blind SHALL equal the hero's total contribution to the pot. The posted blind is 50 chips when the hero holds the button and 100 chips otherwise.
8. THE test suite SHALL check criteria 5, 6 and 7 on at least 200 generated complete hands using an injected random source, and SHALL report the failing deck and action sequence when any check fails.
9. IF the Play_Controller cannot match an accepted action to the acting player's latest action in the Poker_Adapter history, THEN THE Play_Controller SHALL skip saving that action, leave the last saved active session and Hand_Records unchanged, and show an error message saying the action could not be recorded.
10. THE rules regression fixtures SHALL include at least one fixed-deck hand for each of these cases, and each fixture SHALL assert the expected Canonical_Action and amount of every Decision_Record: preflop all-in call, postflop all-in call, all-in call for less than the outstanding bet, all-in raise, a street-closing call, fold after a raise, and split pot.

### Requirement 4: Hidden-card isolation

**User Story:** As a Guest, I want the bot and the decision review to use only information available at that moment, so that practice results are fair.

#### Acceptance Criteria

1. THE Poker_Adapter SHALL build each bot observation only from the bot's two hole cards and the public table state at that decision: the board cards dealt so far, both stacks, the pot, the current street bets, the button position, the Canonical_Actions taken so far in the hand, and the bot's legal action set.
2. THE test suite SHALL include a property test that generates at least 100 hands covering preflop, flop, turn and river bot decisions and verifies that every bot observation contains none of the hero's hole cards, no board card not yet dealt at that decision, and no deck order.
3. WHILE a Review_Screen decision is displayed and the outcome section is collapsed, THE Review_Screen SHALL show the hero's two hole cards and exactly the board cards in that Decision_Record frame (0 preflop, 3 on the flop, 4 on the turn, 5 on the river), and SHALL show none of the bot's hole cards, no later board card and no hand result, with the outcome section collapsed by default each time the Review_Screen loads.
4. WHEN a Guest opens the collapsed outcome section on the Review_Screen, THE Review_Screen SHALL show the final board (the board cards dealt before the hand ended) and the hand result as the hero's net chips won or lost.
5. WHEN the Play_Controller sends a bot request to the Bot_Worker, THE Play_Controller SHALL include only the bot observation defined in criterion 1, with none of the hero's hole cards, undealt board cards or deck order in the request.
6. WHEN a Guest opens the collapsed outcome section of a hand that reached showdown, THE Review_Screen SHALL show the bot's two hole cards.
7. IF a hand ended by a fold, THEN THE Review_Screen SHALL show none of the bot's hole cards and no undealt board card in any section, including the opened outcome section.

### Requirement 5: MVP scope isolation

**User Story:** As the Owner, I want deferred cloud and coaching code kept out of the shipped app, so that the MVP makes no promises or network calls it cannot back up.

#### Acceptance Criteria

1. THE Web_App production build output SHALL contain zero occurrences, in any JavaScript file, of Supabase client code, OAuth authorization calls or cloud sync calls. The check is a case-insensitive search of the build output for the string `supabase` and for the module identifiers of `apps/web/src/cloud.ts`.
2. THE Web_App SHALL render no visible control, link, menu item or route for sign-in, sync, archive import, difficulty selection, animation speed, equity estimates or action recommendations on any page reachable from the home page.
3. WHEN a Guest navigates directly to a path intended for a deferred feature (sign-in, sync or import), THE Web_App SHALL render the same not-found view it renders for any unknown path.
4. THE implementing agent SHALL either remove `apps/web/src/cloud.ts` and the unused Bot_Worker `equity` message kind, or add a check to the Release_Checks that fails the build if the Web_App entry point imports either one, directly or transitively.
5. WHEN the Session_Store opens a database created by an earlier build (Dexie versions 1 and 2), THE Session_Store SHALL read every existing Hand_Record, bookmark and the active session. The count and field values of each record after opening SHALL equal those before opening.
6. IF the Session_Store fails to open or upgrade a database created by an earlier build, THEN THE Session_Store SHALL leave the existing stored data unmodified, and THE Web_App SHALL show an error message stating that saved hands could not be loaded and have not been deleted.
7. THE test suite SHALL include a test that seeds a Dexie version 1 database and a Dexie version 2 database, each with at least one Hand_Record, one bookmark and one active session, then verifies criterion 5 against both.
8. THE Hand_Record schema SHALL stay at version 1 during this release, and every Hand_Record written by the Web_App SHALL validate against `handRecordSchema` version 1.
9. THE Web_App SHALL show the opponent's name as `standard-v1` together with the word "experimental" on both the Play page and the About page.
10. THE Web_App SHALL display none of the terms "GTO", "game theory optimal", "solver", "EV loss" or any claim of opponent strength or skill level on any page, except in statements that explicitly deny such a claim (for example "not GTO").

### Requirement 6: Local data export and deletion

**User Story:** As a Guest, I want to export and delete my saved hands, so that I control my data in this browser.

#### Acceptance Criteria

1. WHEN a Guest selects "Export JSON", THE Settings_Screen SHALL download a single Export_Archive file with format `poker-practice` and schema version 1 that contains every Hand_Record in the Session_Store at the moment of selection, including an empty hand list when zero Hand_Records are saved.
2. FOR ALL Export_Archives produced by the Settings_Screen, parsing the archive and validating each hand with `handRecordSchema` SHALL succeed, and the parsed hand count and each parsed record SHALL equal the saved Hand_Records field for field (round-trip property).
3. WHEN a Guest selects the delete control, THE Settings_Screen SHALL ask for explicit confirmation before removing any data.
4. WHEN a Guest confirms deletion and no other tab holds the session lock, THE Settings_Screen SHALL delete every Hand_Record, every bookmark, the active session and the Chip_Display_Preference from the Session_Store, and then navigate to the home page.
5. IF a Guest cancels the deletion confirmation, THEN THE Settings_Screen SHALL keep all Hand_Records, bookmarks, the active session and the Chip_Display_Preference unchanged and stay on the Settings_Screen.
6. IF another tab holds the session lock during a deletion request, THEN THE Settings_Screen SHALL keep all data unchanged, stay on the Settings_Screen, and show a message asking the Guest to close the other tab.
7. IF the Session_Store fails during deletion, THEN THE Settings_Screen SHALL stay on the Settings_Screen and show an error message indicating that deletion did not complete.
8. IF an export fails, THEN THE Settings_Screen SHALL download no partial file and show a message stating that the export failed and saved data is unchanged, with every Hand_Record still present in the Session_Store.
9. THE Settings_Screen SHALL state that there is no account or cloud backup and that clearing browser data deletes saved hands.

### Requirement 7: Consistent chip display

**User Story:** As a Guest, I want amounts shown in the unit I chose, so that the table and history read the same way.

#### Acceptance Criteria

1. WHILE the Chip_Display_Preference is set to big blinds, THE History_Screen SHALL show each hand result as the hero's net chips for that Hand_Record divided by that hand's big blind, rounded to one decimal place and labeled with the big-blind unit ("bb").
2. WHILE the Chip_Display_Preference is set to chips, THE History_Screen SHALL show each hand result as the hero's net chips for that Hand_Record as a whole number labeled with the chip unit.
3. IF no Chip_Display_Preference has been stored or the stored Chip_Display_Preference cannot be loaded, THEN THE History_Screen SHALL show every hand result in chips as defined in criterion 2, still list every saved Hand_Record, and leave any stored Chip_Display_Preference unchanged.
4. THE History_Screen SHALL show each hand result with a leading "+" for a net win, a leading "−" for a net loss, and no sign for a net result of zero, in both units.
5. WHILE the Chip_Display_Preference is set to a unit, THE Web_App SHALL show stacks, pot and bet amounts on the Play page in the same unit as the History_Screen.
6. WHEN the Guest changes the Chip_Display_Preference, THE Web_App SHALL show amounts on the Play page and the History_Screen in the newly selected unit within 1 second, without a page reload, and SHALL keep the new unit after the page reloads.

### Requirement 8: Static hosting security headers

**User Story:** As the Owner, I want the public site served with restrictive headers, so that injected scripts and unexpected connections are blocked.

#### Acceptance Criteria

1. THE Live_Site SHALL send a Content-Security-Policy header on every HTML response, including the Web_App shell served for `/`, every client route, `/review/<unknown-id>` and unknown paths, containing at least the directives `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `worker-src 'self'`, `connect-src 'self'`, `object-src 'none'` and `base-uri 'self'`.
2. THE Content-Security-Policy sent by the Live_Site SHALL contain no `'unsafe-inline'`, `'unsafe-eval'`, `blob:`, `data:` in any script, style or worker directive, no wildcard (`*`) source, and no origin other than `'self'`.
3. THE Live_Site SHALL send `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` on every response, including HTML, JavaScript chunks, the Bot_Worker module script, CSS files (including CSS module output), `/license.txt` and the unknown-path fallback.
4. THE Web_App deployment artifact SHALL define the headers in criteria 1–3 in the Cloudflare static assets `_headers` file, and that file SHALL be the only place these header values are defined.
5. THE Live_Site SHALL serve JavaScript files (including the Bot_Worker module script) with a JavaScript MIME type, CSS files with `text/css`, and `/license.txt` with `text/plain`, so that `nosniff` blocks none of them.
6. WHEN the browser suite runs in Chromium, Firefox and WebKit against the production build served with the headers from the `_headers` file, THE Web_App SHALL start the Bot_Worker as a module worker from a same-origin script URL, complete a full hand including at least one bot decision, open that hand's Review_Screen, produce an Export_Archive and open the `/license.txt` link, with zero CSP violation messages in the browser console and zero `securitypolicyviolation` events.
7. IF any header from criteria 1–3 is missing or differs from the specified value, or any CSP violation occurs during the run in criterion 6, THEN THE Release_Checks SHALL fail, naming the header or blocked resource and the request URL, and THE Deploy_Workflow SHALL NOT reach the `wrangler deploy` step.

### Requirement 9: Code organization and bundle size (optional polish)

**User Story:** As the Owner, I want the screens split into reviewable files and the initial download kept small, so that future changes are easier to verify.

**Priority note:** This requirement is optional polish. It may be cut if the October 2 target is at risk.

#### Acceptance Criteria

1. WHEN the page modules are extracted, THE implementing agent SHALL move each of the seven page components currently defined in `apps/web/src/main.tsx` (Home, Play, History, Review, Settings, About and the "Page not found" fallback) into its own module, one page component per module.
2. WHEN the page modules are extracted, THE implementing agent SHALL move the shared components used by more than one page (`CardFace`, `Cards`, `Shell` and the `displayAction` helper) out of `apps/web/src/main.tsx`, so that `main.tsx` contains only application bootstrap and the route table.
3. WHEN the page modules are extracted, THE Web_App SHALL serve the same seven routes (`/`, `/play`, `/history`, `/review/:handId`, `/settings`, `/about` and the unknown-path fallback), with the same visible text on each route as before the extraction.
4. WHEN the page modules are extracted, THE implementing agent SHALL run lint, TypeScript, the Vitest suite and the Chromium, Firefox and WebKit browser suite against the production build, and every check SHALL pass with zero test assertions added, removed or changed.
5. WHEN the production build completes, THE Web_App production build SHALL produce an entry JavaScript chunk of no more than 500,000 bytes before compression, measured as the uncompressed size of the JavaScript file referenced by the built `index.html` entry script tag.
6. IF the entry JavaScript chunk exceeds 500,000 bytes before compression, THEN THE Release_Checks SHALL report a failure that states the measured size and the 500,000-byte limit, and the build SHALL NOT be used as the Candidate_Commit artifact.
7. WHEN the entry chunk size check runs, THE implementing agent SHALL record the measured entry chunk size in bytes with the other Release_Check results.

### Requirement 10: Release checks on the built artifact

**User Story:** As the Owner, I want every release check run against the exact artifact being deployed, so that the live site matches tested code.

#### Acceptance Criteria

1. WHEN a Candidate_Commit is proposed, THE implementing agent SHALL run lint, TypeScript, unit/integration tests, rules fixtures and the production build from a clean working tree at that Candidate_Commit, and SHALL record in `PLAN.md` for each check: the check name, pass or fail, passed and failed test counts where applicable, the Candidate_Commit SHA and the run date.
2. WHEN a Candidate_Commit is proposed, THE implementing agent SHALL run `tools/reference/pokerkit_rules.py` against the rules fixtures of the Candidate_Commit and record in `PLAN.md` the pass or fail result, the number of fixtures compared and the number of mismatches.
3. WHEN a Candidate_Commit is proposed, THE browser suite SHALL run in Chromium, Firefox and WebKit against the production build output produced from that Candidate_Commit, with no rebuild between the browser suite and deployment.
4. THE browser suite SHALL cover each of the following scenarios in each of the three browsers:
   - a hand to showdown;
   - a hand ending in a fold;
   - three consecutive hands in which the button alternates between the hero and the bot on each hand;
   - a page reload mid-hand that restores the same hand state;
   - five clicks or five key presses on one action control within 500 ms producing exactly one Decision_Record;
   - a Bot_Worker failure followed by "Retry bot" completing the bot turn;
   - navigation away during a bot turn followed by a return with controls enabled;
   - takeover after another tab advanced the hand;
   - a Review_Screen route with an unknown hand id showing a not-found message;
   - export;
   - deletion;
   - a complete hand played using only the keyboard;
   - a 390 px wide viewport on every page where the document scroll width does not exceed 390 px.
5. THE browser suite SHALL use test fixtures supplied through test tooling only, and the Release_Checks SHALL include a check that fails if the production bundle contains any test fixture injection hook or test-only entry point.
6. THE implementing agent SHALL count a Release_Check as passed only when the check exits with status zero and reports zero failed tests, with automatic test retries disabled.
7. IF a Release_Check cannot run in the local environment, THEN THE implementing agent SHALL record in `PLAN.md` the check name and the exact error or missing prerequisite, and SHALL run that check in GitHub Actions on the same Candidate_Commit SHA and record the workflow run URL and result before deployment.
8. IF any Release_Check fails, THEN THE implementing agent SHALL either fix the defect or stop the release and report the failing check name and error to the Owner, and SHALL NOT deploy the failing Candidate_Commit.
9. IF any file changes after the Release_Checks pass on a Candidate_Commit, THEN THE implementing agent SHALL treat the resulting commit as a new Candidate_Commit and rerun every Release_Check on it before deployment.

### Requirement 11: Deployment with honest blocked-gate recording

**User Story:** As the Owner, I want the tested artifact deployed at $0 recurring cost, with any provider blocker recorded exactly, so that I know the true release state.

#### Acceptance Criteria

1. WHEN the Owner dispatches the Deploy_Workflow on the Candidate_Commit, THE Deploy_Workflow SHALL build the Web_App with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set to empty strings, `VITE_APP_ENV` set to `production`, and `VITE_GIT_COMMIT` set to the full 40-character Candidate_Commit SHA.
2. WHEN the Deploy_Workflow runs, THE Deploy_Workflow SHALL run every Release_Check (lint, TypeScript, unit/integration tests, rules fixtures, production build, the PokerKit reference script, and the Chromium, Firefox and WebKit browser suite) against the built artifact and complete all of them before the `wrangler deploy` step starts.
3. IF any Release_Check step in the Deploy_Workflow fails, or the run exceeds the workflow's 25-minute job timeout, THEN THE Deploy_Workflow SHALL end the run with a failed status without executing `wrangler deploy`, and the previously deployed Live_Site version SHALL remain unchanged.
4. THE Deploy_Workflow SHALL deploy only static Web_App assets to the Cloudflare Workers free plan and SHALL create no database migration, Edge Function, storage binding or other resource that adds a recurring charge to the Cloudflare account.
5. IF the Cloudflare credentials are missing (empty `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`) or rejected by Cloudflare during `wrangler deploy`, THEN THE implementing agent SHALL record a Blocked_Gate in `PLAN.md` and the Delivery_Report naming the failing workflow step, the exact error text, the workflow run URL and the Owner action required.
6. WHILE a Blocked_Gate exists for deployment, THE implementing agent SHALL continue the release work that does not depend on the Live_Site and SHALL describe the deployment as "not delivered" in `PLAN.md` and the Delivery_Report.
7. WHEN the `wrangler deploy` step exits successfully and reports a deployment identifier, THE implementing agent SHALL record the workflow run URL, the Cloudflare deployment identifier and the Candidate_Commit SHA in `PLAN.md` and the Delivery_Report.
8. IF a Deploy_Workflow run was dispatched on a commit whose SHA differs from the Candidate_Commit SHA, THEN THE implementing agent SHALL NOT record that run as the deployment of the Candidate_Commit and SHALL describe the deployment as "not delivered" until a run on the Candidate_Commit succeeds.

### Requirement 12: Live smoke check

**User Story:** As the Owner, I want the live site checked after each deployment, so that a public URL is confirmed working rather than assumed.

#### Acceptance Criteria

1. WHEN a deployment finishes, THE Live_Smoke_Check SHALL request `/`, `/play`, `/history`, `/settings`, `/about`, `/review/<unknown-id>` and one unknown path directly (without in-app navigation), and SHALL pass each request only if it returns HTTP 200 within 10 seconds with an HTML document that loads the Web_App entry script.
2. WHEN the Live_Smoke_Check loads the Live_Site in a browser profile with no saved Web_App data, THE Live_Smoke_Check SHALL play one hand to completion (showdown or fold) within 120 seconds, open that hand's Review_Screen, and confirm that the History_Screen lists that hand with the same result shown in the Review_Screen.
3. WHILE the Live_Smoke_Check runs, IF any network request goes to an origin other than the Live_Site origin, THEN THE Live_Smoke_Check SHALL fail and report each such origin.
4. WHEN the Live_Smoke_Check opens the About page, THE Live_Smoke_Check SHALL pass only if the displayed build commit equals the Candidate_Commit SHA supplied as a parameter, or equals a prefix of it at least 7 characters long.
5. WHEN a deployment finishes, THE Live_Smoke_Check SHALL verify that every HTML response checked in criterion 1 carries the Content-Security-Policy header from Requirement 8, and that every response checked in criteria 1 and 2 carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
6. THE Live_Smoke_Check SHALL be runnable as a single documented command that takes the target URL and the expected Candidate_Commit SHA as parameters, and SHALL exit with status zero only when every check in criteria 1 to 5 passes.
7. IF any Live_Smoke_Check step fails, times out, or cannot reach the Live_Site, THEN THE Live_Smoke_Check SHALL exit with a non-zero status and report the failing step, the requested URL, and the expected and observed values.
8. WHEN the Live_Smoke_Check finishes, THE implementing agent SHALL record the pass or fail result, the target URL, the Candidate_Commit SHA and the run date in `PLAN.md`.

### Requirement 13: Status documentation matches behavior

**User Story:** As the Owner, I want one source of truth for project status and a README that describes what the app actually does, so that I can trust the documentation.

#### Acceptance Criteria

1. THE `PLAN.md` file SHALL be the only Status_Docs file that records a milestone status, and each milestone entry SHALL show exactly one status value: `not started`, `in progress`, `passed`, `failed` or `blocked`.
2. WHEN a milestone gate passes, fails or becomes a Blocked_Gate, THE implementing agent SHALL update `PLAN.md` before starting the next gate. The update SHALL include the new status, the date in YYYY-MM-DD format, the name and result (pass, fail or not run) of each check used as evidence, and the Candidate_Commit SHA. For a Blocked_Gate, it SHALL also include the failing step and the error text.
3. THE `README.md` file SHALL describe only MVP behavior, meaning one experimental `standard-v1` opponent, hands saved in local browser storage, pot-odds review, export and deletion. Outside the "Not in this MVP" section, it SHALL NOT describe any deferred feature as available.
4. THE `README.md` file SHALL contain a section headed exactly "Not in this MVP" that names each of these deferred features: accounts, OAuth, cloud sync, archive import, difficulty levels, equity coaching, EV-loss grading and strength benchmarking.
5. WHEN the prerelease tag from Requirement 14 exists, THE `package.json` version SHALL equal the tag's version string, ignoring a leading `v`.
6. WHEN a release change alters the rendered text, controls or layout of a screen shown in `docs/screenshots`, THE implementing agent SHALL replace every affected screenshot with a capture from the Candidate_Commit production build before issuing the Delivery_Report. No replacement screenshot SHALL show UI for a deferred feature.
7. THE `README.md` and `roadmap.md` files SHALL each contain a relative link to `PLAN.md` for status. Neither file SHALL contain any milestone status value, completion date or gate result.
8. WHILE the prerelease tag from Requirement 14 does not exist, THE `package.json` version SHALL carry a semantic-version pre-release suffix, which is a hyphen followed by an identifier.

### Requirement 14: Prerelease and delivery report

**User Story:** As the Owner, I want a tagged prerelease and an honest report, so that I know exactly what shipped, what was checked, and what remains.

#### Acceptance Criteria

1. WHEN every Release_Check has passed against the Candidate_Commit and the Live_Smoke_Check has passed against a Live_Site whose displayed build commit equals the Candidate_Commit SHA, THE implementing agent SHALL create a GitHub release marked as a prerelease (not as the latest full release), tagged at the Candidate_Commit, with a tag name containing the `package.json` version defined in Requirement 13.
2. IF any Release_Check has not passed against the Candidate_Commit, or the Live_Smoke_Check has not passed against the Candidate_Commit deployment, THEN THE implementing agent SHALL leave the prerelease and its tag uncreated and state in the Delivery_Report each unpassed check by name and the reason it did not pass.
3. WHEN the release work ends, whether the release was delivered or stopped, THE implementing agent SHALL give the Owner a Delivery_Report listing:
   - the delivered behavior;
   - each check actually run with its name, its pass/fail result, the commit SHA it ran against and where it ran (local or the GitHub Actions run URL);
   - each check not run with its reason;
   - the repository URL;
   - the Live_Site URL;
   - the prerelease URL;
   - the Candidate_Commit SHA;
   - each open Blocked_Gate with its step, error text and required Owner action.
4. IF a Live_Site URL, prerelease URL or Cloudflare deployment identifier does not exist at the time of the Delivery_Report, THEN THE Delivery_Report SHALL mark that item as not available and state the reason, and SHALL NOT substitute the intended URL as if it were live.
5. THE Delivery_Report SHALL state the known limitations: browser-only storage that is lost when browser data is cleared, no cross-device access, an experimental opponent of unmeasured strength, and no decision grading.
6. THE Delivery_Report SHALL describe the strength benchmark and cloud features as deferred, not as passed or implemented.
7. IF creating the prerelease tag or GitHub release fails, THEN THE implementing agent SHALL record a Blocked_Gate naming the failing step, the error text and the Owner action required, and SHALL describe the prerelease as not delivered in the Delivery_Report.
8. THE Delivery_Report SHALL mark a check as passed only if a recorded result for that check at the Candidate_Commit exists in `PLAN.md` or in a GitHub Actions run log.
