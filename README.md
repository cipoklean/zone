# ⚡ Strike Lens

**See the market the way a market maker does.** Strike Lens is a live order-flow, liquidity and risk visualizer for [Strike Finance](https://strikefinance.org) perpetuals, with a built-in order ticket that trades on Strike through API wallets.

**Live demo:** https://cipoklean-strike-lens.static.hf.space

Built solo for the Strike Hackathon (Oct 21–23, 2026).

---

## Why

Strike V2 is a full CLOB with a public API, but traders still navigate it with a price chart and a guess. The information that actually moves perps (where liquidity rests, where leveraged traders get liquidated, who is paying funding, what whales are holding) is spread across a dozen endpoints. Strike Lens puts all of it on one screen, aligned to price, and turns it into plain-language reads a trader can act on.

## What it does

| Feature | What a trader gets | Strike data used |
|---|---|---|
| **Liquidity + liquidation map on the chart** | Candles with two price-aligned profiles: resting order-book depth (left) and the liquidation map (right; orange = long liquidations below, blue = short liquidations above). Whale liquidation levels drawn as dashed lines. | `/price/v2/klines`, `kline_*` WS, `/price/v2/depth`, `depth` WS, `/stat/v1/stats/coin/liquidation-map`, `/stat/v1/stats/live-positions` |
| **Order-flow heatmap** | Bookmap-style view: every column is one second of Strike's live book; brightness = resting USD; taker trades as bubbles; mid-price line; hover readout. Spot spoofing, pulled walls and absorption. | `depth` + `trade` WebSocket |
| **Trader brief** | 11 auto-generated signals with a bullish/bearish gauge: book imbalance, support/resistance walls, execution cost, liquidation magnets, funding and cross-venue carry, mark-index basis, 15-min taker delta, OI vs price, crowd vs top-trader positioning, whale liquidation risk, ATR-based stop and leverage guidance. | all of the above + `/stat/v1/stats/coin/history/*`, `markprice` WS |
| **Derivatives panel** | Mark, index, basis, hourly funding, APR, countdown to next funding, OI in USD, long/short ratios, 7-day funding, OI and spread sparklines. | `/price/v2/premiumIndex`, `/price/v2/openInterest`, `/stat/v1/stats/coin/history/{funding,open-interest,long-short-ratio,top-trader-long-short-ratio,spread}` |
| **Order book + tape** | Live L2 ladder with grouping and cumulative depth; click a level to load it into the ticket. Trade tape with size filter and 5-minute buy/sell flow bar. | `/price/v2/depth`, `/price/v2/trades`, WS |
| **Order ticket with pre-trade risk** | Long/short, limit/market, leverage, SL/TP, post-only, reduce-only. Before you send: estimated fill and slippage from the live book, margin, maker/taker fee, estimated liquidation price, hourly funding you pay or receive, risk at stop as % of equity, R-multiple, plus warnings (liquidation inside 2×ATR, stop beyond liquidation, liquidation cluster between entry and liq, thin book). | Signed `/v2/leverage`, `/v2/order`, `/v2/openOrders`, `/v2/order/cancel`, `/v2/account` |
| **Wallet lens** | Paste any Cardano, EVM or Solana address: equity, available margin, margin ratio and a health meter, every position with distance to liquidation, net funding, realized PnL and volume. The selected market's entry and liquidation are drawn on the chart. | `/v2/account`, `/v2/positions`, `/v2/portfolio`, `/v2/openOrders` by `blockchain_address` |
| **Discover** | Largest live positions per market, leaderboard (24h/7d/30d/all), copy-trader discovery with copy score and 30-day equity curve, and vaults (APR, Sharpe, depositors). Click any trader to open them in the wallet lens. | `/stat/v1/stats/leaderboard`, `/v2/copy/discover`, `/v2/vaults` |
| **Funding arbitrage scanner** | Strike's funding vs Binance, Bybit, OKX, Hyperliquid, Lighter and others for every market, ranked by APR gap with a carry suggestion. | `/stat/v1/stats/coin/funding-rate-comparison` |
| **Market strip + platform stats** | All 30+ Strike markets (crypto, equities, commodities) with live 24h change; protocol users, volume, liquidations and revenue. | `!miniticker@arr` WS, `/price/v2/ticker/24hr`, `/stat/v1/dashboard/summary` |

## Trading safely

The ticket uses Strike **API wallets** (Ed25519). API wallets can place and cancel orders but **cannot withdraw funds**. The private key is held only in the tab's memory, never stored or sent; every request is signed in the browser exactly as specified in Strike's docs (`METHOD:PATH:TIMESTAMP:NONCE:SHA256(body)`). You can generate a key pair in the app and register the public key at app.strikefinance.org/api-keys.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # static site in dist/
```

No backend and no API keys needed for market data: everything reads Strike's public, CORS-enabled mainnet API (`api.strikefinance.org`) and WebSocket (`/ws/price`) directly.

## Stack

React 18, TypeScript, Vite, TradingView lightweight-charts, Canvas 2D for the heatmap and profiles, @noble/ed25519 for signing.

## Notes

- Liquidation price in the ticket is an isolated-margin estimate at the 0.5% tier-1 maintenance rate; cross margin uses the whole balance.
- Funding: Strike pays hourly; the scanner compares 8-hour-equivalent rates as Strike's stats API publishes them.
- Signals are heuristics, not financial advice.

## Roadmap

L3 per-order view (queue position, order lifetime), builder-code routing, alerts on liquidation-cluster proximity, and a mobile layout tuned for one-hand trading.

MIT License.
