# Launch Radar — token-radar-01 entry (model radar-2)

A token launch radar for make.fun's token-radar-01 bounty, built locally. It reads the sealed
DefiLlama snapshot, ranks every protocol that records no token by an implied launch value, and
hands in a static dashboard: the ranked board, a detail view per protocol, filters, and a concrete
farm plan on every row.

## The model

Implied value comes only from the snapshot's own figures:

- **Peer multiple** — live protocols in the snapshot trade at a market cap per dollar of TVL. A
  pre-token protocol is valued at the median market-cap / TVL of the live protocols in its own
  category, shrunk toward the global median by peer count (weight n / (n + 4)) and clamped to
  [0.1, 4]. Categories with fewer than three live peers use the global median.
- **Growth** — clamp(change_7d, -60, 120) per cent, multiplier 1 + (growth / 100) x 0.5.
- **Maturity** — 0.6 + min(age_days, 1095) / 1095 x 0.4; age is listed_at to the snapshot's as_of,
  unknown ages count as 365 days.
- **implied = round(TVL x peer multiple x growth multiplier x maturity multiplier)**

Selection: every watchlist slug (the floor), plus every other pre-token protocol that is not a
wrapped, staked or bridged product or an exchange — the watchlist rule's own exclusions, applied
board-wide at any TVL. Live-token protocols are never ranked; they set the multiples and appear in
the dashboard's Live token view with the market's own values.

Farm plans are derived per protocol from its category, first chain, TVL tier and age: seven steps,
each with a cash cost (capital and chain-specific gas) and a time.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

Node 22.18 or later, standard library only. Writes `out/board.json`, `out/data.js`,
`out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Two runs write identical bytes.

The screenshots were rendered locally from the built dashboard with a headless browser at
1440x1100: the board, the rank-1 protocol's detail view, and the board filtered to Lending.

## Layout

- `main.ts` — entrypoint the grader runs
- `lib/model.ts` — the radar-2 model (selection, peer multiples, implied value, farm plans)
- `dashboard/` — index.html, app.css, app.js (no network, no framework)
- `screenshots/` — 1-board.png, 2-detail.png, 3-filtered.png
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
- `LICENSE` — MIT, from the kit starter
