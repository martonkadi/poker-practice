# Bot policy

The site plays against `standard-v1`. It's a set of hand-written rules, not a solver, and its strength hasn't been measured. The code is in `packages/bots/src/index.ts`, the equity estimate in `packages/analysis/src/index.ts`, and the worker that runs it in `apps/web/src/bot.worker.ts`.

A second policy, `easy-v1`, is still in the code but the site doesn't offer it. If a change to thresholds, bet sizes or sampling changes how a policy plays, give it a new version name.

## How it estimates equity

The bot deals random hole cards to its opponent and random runouts for the rest of the board, then counts how often it wins. Ties count as half. It only rules out its own cards and the public board, so it assumes your hand is random and doesn't adjust to how you play. `standard-v1` aims for 2,048 samples per decision and reports how many it actually ran.

The worker samples in batches so a decision can be cancelled. It has a 1.5-second soft deadline and a 3-second watchdog. If the worker crashes or times out, the hand pauses so you can retry. It never swaps in a different bot.

Pot odds (`call / (pot + call)`) and chip counts are exact. Equity is an estimate. The thresholds below are judgment calls.

## Rules, in order

1. **Small blind, first to act preflop.** With equity of at least 0.50, raise to 250 85% of the time, otherwise call. From 0.42 to 0.50, call 60% of the time, otherwise fold. Below 0.42, fold.
2. **Big blind after a limp.** With equity of at least 0.60, raise to 400 80% of the time, otherwise check. Otherwise check.
3. **Nothing to call.** With equity of at least 0.65, bet 75% of the time. With equity of 0.35 or less, bluff 10% of the time. Otherwise check.
4. **Facing a bet.** With equity of at least `max(0.72, pot odds + 0.20)`, raise 70% of the time if raising is legal. Otherwise, call with equity of at least `pot odds + 0.08`. Between `pot odds + 0.03` and `pot odds + 0.08`, call half the time. Otherwise fold.

Preflop reraises go to three times the current highest bet. Postflop bets and raises add two-thirds of the pot, counted after calling. Every amount is clamped to the legal range. If raising isn't legal, the bot falls back to the matching call, check or fold.

## `easy-v1`

It checks unless its equity is at least 0.75, and then half-pot bets half the time. Facing a bet, it calls with equity of at least `max(0.20, pot odds - 0.10)` and folds otherwise. It never reraises or bluffs. Its target is 512 samples.

## Randomness

The bot's action choices use their own random number generator, separate from the Web Crypto shuffle that deals the cards. Tests and benchmarks pass in fixed seeds.

## Benchmark

`pnpm benchmark` plays paired hands: each deal is played twice with the same deck, swapping the button and the hole cards. It compares `standard-v1` with `easy-v1`, an always-call bot and a random bot. Only small runs that confirm the harness works have been done. The full 10,000-pair run with full sampling hasn't been run, so there's no measured ranking of the bots.
