# HeadsUp

HeadsUp is a practice site for heads-up no-limit Texas Hold'em. You play full 100bb hands against an experimental bot, and every hand is saved in your browser so you can go back over your decisions afterwards. No sign-up. The chips aren't real money.

**Play it:** https://poker-practice.marton-kadi.workers.dev

![The practice table](docs/screenshots/table-desktop.png)

![Reviewing a decision with pot odds](docs/screenshots/review-desktop.png)

## What you can do

- **Play.** Blinds are 50/100, both players start every hand with 10,000 chips, and the button alternates. Use the mouse or the keyboard. "Show bb" switches the table, bet input and actions between chips and big blinds. Bets accept hundredths of a big blind (one chip).
- **Play the bot.** The opponent, `standard-v1`, runs in a Web Worker in your browser. It sees only its own cards and the public table. It never sees your cards, the deck or cards that haven't been dealt.
- **Pick up where you left off.** Finished hands and the hand in progress are saved in your browser. Reload mid-hand and you're back in the same spot.
- **Review your decisions.** History lists every hand and its result. Review steps through each of your decisions with your cards, the board at that moment, the pot, the price to call and the pot odds. The outcome stays hidden until you open it.
- **Export or delete.** Settings downloads your hands as a compact JSON file, shows progress and lets you cancel. It can delete everything after you confirm.

## Good to know

- The bot is experimental. It isn't a solver, and its strength hasn't been measured.
- Review shows the price of a call. It doesn't tell you whether a decision was right, and it doesn't estimate EV.
- Hands live only in this browser. Clearing browser data deletes them, and they don't follow you to another device. Export them if you want a copy.

## Not there yet

Accounts and sign-in, cloud sync, importing an export, difficulty levels, equity coaching, decision grading and bot strength benchmarks. See the [roadmap](roadmap.md) for what's next.

## Run it locally

You need Node.js 24.20.0 and Corepack. From the repo root:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL Vite prints (usually http://localhost:5173), choose **Start playing**, then **Deal the first hand**. You don't need a `.env` file, an account or a backend.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the Vite dev server |
| `pnpm build` | Builds the site into `dist/` |
| `pnpm preview` | Serves the production build |
| `pnpm lint` | Runs ESLint |
| `pnpm typecheck` | Runs the strict TypeScript check |
| `pnpm test` | Runs the unit and integration tests |
| `pnpm test:rules` | Runs the poker rules regression tests |
| `pnpm check:dist` | Checks the built `dist/`: entry chunk size, security headers, and no cloud or test-only code |
| `pnpm check` | Runs lint, typecheck, tests, build and `check:dist` |
| `pnpm test:e2e` | Runs the browser tests in Chromium (first run `pnpm exec playwright install chromium`) |
| `pnpm test:e2e:release` | Runs the browser tests in Chromium, Firefox and WebKit (install all three browsers first) |
| `pnpm smoke:live --url <url> --commit <sha>` | Checks a deployed site end to end |

To compare the rules engine with PokerKit, run `python tools/reference/pokerkit_rules.py`.

## Deploying

The site is static files on Cloudflare Workers. Deploys run from GitHub Actions on `main`. See [deployment](docs/deployment.md) for the steps.

`pnpm smoke:live` checks a deployment. It waits until the new build is served consistently, loads every route directly, checks the security headers, plays one hand in a fresh browser, opens its review and confirms that no request leaves the site's own origin. It exits 0 only if every step passes.

## Data and privacy

Everything you do stays in your browser's IndexedDB. The site doesn't call any other server and has no analytics. Cloudflare, which hosts it, sees ordinary web requests.

## How it's built

- [Architecture](docs/architecture.md): packages, storage and hosting
- [Bot policy](docs/bot-policy.md): how `standard-v1` decides
- [Operations](docs/operations.md): costs and what to do when something breaks

## Third-party code

[Third-party notices](THIRD_PARTY_NOTICES.md) cover the patched rules engine and the PokerKit reference.
