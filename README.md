# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mejayhure-rgb/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mejayhure-rgb/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over a sealed DefiLlama snapshot of 758 protocols. It finds the protocols that record no token yet, prices each one against the live tokens in its own category (the median market-cap / TVL of its traded peers, shrunk toward the global median in log space), adjusts for seven-day momentum, age without a token and chain breadth, and ranks the result. Protocols that could not plausibly launch a token of their own — wrapped, staked and bridged products, exchanges, versioned pools — are named on a watch-only list with the reason, never ranked. Every ranked protocol carries a generated farm plan: a category-specific action with a capital tier, a weekly cadence, a hold period, and a cost and a time on every step. The static dashboard renders the board with sorting and filters, a per-protocol detail view showing exactly how its price is built, a live-token comparison view, and a method page that states the model in full.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22 or later, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fzn3djaz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
