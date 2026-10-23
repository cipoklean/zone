// Backtest of the parts of the pressure score that Strike publishes history for:
// taker flow (30 pts, from 15m candles' taker-buy volume) + funding crowding (10 pts, hourly funding history).
// Book imbalance (40) and liquidation pull (20) have no public history, so they're tracked live by recorder.ts.
import * as A from '../src/api';
import { writeFileSync } from 'node:fs';
const H = 4; // forward horizon in 15m candles = 1 hour
const tk = (await A.fetchTickers()).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 12).map(t => t.symbol);
const rows: { s: string; sub: number; fwd: number }[] = [];
for (const s of tk) {
  const [kl, fh] = await Promise.all([A.fetchKlines(s, '15m', 1500), A.fetchFundingHistory(s, 30).catch(() => ({ data: [] as number[][] }))]);
  const f = fh.data; let fi = 0;
  for (let i = 0; i < kl.length - H; i++) {
    const c = kl[i]; if (!c.volume) continue;
    const buy = c.takerBuyVol, sell = c.volume - c.takerBuyVol; const flow = (buy - sell) / c.volume;
    const ts = (c.time + 900) * 1000; while (fi < f.length - 1 && f[fi + 1][0] <= ts) fi++;
    const apr = f.length && f[fi][0] <= ts ? f[fi][1] * 24 * 365 * 100 : 0; const fund = -Math.max(-1, Math.min(1, apr / 50));
    const sub = flow * 30 + fund * 10; const fwd = (kl[i + H].close - c.close) / c.close * 100;
    rows.push({ s, sub, fwd });
  }
}
const stat = (lo: number) => {
  const L = rows.filter(r => r.sub >= lo), S = rows.filter(r => r.sub <= -lo);
  const hit = (xs: typeof rows, dir: number) => xs.length ? xs.filter(r => r.fwd * dir > 0).length / xs.length * 100 : NaN;
  const avg = (xs: typeof rows, dir: number) => xs.length ? xs.reduce((a, r) => a + r.fwd * dir, 0) / xs.length : NaN;
  return { threshold: lo, long: { n: L.length, hit: hit(L, 1), avgMovePct: avg(L, 1) }, short: { n: S.length, hit: hit(S, -1), avgMovePct: avg(S, -1) } };
};
const base = rows.filter(r => r.fwd !== 0); const upShare = base.filter(r => r.fwd > 0).length / base.length * 100;
const out = { generatedAt: Date.now(), markets: tk, candles: '15m', horizon: '1h', samples: rows.length, baselineUpPct: upShare, buckets: [10, 20, 30].map(stat) };
writeFileSync(process.cwd() + '/public/track/backtest.json', JSON.stringify(out));
console.log(JSON.stringify(out, null, 1));
