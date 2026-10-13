# HeadsUp

HeadsUp is a guest-only practice site for heads-up no-limit Texas Hold’em. You play complete 100bb hands against one experimental opponent, `standard-v1`, and review each of your saved decisions with the visible cards, the pot and exact pot odds. Hands are saved in this browser. Practice chips have no cash value.

The opponent is not GTO and its strength has not been measured. The review shows the price of a call; it does not grade decisions or calculate EV loss.

![Desktop practice table](docs/screenshots/table-desktop.png)

![Decision review with pot odds](docs/screenshots/review-desktop.png)

## What the MVP does

- **Play:** 50/100 blinds, fresh 10,000-chip stacks each hand and an alternating dealer button. Hands can be played with the mouse or the keyboard. A "Show bb" toggle switches every amount between chips and big blinds.
- **Opponent:** one experimental policy, `standard-v1`, running in a browser Web Worker. It receives only its own hole cards and the public table state. It never sees your cards, undealt board cards or the deck order.
- **Local storage:** completed hands and an unfinished hand are saved in IndexedDB on this device. A reload mid-hand restores the same hand. There is no account or cloud backup, so clearing browser data deletes saved hands and they are not available on other devices.
- **History and review:** History lists each saved hand and its result. Review steps through your decisions, showing your hole cards, the board at that moment, the pot, the price to call and the pot odds. The outcome (final board, result and the bot's cards when the hand reached showdown) stays collapsed until you open it.
- **Export and deletion:** Settings exports every saved hand as a versioned JSON archive and deletes all local data after an explicit confirmation.

## Not in this MVP

These features are deferred. None of them is available in the app.

- Accounts
- OAuth (Google or any other sign-in)
- Cloud sync
- Archive import
- Difficulty levels
- Equity coaching
- EV-loss grading
- Strength benchmarking

See [roadmap.md](roadmap.md) for planning.

## Quickstart

Install Node.js **24.20.0** and Corepack, then from the repository root:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). No `.env` file, account or backend is needed. Choose **Start playing**, then **Deal the first hand**.

## Commands

| Command | Result |
| --- | --- |
| `pnpm dev` | Vite development server |
| `pnpm build` | Production build in `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm test` | Unit and integration tests |
| `pnpm test:rules` | Rules engine regression fixtures |
| `pnpm check:dist` | Checks the built `dist/` (entry chunk size, security headers, no cloud or test-only code) |
| `pnpm check` | Lint, typecheck, unit/integration tests, build and `check:dist` |
| `pnpm test:e2e` | Chromium browser tests; run `pnpm exec playwright install chromium` once |
| `pnpm test:e2e:release` | Chromium, Firefox and WebKit browser suite; install all three Playwright browsers first |
| `pnpm smoke:live --url <url> --commit <sha>` | Live smoke check of a deployed site against an expected commit |

The rules reference comparison runs with `python tools/reference/pokerkit_rules.py`.

## Live smoke check

After a deployment, run:

```text
pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit <sha>
```

It first waits up to 90 s until `<sha>` is served stably: 5 consecutive probes, at least 3 s apart, must each show `<sha>` on the About page and in the entry script of a directly fetched `/`. Right after `wrangler deploy`, Cloudflare can briefly answer with a 404, or with the previous and the new version side by side. Then it requests every app route and an unknown path directly, checks the security headers, requires each page's entry script to embed `<sha>`, plays one hand in a fresh Chromium profile, opens its review, confirms History shows the same result, fails on any request to another origin, and compares the build commit on the About page with `<sha>`. It exits with status zero only when every check passes.

## Data and privacy

All data stays in this browser's IndexedDB. The app makes no requests to any origin other than the one serving it, and uses no analytics. The hosting provider receives ordinary web requests. Export your hands from Settings before clearing browser storage.

See [architecture](docs/architecture.md) and [bot policy](docs/bot-policy.md) for implementation details, and the [deployment runbook](docs/deployment.md) for publishing the static site.

## Contributing and license

First-party code is [MIT licensed](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) cover the patched rules engine and the PokerKit reference.
