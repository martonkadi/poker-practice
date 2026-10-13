# Operations

HeadsUp costs nothing to run, and the goal is to keep it that way. It's static files on Cloudflare's free Workers plan. There's no server, database, inference service, email or paid domain.

## Keeping it free

- Don't turn on paid plans or add-ons at Cloudflare or GitHub.
- GitHub Actions minutes are the only usage that grows. Check the repository's Actions usage now and then, and keep paid overage switched off in the account billing settings.
- Dependabot opens update PRs once a month. Merge them only after `ci.yml` passes.

## When something breaks

There's no server state, so nearly every problem comes from a build. To recover:

1. Note the commit on the About page and what's wrong.
2. Redeploy the last good commit or tag (see [deployment](deployment.md#roll-back)).
3. Run `pnpm smoke:live` against the site for that commit.

Players' hands live in their own browsers, so a bad deploy can't delete them. If a bug could corrupt saved hands, tell players to export from Settings before they keep playing.

If you open an issue, don't paste anyone's exported hand history into it.

## Parked: cloud quotas

The unused Supabase design in `supabase/` has its own limits and switches: enrollment and sync caps, size limits and service controls. None of it is deployed. If accounts come back, write those operating steps again for the design that actually ships.
