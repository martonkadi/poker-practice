# Third-party notices

`pnpm-lock.yaml` pins the full JavaScript dependency tree. Each package keeps its own license and notice in its installed package. Before publishing the source, generate a full license inventory from that exact lockfile and review it.

- **poker-engine-ts 0.1.3**, copyright © 2026 Limin Ge, MIT ([upstream](https://github.com/Ge-limin/poker-engine-ts)). `patches/poker-engine-ts@0.1.3.patch` fixes how opening blinds are counted preflop and removes the old blind-call normalization. pnpm applies the patch, and it's tested against PokerKit. Keep the upstream MIT license with any copy of the patched source or bundle.
- **PokerKit 0.7.6**, Universal, Open, Free, and Transparent Computer Poker Research Group, MIT ([upstream](https://github.com/uoftcprg/pokerkit)). It's only used as an independent reference in development and CI. It isn't shipped to the browser.

No AGPL solver is included.
