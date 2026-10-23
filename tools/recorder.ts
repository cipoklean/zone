// Strike Zone recorder: logs live pressure-score calls for the most active markets (for a hit-rate track record)
// and records 1-second order-book heatmap columns for chosen markets (for replay case studies).
// Run: npx esbuild tools/recorder.ts --bundle --platform=node --format=esm --outfile=/tmp/rec.mjs && node /tmp/rec.mjs
import * as A from '../src/api';
import { pressure } from '../src/insights';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.cwd() + '/tools/data/'; mkdirSync(OUT, { recursive: true });
const HEAT = (process.env.HEAT ?? 'BTC-USD,HYPE-USD').split(',').filter(s => s && s !== 'none');
const HEAT_SECS = +(process.env.HEAT_SECS || 1500);
const RUN_MIN = +(process.env.RUN_MIN || 270);

// ---- pressure log (every 60s, 12 most active markets) ----
async function scanLoop() {
  const tk = (await A.fetchTickers()).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 12).map(t => t.symbol);
  const end = Date.now() + RUN_MIN * 60_000;
  while (Date.now() < end) {
    const t0 = Date.now();
    for (const s of tk) {
      try {
        const [d, tr, pr, liq] = await Promise.all([A.fetchDepth(s, 100), A.fetchTrades(s, 100), A.fetchPremium(s), A.fetchLiqMap(s).catch(() => [])]);
        const mid = d.bids[0] && d.asks[0] ? (d.bids[0][0] + d.asks[0][0]) / 2 : 0; if (!mid) continue;
        const p = pressure({ mid, bids: d.bids, asks: d.asks, trades: tr, liq, fundingHourly: pr.fundingRate });
        appendFileSync(OUT + 'pressure-log.jsonl', JSON.stringify({ t: Date.now(), s, mid, score: p.score, parts: p.parts }) + '\n');
      } catch {}
    }
    await new Promise(r => setTimeout(r, Math.max(1000, 60_000 - (Date.now() - t0))));
  }
}

// ---- heatmap recorder over the public WebSocket ----
function heatRec(symbol: string) {
  return new Promise<void>(resolve => {
    const bids = new Map<number, number>(), asks = new Map<number, number>(); let id = 0; const buf: any[] = [];
    const cols: any[] = []; const trades: any[] = []; let buys = 0, sells = 0;
    const apply = (m: any) => { if (m.u <= id) return; id = m.u; for (const [p, q] of m.b || []) +q === 0 ? bids.delete(+p) : bids.set(+p, +q); for (const [p, q] of m.a || []) +q === 0 ? asks.delete(+p) : asks.set(+p, +q); };
    const ws = new WebSocket(A.WS_PRICE);
    ws.onopen = async () => {
      for (const ch of ['depth', 'trade']) ws.send(JSON.stringify({ method: 'subscribe', channel: ch, symbol, id: 1 }));
      const d = await A.fetchDepth(symbol, 1000); d.bids.forEach(([p, q]) => bids.set(p, q)); d.asks.forEach(([p, q]) => asks.set(p, q)); id = d.lastUpdateId; buf.forEach(apply);
    };
    ws.onmessage = ev => { for (const line of String(ev.data).split('\n')) { if (!line.trim()) continue; let m: any; try { m = JSON.parse(line); } catch { continue; } for (const x of Array.isArray(m) ? m : [m]) {
      if (x.s && x.s !== symbol) continue;
      if (x.e === 'depthUpdate') { if (!id) buf.push(x); else apply(x); }
      else if (x.e === 'trade') { const t = { p: +x.p, q: +x.q, t: x.T, b: !x.m }; trades.push(t); if (t.b) buys += t.p * t.q; else sells += t.p * t.q; }
    } } };
    const ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ method: 'ping', id: 0 })), 30_000);
    const tick = setInterval(() => {
      if (!id) return; const B = [...bids].filter(l => l[1] > 0).sort((a, b) => b[0] - a[0]).slice(0, 120); const S = [...asks].filter(l => l[1] > 0).sort((a, b) => a[0] - b[0]).slice(0, 120);
      if (!B[0] || !S[0]) return; const mid = (B[0][0] + S[0][0]) / 2;
      cols.push({ t: Date.now(), mid, bids: B, asks: S, buys: Math.round(buys), sells: Math.round(sells) }); buys = sells = 0;
      if (cols.length % 60 === 0) writeFileSync(OUT + `heat-${symbol}.json`, JSON.stringify({ symbol, cols, trades }));
      if (cols.length >= HEAT_SECS) { clearInterval(tick); clearInterval(ping); ws.close(); writeFileSync(OUT + `heat-${symbol}.json`, JSON.stringify({ symbol, cols, trades })); resolve(); }
    }, 1000);
  });
}

console.log('recording', HEAT, HEAT_SECS, 's; pressure log', RUN_MIN, 'min');
await Promise.all([scanLoop(), ...HEAT.map(heatRec)]);
console.log('done');
