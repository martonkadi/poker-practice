# Third-party notices

The pnpm lockfile pins the complete JavaScript dependency tree. Each package retains its own license and notice in its installed package. Before a public source release, regenerate a complete license inventory from that exact lockfile and review it.

- **poker-engine-ts 0.1.3**, copyright © 2026 Limin Ge, MIT: [upstream](https://github.com/Ge-limin/poker-engine-ts). The local `patches/poker-engine-ts@0.1.3.patch` corrects preflop blind opening-contribution accounting and disables the former blind-call normalization. The patch is applied by pnpm and tested against PokerKit fixtures. Preserve the upstream MIT license when distributing the patched bundle or source.
- **PokerKit 0.7.6**, Universal, Open, Free, and Transparent Computer Poker Research Group, MIT: [upstream](https://github.com/uoftcprg/pokerkit). It is used only as an independent development/CI reference and is not shipped to the browser.

All first-party code is under [LICENSE](LICENSE). No AGPL solver is included in v1.
