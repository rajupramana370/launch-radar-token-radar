# The radar-2 model, in full

This document describes the model that `lib/model.ts` implements and `main.ts` runs: what it
selects, how it values a protocol that has no token yet, how it builds a farm plan, and why two
runs over the same snapshot always agree byte for byte. The model is versioned `radar-2`; the
version string is stamped on every board row and shown in the dashboard.

## Inputs and outputs

The only input is one sealed snapshot of the DefiLlama protocol universe: an `as_of` date, a
`source` label, a `floor_usd`, a `watchlist` of slugs, and one record per protocol carrying
exactly ten fields — slug, name, category (nullable), chains, `tvl_usd`, `change_7d` (nullable),
`mcap_usd` (nullable), `listed_at` (nullable), `gecko_id` (nullable) and `symbol` (nullable).
`parseSnapshot` refuses anything that is not that shape: the document must be a JSON object,
`as_of` must be a `YYYY-MM-DD` date, `floor_usd` must be a positive safe integer, and every
protocol must at least carry a slug, a name and a finite TVL. Optional fields are coerced, not
trusted: a non-string category becomes null, a chains list keeps only its strings, and a
non-finite `change_7d`, `mcap_usd` or `listed_at` becomes null.

The outputs are a ranked board (`board.json`), the dashboard dataset (`data.js`, the whole
radar object assigned to `window.RADAR` in one line), verbatim copies of `dashboard/` and
`screenshots/`, and `dossier.json`, a summary built last by the vendored make.fun library so
the scorer can rebuild it from the same output directory and compare bytes.

## Selection: who gets ranked

A protocol is *pre-token* when its record carries no token at all: market cap, CoinGecko id
and symbol are all null. Only pre-token protocols are ever ranked; a protocol that already
trades is never given a model value.

The board is the union of two sets. First, every watchlist slug that exists in the snapshot
is in, unconditionally — the watchlist is the floor, and the rankability filter below is not
applied to it. Second, every other protocol that is *rankable* joins at any TVL; there is no
cap and no sampling, because the early rows below the floor are the ones the radar exists to
find. Rankable means pre-token and none of the watchlist rule's own exclusions:

- its category is not one of Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
  Restaked BTC or CEX — products that wrap a token which already trades, or an exchange;
- its name contains no whole word "wrapped", "staked" or "staking", in any case;
- its name does not begin with a known exchange's name (Binance, Coinbase, Bybit, Kraken,
  Bitget, OKX, Bitfinex, Gemini);
- its name does not end in a version marker such as "V2", "v1.5" or "2.0", which marks it as
  one release of another protocol rather than a protocol of its own.

Rows are ordered by implied value, highest first, with the slug as a deterministic
tie-break, and numbered 1..n.

## Peer multiples: the snapshot prices its own protocols

No multiple is hand-set. Every live protocol — market cap present and TVL above zero, with a
finite, positive ratio — contributes its market-cap-per-TVL ratio. The global multiple is
the median of all those ratios, clamped to [0.1, 4]; if the snapshot somehow held no usable
ratio at all, the global multiple falls back to 1.

Each category with at least three live peers gets its own multiple: the median of that
category's ratios, shrunk toward the global median by the peer count. The shrinkage weight
is n / (n + 4), so three peers trust their own median only 3/7 of the way and a large
category nearly fully; the blended result is clamped to [0.1, 4] like the global. A category
with fewer than three live peers, and any protocol with no category, is valued at the global
median and reports a peer count of zero. Before a multiple is used it is rounded to four
decimals — the same four decimals the board publishes — so the dashboard, recomputing a row
in the page from the published figures, lands on the board's implied value to the dollar.

## Growth and maturity

Growth starts from the protocol's own seven-day TVL change, with a missing or non-finite
change counting as zero. The percentage is clamped to [-60, 120] and turned into a
multiplier, 1 + (growth / 100) x 0.5, so a protocol at the cap is worth half again as much
and one at the floor is worth 0.7 times as much; growth can tilt a valuation but never
dominate it.

Maturity rewards protocols that have existed long enough to be real. Age is the whole days
from `listed_at` to the snapshot's `as_of`, both read as UTC calendar dates and never
negative; an unparseable or missing listing date leaves the age unknown. The multiplier is
0.6 + min(age, 1095) / 1095 x 0.4, rising linearly from 0.6 for a brand-new listing to 1.0 at
three years. An unknown age counts as 365 days, a neutral year.

## Implied value

implied = max(1, round(TVL x peer multiple x growth multiplier x maturity multiplier)).

That is the whole valuation: the protocol's own TVL, priced at what the market demonstrably
pays per TVL dollar for live protocols like it, tilted by its recent growth and its age.
Nothing else enters — no protocol name is special-cased, no figure comes from outside the
snapshot, and the floor of 1 keeps every ranked row a positive safe integer, as the gate
requires.

## Farm plans

Every board row carries a seven-step farm plan, generated from the protocol's own record —
its category, first chain, TVL tier and age — never from a hand-written list. The chain is
the first one the record names. Gas is priced per chain in whole dollars: $12 on Ethereum,
$1 on the cheap chains farmers actually use (Solana, Base, Arbitrum, Optimism, Polygon, BSC),
$2 on a mid tier (Avalanche, Fantom, Sonic, Linea, Scroll, Mantle, Blast) and $3 anywhere
else. The position size comes from the protocol's TVL tier: $250 at $5B and above, $150 at
$1B, $100 at $100M and $50 below that. The holding period comes from age: 60 days under six
months old, 45 under a year, 30 otherwise and for unknown ages.

The seven steps have a fixed shape. Prepare a fresh wallet; read the protocol's own site and
points page before depositing; perform the category's core action (supply to a lender,
provide liquidity to a DEX, bridge, stake, post margin, deposit to a vault, mint, buy cover —
each phrased for that category, with a generic deposit as the fallback); perform a second,
category-specific qualifying action in a later week; repeat one qualifying action weekly;
hold for the computed period; and keep a farm log, claiming only from links the protocol
itself publishes. Each step is rendered as one string — action, then "Cost: ...", then
"Time: ..." — truncated at 600 characters and padded if it would fall under 20, the gate's
bounds. Capital costs are stated once, where the capital is committed; later steps cost
only their gas, so a plan never double-counts the position.

## The live set

Protocols that already have a token are the model's teachers and the dashboard's comparison
set. The Live token view carries the top 24 of them by market cap (ties broken by TVL),
excluding the CEX category, each shown with the market's own figures rather than any model
output.

## Self-checks and determinism

Before anything is written, `boardIssue` re-examines the finished board and refuses it if
any watchlist slug is missing, the board holds fewer than 100 rows, the ranks are not
exactly 1..n, implied values ever rise as rank falls, every row shares one implied value,
any row carries fewer than 3 or more than 12 farm steps, any step falls outside 20..600
characters, or any implied value is not a positive safe integer.

The model is a pure function of the snapshot. It reads no clock — the only dates it ever
sees are the snapshot's own `as_of` and `listed_at` fields — draws no randomness, and makes
no network calls; every sort has a total order with an explicit tie-break. The same snapshot
therefore always produces the same board, the same data.js and the same dossier, byte for
byte, on any machine.
