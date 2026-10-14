# Architecture

HeadsUp is a static single-page app. All game logic, the bot and storage run in your browser. There's no server-side code.

## Packages

- **`packages/contracts`** holds the shared types: integer cards (`rank = card % 13`; suits clubs, diamonds, hearts, spades), the `fold`/`check`/`call`/`raiseTo` actions, legal action sets, the redacted observation a player sees, and the versioned hand record.
- **`packages/poker`** wraps the pinned `poker-engine-ts@0.1.3` engine. A pnpm patch in `patches/` fixes how opening blinds are counted and keeps the big blind's option after a limp. The adapter shuffles a 52-card deck with Web Crypto (rejection sampling and Fisher–Yates) and checks every action against the engine's current legal set. It replays event logs and gives each player only their own cards plus public information.
- **`packages/bots`** contains the bot policies. The site uses `standard-v1`. `easy-v1` is still in the code but isn't offered. See [bot policy](bot-policy.md).
- **`packages/analysis`** evaluates seven-card hands, estimates equity for the bot, and computes pot odds for review.
- **`packages/persistence`** stores hands in IndexedDB through Dexie.

## The app

`apps/web` is a React app built with Vite. It runs one local session at a time:

- A Web Lock lets only one tab write at a time. If you open a second tab, it waits and takes over when the first one lets go.
- Every action goes through the poker adapter, then the hand in progress is saved. When a hand ends, its record is saved, and the next hand starts only when you choose **Next hand**.
- The bot runs in a Web Worker. Each request carries an ID, the hand ID and the decision number, and the app ignores any answer that arrives for an old decision. If the worker crashes or times out, the hand pauses and you can retry.
- Review uses the cards and board you could see at each decision. The final board and the bot's cards are shown separately in the collapsed outcome.
- Display preferences use a separate Web Lock. A unit choice queues its write immediately. Deletion takes the session lock, then the preference lock, and clears all local tables in one transaction. Other tabs receive a notification and read the current preference again.
- History reads 50 hands at a time through the existing completion-time index. Hands are ordered by completion time descending, then ID descending when times match.
- Export runs in a separate worker. It captures hand IDs and bookmarks together, then reads and validates 100 records at a time to build a compact JSON Blob. Hands completed after capture are excluded. A missing or unreadable captured hand fails the export without downloading a partial file. Progress and cancellation stay on the main thread. The archive schema and database version are unchanged.

## Hosting

Vite builds the site into `dist/`, and Cloudflare Workers serves it as static assets. Unknown paths fall back to `index.html`, so direct links like `/review/<id>` work. Security headers come from `apps/web/public/_headers`. See [deployment](deployment.md).

## Parked cloud code

The repo still has an unfinished account and sync design: `supabase/` (database migration and an account-deletion function), `tools/test-db.mjs`, the `database` job in `ci.yml` (manual runs only), and the account-scoped outbox and bookmark tables in `packages/persistence`. The site doesn't use any of it, and the production build contains no cloud code (`pnpm check:dist` checks this). It's kept as a starting point for real accounts later.

The adapter and UI support exactly two players. Six-player tables would need new work, not just configuration.
