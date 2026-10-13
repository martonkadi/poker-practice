# Deployment

HeadsUp is static files served by Cloudflare Workers at https://poker-practice.marton-kadi.workers.dev. Hosting is on Cloudflare's free plan. There's no database or server code to deploy.

## What you need

- The GitHub `production` environment with two secrets: `CLOUDFLARE_API_TOKEN` (a token allowed to deploy Workers) and `CLOUDFLARE_ACCOUNT_ID`.
- The Worker name `poker-practice` in `wrangler.jsonc`. It decides the URL, so don't rename it unless you want a new address.
- No `VITE_` variables beyond what the workflow sets. Never put a secret in a `VITE_` variable, because those end up in the browser bundle.

## Deploy

1. Push the commit you want to ship to `main`, and wait for `ci.yml` to pass on it.
2. Start the deploy workflow on `main`:

   ```text
   gh workflow run deploy.yml --ref main
   ```

   Or use **Actions → Deploy → Run workflow** on GitHub.
3. Watch it with `gh run watch`. The first step prints the commit being deployed.

The workflow (`.github/workflows/deploy.yml`):

1. Checks that both Cloudflare secrets are set.
2. Runs `pnpm check` (lint, typecheck, tests, build and `check:dist`) with the production build settings, which embed the commit SHA in the About page.
3. Runs the browser tests in Chromium, Firefox and WebKit against that build.
4. Runs the PokerKit rules comparison.
5. Uploads the tested `dist/` with `wrangler deploy`.
6. Runs `pnpm smoke:live` against the live site for that commit.

If any step before the upload fails, nothing is deployed.

## Check a deployment yourself

```text
pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit <sha>
```

Right after a deploy, Cloudflare can briefly answer with a 404, or serve the old and new versions side by side. The smoke check waits up to 90 seconds until the new build shows up on 5 probes in a row, at least 3 seconds apart. Then it:

- loads every route and an unknown path directly, checking status, headers and that each page's script is from that commit
- plays a hand in a fresh browser and checks that its review matches History
- fails on any request to another origin

You can also open the About page, which shows the build commit.

## Roll back

Deploy an older commit the same way. Tags work as refs, for example:

```text
gh workflow run deploy.yml --ref v0.1.0-rc.1
```

This runs the workflow file from that tag, so it uses the checks from that version.

## Try it locally

`pnpm build` writes `dist/`. `pnpm exec wrangler deploy --dry-run` validates it without credentials. `node tools/serve-dist.mjs` serves `dist/` with the same headers and fallback, and the browser tests use it.

## Parked: cloud accounts

The repo has an unfinished Supabase design for accounts and sync (`supabase/`, `tools/test-db.mjs` and the manual `database` job in `ci.yml`). The site doesn't use it, and the deploy workflow doesn't touch Supabase. If accounts come back, that design needs its own deploy steps, real Google sign-in and testing before it goes live.
