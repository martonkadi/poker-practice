# Experimental bot policy

The two frozen v1 identifiers are `easy-v1` and `standard-v1`. Source: `packages/bots/src/index.ts`; equity estimator: `packages/analysis/src/index.ts`; worker: `apps/web/src/bot.worker.ts`. Any change to thresholds, sizing, or sampling that changes strategy requires a new bot version and separate progress statistics. Neither bot is a GTO solver.

Both policies estimate showdown equity by drawing uniform legal opponent hole-card pairs and remaining runouts. They exclude only the acting player’s hole cards and public board, split ties fractionally, and report the actual sample count. Standard targets 2,048 samples; Easy targets 512. The worker batches to permit cancellation and uses a 1.5-second soft deadline with a 3-second watchdog. This range model does not infer opponent tendencies. Pot odds `C/(P+C)` and chip accounting are exact; equity is sampled; policy thresholds are heuristics.

Standard rules, in order:

1. Unopened preflop small blind: equity at least 0.50 raises to 250 with probability 0.85, otherwise calls. Equity from 0.42 to 0.50 calls with probability 0.60, otherwise folds. Below 0.42 folds.
2. Big blind facing only a limp: equity at least 0.60 raises to 400 with probability 0.80, otherwise checks; lower equity checks.
3. No call needed: equity at least 0.65 value bets with probability 0.75; equity at most 0.35 bluffs with probability 0.10; otherwise checks.
4. Facing a bet: if equity is at least `max(0.72, pot odds + 0.20)`, raise with probability 0.70 when legal, otherwise call. Else call at `pot odds + 0.08` or higher. In the band from `pot odds + 0.03` to `pot odds + 0.08`, call half the time; otherwise fold.

Preflop reraises target three times the current highest street commitment. Postflop value bets and raises use a two-thirds-pot increment **after calling**. Every target is clamped to the legal raise-to range. If raising is illegal, the relevant call/check/fold branch applies.

Easy checks unless equity is at least 0.75, in which case it half-pot bets with probability 0.50 if legal. Facing a bet, it calls when equity is at least `max(0.20, pot odds - 0.10)` and otherwise folds. It never reraises or bluffs.

The policy mixes actions using a separate action RNG from the production Web Crypto card shuffle. Test and benchmark runs inject deterministic seeds. A worker crash or timeout pauses the hand for Retry or End session; it never substitutes another bot.

The paired benchmark runner uses the same seeded deck twice per deal, swapping the button and the hole-card assignment through the engine's dealing order. It compares Standard against Easy, always-call, and random-legal baselines. Its 10,000-pair/full-sampling result has **not** been run or validated yet; no ordered strength claim can be made. The five-pair, 16-sample smoke run only verifies the harness executes. See `docs/acceptance.md`.
