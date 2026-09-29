# Post-v1 roadmap

None of these items is a substitute for finishing heads-up v1. Do not add empty production routes or APIs for them.

| Item | Depends on | Acceptance before release |
| --- | --- | --- |
| Continuous cash sessions | Verified M8 hand accounting | Stacks persist across hands; top-ups/rebuys conserve chips; strategy is labeled by stack depth and retested at variable depths. |
| Stronger heads-up policies | Full v1 paired benchmark and stable policy versioning | Candidate research engine artifacts, license, hardware needs and reproducible strength are documented; held-out paired deals beat the v1 policy with stated uncertainty. |
| Native solver companion | Stable hand/range contracts and license review | Rust postflop solver runs locally with explicit ranges/trees, bounded memory, cancellation and deterministic comparison fixtures. |
| Solver-backed review | Validated companion or licensed reference solutions | Compatible spots show action frequencies and EV differences with abstraction/approximation metadata; incompatible spots show no EV-loss score. |
| Six-seat solo cash table | Multiway side-pot reference gate, general seat/observation contract, variable-depth sessions | Five isolated bot information sets, position rotation, complete side-pot UI, 6-seat recovery and independent multiway strategy evaluation pass. |
| Study features | Stable replay/review schema | Repeatable spots, range displays and focused drills reproduce the same situation without hidden-card leakage. |
| Open-source publication | Owner’s explicit visibility decision and third-party license audit | All notices and solver obligations reviewed; repository visibility changes only after owner approval. |
