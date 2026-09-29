# Instructions for implementing agents

Read `PLAN.md`, `README.md`, and the relevant file under `docs/` before changing code. Keep `PLAN.md` current after each meaningful milestone. Follow milestone dependencies and finish all v1 gates before backlog work. Never mark a screen or stub as an implemented feature.

Preserve the zero-dollar recurring budget and private GitHub repository. Poker rules belong in `packages/poker`, not UI components. Adapt the upstream engine behind shared contracts. Validate every action against the current legal set. Keep the deck, opponent's private cards and future board cards out of bot observations and decision-time review.

Use versioned shared schemas for actions and hand history. Add regression tests for betting, payout and replay bugs. Run the milestone checks and update commands, docs and screenshots whenever behavior changes. Describe the bot as experimental. No GTO or EV-loss claims without a valid solver-backed reference.

Implement real OAuth/sync if cloud access exists. Never replace it with a mock and call it complete. Keep service-role and deployment secrets outside source and browser bundles. Continue independent local work when external accounts are unavailable and record the exact blocked production gate.

Do not begin six-seat, continuous-stack or native-solver features before v1 is verified. Do not spawn other agents unless the user explicitly authorizes delegation. End with a delivery report listing behavior, checks actually run, repo/release/deployed URLs and remaining blockers.
