# Acceptance evidence

Local machine: Windows, Node 24.20.0, pnpm 12.6.0, Chromium from Playwright 1.63.0. Date: 2026-09-29. These are development checks, not production acceptance.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm check` | Passed | ESLint, strict TypeScript, 20 unit/integration tests including 100 automated hands, Vite production build. Bundle warns about a 564 KB JavaScript chunk. |
| `pnpm test:rules` | Passed: 12 tests | Blind order/call, minimum raise, fold, all-in, short all-in, uncalled refund, board-only royal-flush tie, multiway side-pot and odd-chip settlement, full three-seat all-in and six-seat passive replay, 100 passive hands and conservation. |
| `python tools/reference/pokerkit_rules.py` with PokerKit 0.7.6 | Passed | Independent heads-up blind, limp, min-raise, fold and all-in reference, plus three-player main/side-pot contribution split. |
| `pnpm test:e2e` | Passed: 4 Chromium tests | Guest completes/reloads/reviews a hand, history entry, 390px viewport without horizontal scrolling, keyboard hand completion, and automatic handoff of a Web Lock from one tab to another. |
| `pnpm test:e2e:release` | Passed: 12 tests, one worker | The same four guest flows passed in Chromium, Firefox and WebKit. A first parallel run stalled three page loads on this Windows machine; sequential execution passed. |
| `pnpm benchmark --deals 5 --samples-standard 16 --samples-easy 16` | Passed harness smoke | Five paired deals per opponent, zero illegal actions. Sample size and equity sampling are far below the release benchmark; no bot-strength inference. |
| `pnpm benchmark:browser` | Passed measurement | Windows 10.0.26200, Intel i7-13620H, 16 logical CPUs, 31.7 GiB RAM, Playwright Chromium 153.0.8010.12. Thirty repeated preflop Web Worker round trips per policy using the same legal observation: Standard median 273 ms, p95 304 ms, max 364 ms; Easy median 40 ms, p95 48 ms, max 76 ms. This measures one decision shape and does not guarantee all streets or devices. |
| `pnpm exec wrangler deploy --dry-run` | Passed | Six static assets read; no provider deployment performed. |

Actual interface captures from the passing Chromium flow: [table](screenshots/table-desktop.png) and [review](screenshots/review-desktop.png). The review capture waits for sampled equity and sample count.

**Still required:** clean-clone GitHub CI, local Supabase migration and `pnpm test:db`, two-account/cross-device OAuth and sync, account deletion, cloud pruning and expiry, full 10,000-pair/full-sampling benchmark with confidence bounds, wider street/device latency sampling, real Cloudflare/Google production flows, and verified release tag/URLs. No PR or release evidence exists yet.
