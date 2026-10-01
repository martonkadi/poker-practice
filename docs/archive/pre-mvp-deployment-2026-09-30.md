# Deployment runbook

**State (2026-09-29 audit):** private repository pushed; CI passed; owner completed provider setup. GitHub's production environment contains the five required secret names and two public variables. [Deployment 36652432418](https://github.com/martonkadi/poker-practice/actions/runs/36652432418) passed all checks and 12 release browser tests, linked Supabase, then failed at database connection selection: `IPv6 is not supported on your current network`. No migration was applied by that attempt; function and Cloudflare deployment steps were skipped. The expected site returns 404. Real Google sign-in remains unverified.

The owner selected an unannounced test after critical fixes, followed by the complete v1 release gate. Follow P0-01 through P0-05 in [roadmap.md](../roadmap.md); do not simply re-run the failed workflow before diagnosing the connection and fixing session continuity. Keep GitHub private and recurring costs at $0.

| Configuration | Intended value |
| --- | --- |
| Supabase project ref | `epivjibibkvzdvazpujv` |
| Public Supabase URL | `https://epivjibibkvzdvazpujv.supabase.co` |
| Worker name / account subdomain | `poker-practice` / `marton-kadi.workers.dev` |
| Intended app origin / Supabase Site URL | `https://poker-practice.marton-kadi.workers.dev` |
| Google OAuth authorized redirect URI | `https://epivjibibkvzdvazpujv.supabase.co/auth/v1/callback` |
| Supabase allowed app redirect | `https://poker-practice.marton-kadi.workers.dev/auth/callback` |

These are public identifiers and expected redirect settings, not evidence that OAuth has completed successfully.

## Current connection repair

Use the free Supabase **Session pooler** (actual dashboard/API hostname, port 5432) for the IPv4-only runner. The scoped PAT's **Connection Pooling: Read** permission should be checked: it was omitted from the earlier checklist and may explain why linking did not retain pooler configuration, but the failure log alone does not prove that. Add a connection preflight, inspect migration history, and make the selected session connection explicit. Store any password-bearing URL only as a GitHub secret. Do not buy the IPv4 add-on, guess a region, use transaction mode for migrations, reset the hosted database, or disable TLS verification. See [network compatibility](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP) and [token permissions](https://supabase.com/docs/guides/platform/personal-access-tokens).

## Deployment procedure

1. Use the existing private remote `https://github.com/martonkadi/poker-practice`. Configure main branch protection where available: require the `check` and `database` CI jobs, no required second human reviewer, squash merging, and delete merged branches. Confirm no paid Actions overage. Implement each remaining fix on a feature branch with a PR and evidence in `PLAN.md`; do not tag `v0.1.0` until all acceptance gates pass.
2. Verify the existing Supabase **Free** project and Google provider setup. Google should be the only browser sign-in method; keep global new-user signup enabled while disabling the Email provider. The migration rejects non-Google enrollment by default. Verify the existing Google Web OAuth client's origin and Supabase callback against the table above. Client ID/secret belong only in Supabase's Google provider settings. Set Supabase Site URL and allowed app callback exactly; test OAuth after the migration exists.
3. Verify the existing Cloudflare Free account, `marton-kadi.workers.dev` subdomain and narrowly scoped deployment token/account ID. The current failed run did not reach Cloudflare authentication. Do not create a replacement project, buy a domain or enable a paid plan.
4. Verify GitHub **production environment secrets** named `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD`, and variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. All seven names were already present during the audit. Never put privileged or OAuth secrets in a `VITE_` variable. The workflow sets `VITE_APP_ENV=production` and embeds the Git commit in About. Any additional pooler connection setting is part of the pending repair and must be documented when implemented.
5. Run CI on the PR and merge only after `pnpm check`, Chromium, PokerKit, and local database tests pass. Trigger `.github/workflows/deploy.yml` manually from the verified `main` commit after the connection repair is tested. The current workflow checks configuration, runs `pnpm check` (including build), runs the three-browser suite, links Supabase, applies migrations, deploys `delete-account`, then runs `wrangler deploy`. Migrations must remain backward compatible while prior frontend deployments can still be served. Do not automatically roll back a database migration.
6. Verify the actual `workers.dev` URL: guest complete hand; direct `/review/:handId` and `/history` navigation; Google sign-in and callback; explicit guest import choice; at least three consecutive signed-in hand uploads; a second device's retained history; policy change; and deletion of a disposable test account through the Edge Function. Inspect built assets for absent privileged secrets. Record the commit, bot versions, URL, tests, and browser/OS in `docs/acceptance.md`.

Preview deployments must omit both Supabase browser variables so each preview is guest-only; do not permit a preview URL in production OAuth redirects. To roll back frontend code, deploy the previous known-good Git commit with the same static workflow and confirm direct routes and guest play. Review database compatibility first; never reverse a destructive migration automatically.

Locally, `pnpm build` creates `dist/` and `pnpm exec wrangler deploy --dry-run` validates the static bundle without provider credentials. See [operations](operations.md) for quota controls and pause behavior.
