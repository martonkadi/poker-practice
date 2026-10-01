# MVP work queue

Updated 2026-09-30. [PLAN.md](PLAN.md) owns scope/status. The owner approved a guest-only MVP this week. The [previous roadmap](docs/archive/pre-mvp-roadmap-2026-09-30.md) is historical unfinished work.

## Wednesday September 30: simplify and repair

1. Remove cloud initialization/account UI, difficulty selection, inactive animation controls and strategy recommendations from the MVP entry point. Preserve backend/policy code for later. Ship one experimental opponent.
2. Create a manual static-only deployment path with no Supabase variables, migration or function dependency; identify the tested commit.
3. Serialize session writes at entry; reject stale actions. Preserve start time/button alternation across hands. Cancel navigation work; replace failed workers for Retry.
4. Reload when a waiting tab gains ownership. Handle corrupt/unavailable storage without silent overwrites or endless loading.

## Thursday October 1: prove the user journey

5. Record canonical actions and actual contributions, including street-closing/all-in calls. Add regression tests and conservation/replay checks.
6. Review saved decision frames/exact pot odds; separate final outcomes; fix missing records. Retain export/deletion. Defer archive-import UI pending semantics.
7. Test the built artifact: betting/showdown, three hands, reload, rapid clicks/keys, worker failure/retry, navigation, takeover after another tab advances, export/deletion, missing routes, keyboard and mobile. Use controlled fixtures without production backdoors.
8. Run checks, independent PokerKit reference, three-browser suite; inspect screenshots and fix material usability failures.

## Friday October 2: publish

9. Verify existing Cloudflare access and $0 constraints. Deploy the tested guest artifact. If blocked, record the exact provider step and continue independent acceptance work.
10. Smoke real app/direct routes, local history/review and absence of cloud calls; record deployment/commit identifiers; create tested MVP prerelease; deliver URL and limitations.

October 3–4 is contingency for defects/access. Cut optional polish if necessary; do not waive legal betting/payout, local-data safety, hidden-card isolation or real deployment verification.

## After MVP

Choose the next goal from actual owner usage: better review/teaching, stronger evaluated policy, or real accounts/sync. Cloud requires the lifecycle/import/retention design and full authorization/deletion testing documented in the earlier audit. Difficulty claims require benchmarking. Six seats, continuous stacks and native solving remain separate future decisions. None automatically blocks this MVP.
