# Strike Zone alert webhook (contract for Telegram / Discord bots)

Strike Zone evaluates alerts in the browser every 5 seconds for the market on screen. When an alert fires, it POSTs one JSON event to the webhook URL the user pastes into the **Alerts** panel.

## Request

- Method: `POST`
- Body: one JSON object (below)
- `Content-Type: text/plain` and `mode: no-cors`. This keeps the browser from sending a CORS preflight, so the bot server only needs to accept a plain POST. **Parse the raw body as JSON**; don't rely on the content type. The browser can't read the response, so just return `200`.
- Each alert has a 10-minute cooldown per market and level, so the bot doesn't need its own dedupe (but `id` is unique if you want one).

## Event

```json
{
  "id": "liq_cluster_near:BTC-USD:82540:1761210000000",
  "kind": "liq_cluster_near",
  "symbol": "BTC-USD",
  "time": 1761210000000,
  "price": 81650.5,
  "title": "BTC-USD: $54.1K short liquidations 0.84% above",
  "message": "Price 81,650.5 is 0.84% from a $54.1K short-liquidation cluster at 82,340. A move into it can cascade.",
  "data": { "cluster_price": 82340, "cluster_usd": 54100, "distance_pct": 0.84, "side": "short" },
  "app": "https://strike-zone-nine.vercel.app/?s=BTC-USD"
}
```

`title` and `message` are ready to post as-is. `app` deep-links back to the market.

| `kind` | Fires when | `data` fields |
|---|---|---|
| `liq_cluster_near` | The biggest long (below) or short (above) liquidation cluster is within the user's % of price and over the min size | `cluster_price`, `cluster_usd`, `distance_pct` (signed), `side` (`long`/`short`) |
| `funding_flip` | Hourly funding changes sign | `from_hourly`, `to_hourly` (decimal, e.g. 0.0001 = 0.01%/h) |
| `whale_near_liq` | A live position over the min size is within the user's % of its liquidation price | `liq_price`, `notional_usd`, `leverage`, `address`, `distance_pct` |
| `pressure_extreme` | Pressure score is beyond ±threshold | `score` (−100…100) |

A **test alert** (button in the panel) sends `kind: "liq_cluster_near"` with `data: { "test": 1 }`.

## Minimal bot server (Node, Telegram)

```js
import http from 'node:http';
const { BOT_TOKEN, CHAT_ID } = process.env;
http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c));
  req.on('end', async () => {
    try {
      const ev = JSON.parse(body);
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: `⚡ ${ev.title}\n${ev.message}\n${ev.app}` }),
      });
    } catch {}
    res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('ok');
  });
}).listen(process.env.PORT || 8787);
```

For Discord, POST `{ "content": "⚡ " + ev.title + "\n" + ev.message + "\n" + ev.app }` to a Discord channel webhook URL instead.

## Running alerts without the tab open

Browser alerts stop when the tab closes. A backend can run the same checks on its own from Strike's public API (no key needed):

- Price and funding: `GET https://api.strikefinance.org/price/v2/premiumIndex?symbol=BTC-USD` (`markPrice`, hourly `fundingRate`)
- Liquidation map: `GET /stat/v1/stats/coin/liquidation-map?symbol=BTC-USD`
- Whale positions: `GET /stat/v1/stats/live-positions?symbol=BTC-USD`
- Live stream: `wss://api.strikefinance.org/ws/price` (newline-delimited JSON frames; subscribe to `markprice`, `depth`, `trade`)

The thresholds and scoring are in `src/alerts.ts` and `pressure()` in `src/insights.ts`, so a server port can reuse the exact logic.
