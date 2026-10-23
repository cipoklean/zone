// Rule-based "trader brief": turns raw Strike market structure into plain-language reads.
import { Candle, Level, LiqBin, LivePos, Trade, fmtPct, fmtPx, fmtUsd } from './api';

export type Tone = 'bull' | 'bear' | 'warn' | 'info';
export interface TradeIdea { label: string; side: 'buy' | 'sell'; price?: number; stop?: number; tp?: number }
export interface Insight { tone: Tone; title: string; detail: string; score: number; tag: string; ideas?: TradeIdea[] }

export interface Ctx {
  symbol: string; tick: number; mid: number; bids: Level[]; asks: Level[]; trades: Trade[]; candles: Candle[];
  mark?: number; index?: number; fundingHourly?: number; nextFunding?: number;
  venueFunding?: Record<string, number>; // 8h-equivalent
  liq: LiqBin[]; live: LivePos[]; oiSeries: number[][]; ls?: { long: number; short: number }; topLs?: { long: number; short: number };
  change24h?: number;
}

export function slippage(levels: Level[], usd: number, mid: number) {
  let left = usd, qty = 0, cost = 0;
  for (const [p, q] of levels) { const v = p * q; const take = Math.min(v, left); qty += take / p; cost += take; left -= take; if (left <= 0) break; }
  if (left > 0 || !qty) return { avg: NaN, bps: NaN, filled: cost };
  const avg = cost / qty; return { avg, bps: Math.abs(avg - mid) / mid * 1e4, filled: cost };
}

export function atr(c: Candle[], len = 14) {
  if (c.length < len + 1) return NaN; let s = 0;
  for (let i = c.length - len; i < c.length; i++) { const p = c[i - 1].close; s += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - p), Math.abs(c[i].low - p)); }
  return s / len;
}

export function brief(x: Ctx): { items: Insight[]; bias: number; verdict: string } {
  const out: Insight[] = []; const { mid, tick } = x; if (!mid) return { items: [], bias: 0, verdict: 'Waiting for data…' };
  const px = (v: number) => fmtPx(v, tick);
  const A = atr(x.candles); const stopD = isFinite(A) ? 1.5 * A : mid * 0.005; const rnd = (v: number) => Math.round(v / tick) * tick;
  const bb = x.bids[0]?.[0] ?? mid, ba = x.asks[0]?.[0] ?? mid;
  const longAt = (price: number, label: string, tp?: number): TradeIdea => ({ label, side: 'buy', price: rnd(price), stop: rnd(price - stopD), tp: tp ? rnd(tp) : rnd(price + 2 * stopD) });
  const shortAt = (price: number, label: string, tp?: number): TradeIdea => ({ label, side: 'sell', price: rnd(price), stop: rnd(price + stopD), tp: tp ? rnd(tp) : rnd(price - 2 * stopD) });

  // 1. Order book imbalance near the touch
  const within = (lv: Level[], pct: number) => lv.filter(([p]) => Math.abs(p - mid) / mid <= pct).reduce((s, [p, q]) => s + p * q, 0);
  const b1 = within(x.bids, 0.01), a1 = within(x.asks, 0.01);
  if (b1 + a1 > 0) {
    const imb = (b1 - a1) / (b1 + a1);
    out.push({ tag: 'Book', tone: imb > 0.2 ? 'bull' : imb < -0.2 ? 'bear' : 'info', score: imb * 1.5,
      title: `Book ${imb > 0.2 ? 'leans bid' : imb < -0.2 ? 'leans ask' : 'balanced'} within ±1%`,
      detail: `${fmtUsd(b1)} of bids vs ${fmtUsd(a1)} of asks inside 1% of mid (${(imb * 100).toFixed(0)}% imbalance). ${imb > 0.2 ? 'Dips are being absorbed.' : imb < -0.2 ? 'Rallies run into heavier supply.' : 'No side is stacking.'}`,
      ideas: imb > 0.2 ? [longAt(bb, 'Long at best bid')] : imb < -0.2 ? [shortAt(ba, 'Short at best ask')] : undefined });
  }

  // 2. Walls
  const wall = (lv: Level[]) => lv.filter(([p]) => Math.abs(p - mid) / mid <= 0.03).reduce((m, l) => (l[0] * l[1] > m[0] * m[1] ? l : m), [0, 0] as Level);
  const bw = wall(x.bids), aw = wall(x.asks);
  if (bw[1] && aw[1]) out.push({ tag: 'Levels', tone: 'info', score: 0, title: `Support ${px(bw[0])} · resistance ${px(aw[0])}`,
    detail: `Largest resting bid within 3% is ${fmtUsd(bw[0] * bw[1])} at ${px(bw[0])} (${fmtPct((bw[0] / mid - 1) * 100)}); largest ask is ${fmtUsd(aw[0] * aw[1])} at ${px(aw[0])} (${fmtPct((aw[0] / mid - 1) * 100)}).`,
    ideas: [{ label: 'Bid above support', side: 'buy', price: rnd(bw[0] + tick), stop: rnd(bw[0] - stopD), tp: rnd(aw[0] - tick) }, { label: 'Offer below resistance', side: 'sell', price: rnd(aw[0] - tick), stop: rnd(aw[0] + stopD), tp: rnd(bw[0] + tick) }] });

  // 3. Execution cost
  const s10 = slippage(x.asks, 10_000, mid), s50 = slippage(x.asks, 50_000, mid);
  const spreadBps = x.asks[0] && x.bids[0] ? (x.asks[0][0] - x.bids[0][0]) / mid * 1e4 : NaN;
  out.push({ tag: 'Execution', tone: (s10.bps || 99) > 15 ? 'warn' : 'info', score: 0, title: `Spread ${spreadBps.toFixed(1)} bps · $10K market ≈ ${isFinite(s10.bps) ? s10.bps.toFixed(1) + ' bps' : 'book too thin'}`,
    detail: `A $50K market buy would ${isFinite(s50.bps) ? `fill around ${px(s50.avg)} (${s50.bps.toFixed(1)} bps slippage)` : `exhaust the visible book (only ${fmtUsd(s50.filled)} on the ask side)`}. ${(s10.bps || 99) > 15 ? 'Use limit or post-only orders and earn the -0.005% maker rebate.' : 'Market orders are cheap here; taker fee is 0.05% at tier 0.'}` });

  // 4. Liquidation clusters
  if (x.liq.length) {
    const below = x.liq.filter(b => b.price < mid && b.long > 0).sort((a, b) => b.long - a.long)[0];
    const above = x.liq.filter(b => b.price > mid && b.short > 0).sort((a, b) => b.short - a.short)[0];
    const lUsd = below ? below.long * below.price : 0, sUsd = above ? above.short * above.price : 0;
    if (below || above) out.push({ tag: 'Liquidations', tone: sUsd > lUsd * 1.3 ? 'bull' : lUsd > sUsd * 1.3 ? 'bear' : 'info', score: sUsd > lUsd * 1.3 ? 0.5 : lUsd > sUsd * 1.3 ? -0.5 : 0,
      title: `Liquidation magnets: ${below ? px(below.price) : '—'} below · ${above ? px(above.price) : '—'} above`,
      detail: `${below ? `${fmtUsd(lUsd)} of longs get liquidated near ${px(below.price)} (${fmtPct((below.price / mid - 1) * 100)})` : 'No long cluster below'}; ${above ? `${fmtUsd(sUsd)} of shorts near ${px(above.price)} (${fmtPct((above.price / mid - 1) * 100)})` : 'no short cluster above'}. Price often gets pulled toward the bigger pool; cascades can overshoot.`,
      ideas: [...(above ? [longAt(bb, `Long toward ${px(above.price)} shorts`, above.price)] : []), ...(below ? [shortAt(ba, `Short toward ${px(below.price)} longs`, below.price)] : [])] });
  }

  // 5. Funding
  if (x.fundingHourly !== undefined && isFinite(x.fundingHourly)) {
    const apr = x.fundingHourly * 24 * 365 * 100; const f8 = x.fundingHourly * 8;
    const others = Object.entries(x.venueFunding || {}).filter(([k, v]) => k !== 'strike' && isFinite(v));
    const med = others.length ? others.map(o => o[1]).sort((a, b) => a - b)[Math.floor(others.length / 2)] : NaN;
    const diff = (f8 - med) * 3 * 365 * 100;
    const crowded = Math.abs(apr) > 30;
    out.push({ tag: 'Funding', tone: crowded ? 'warn' : 'info', score: apr > 30 ? -0.4 : apr < -30 ? 0.4 : 0,
      title: `Funding ${(x.fundingHourly * 100).toFixed(4)}%/h → ${apr.toFixed(1)}% APR, ${apr >= 0 ? 'longs pay shorts' : 'shorts pay longs'}`,
      detail: `${isFinite(med) ? `Other venues' median is ${(med * 100).toFixed(4)}%/8h, so Strike is ${Math.abs(diff).toFixed(1)}% APR ${diff >= 0 ? 'richer' : 'cheaper'}. ${Math.abs(diff) > 15 ? `Carry idea: ${diff > 0 ? 'short on Strike, long elsewhere' : 'long on Strike, short elsewhere'} to collect the gap.` : 'No meaningful cross-venue carry.'} ` : ''}${crowded ? 'Funding this extreme signals a crowded side.' : ''}${x.nextFunding ? ` Next payment in ${Math.max(0, Math.round((x.nextFunding - Date.now()) / 60000))} min.` : ''}` });
  }

  // 6. Basis
  if (x.mark && x.index) {
    const basis = (x.mark / x.index - 1) * 1e4;
    out.push({ tag: 'Basis', tone: Math.abs(basis) > 20 ? 'warn' : 'info', score: 0, title: `Mark ${basis >= 0 ? 'above' : 'below'} index by ${Math.abs(basis).toFixed(1)} bps`,
      detail: `Mark ${px(x.mark)} vs index ${px(x.index)}. Liquidations trigger on mark price, not last trade${Math.abs(basis) > 20 ? '; a wide basis means stops and liquidations can fire before the chart shows it.' : '.'}` });
  }

  // 7. Tape / CVD
  const now = Date.now(); const recent = x.trades.filter(t => now - t.time < 15 * 60_000);
  if (recent.length >= 3) {
    const buy = recent.filter(t => t.buy).reduce((s, t) => s + t.price * t.qty, 0), sell = recent.filter(t => !t.buy).reduce((s, t) => s + t.price * t.qty, 0);
    const d = (buy - sell) / Math.max(1, buy + sell); const big = recent.reduce((m, t) => (t.price * t.qty > m.price * m.qty ? t : m), recent[0]);
    out.push({ tag: 'Flow', tone: d > 0.2 ? 'bull' : d < -0.2 ? 'bear' : 'info', score: d, title: `15-min flow: ${d > 0.2 ? 'aggressive buying' : d < -0.2 ? 'aggressive selling' : 'two-sided'} (${(d * 100).toFixed(0)}% delta)`,
      detail: `${fmtUsd(buy)} taker buys vs ${fmtUsd(sell)} taker sells across ${recent.length} prints. Largest print: ${fmtUsd(big.price * big.qty)} ${big.buy ? 'buy' : 'sell'} at ${px(big.price)}.`,
      ideas: d > 0.2 ? [longAt(bb, 'Follow buyers')] : d < -0.2 ? [shortAt(ba, 'Follow sellers')] : undefined });
  }

  // 8. OI vs price
  if (x.oiSeries.length > 6 && x.change24h !== undefined) {
    const last = x.oiSeries[x.oiSeries.length - 1][1]; const first = x.oiSeries.find(r => r[1] > 0)?.[1] || last;
    const oiCh = first ? (last / first - 1) * 100 : 0; const pUp = x.change24h > 0;
    const read = oiCh > 3 ? (pUp ? 'new longs are opening (trend has fuel)' : 'new shorts are pressing (bearish conviction)') : oiCh < -3 ? (pUp ? 'shorts are covering (squeeze, may fade)' : 'longs are closing (capitulation, may exhaust)') : 'positioning is flat';
    out.push({ tag: 'Open interest', tone: oiCh > 3 ? (pUp ? 'bull' : 'bear') : 'info', score: oiCh > 3 ? (pUp ? 0.4 : -0.4) : 0, title: `OI ${fmtPct(oiCh, 1)} with price ${fmtPct(x.change24h, 1)}`, detail: `Over the loaded window, ${read}.` });
  }

  // 9. Crowd vs top traders
  if (x.ls) {
    const crowdLong = x.ls.long; const top = x.topLs?.long;
    out.push({ tag: 'Positioning', tone: crowdLong > 65 ? 'warn' : crowdLong < 35 ? 'warn' : 'info', score: crowdLong > 65 ? -0.3 : crowdLong < 35 ? 0.3 : 0,
      title: `Crowd ${crowdLong.toFixed(0)}% long${top !== undefined ? ` · top traders ${top.toFixed(0)}% long` : ''}`,
      detail: `${crowdLong > 65 ? 'Heavily long book: downside wicks can cascade.' : crowdLong < 35 ? 'Heavily short book: squeezes are likely on good news.' : 'Positioning is not stretched.'}${top !== undefined && Math.abs(top - crowdLong) > 10 ? ` Top traders disagree with the crowd by ${Math.abs(top - crowdLong).toFixed(0)} pts — side with size.` : ''}` });
  }

  // 10. Whale liquidation risk
  const near = x.live.filter(p => isFinite(p.liq) && p.liq > 0 && Math.abs(p.liq - mid) / mid < 0.05);
  if (near.length) {
    const longs = near.filter(p => p.size > 0).reduce((s, p) => s + Math.abs(p.size) * mid, 0), shorts = near.filter(p => p.size < 0).reduce((s, p) => s + Math.abs(p.size) * mid, 0);
    out.push({ tag: 'Whales', tone: 'warn', score: shorts > longs ? 0.3 : -0.3, title: `${near.length} live positions liquidate within 5%`, detail: `${fmtUsd(longs)} long and ${fmtUsd(shorts)} short notional sit within 5% of their liquidation price. They're drawn on the chart as dashed lines.` });
  }

  // 11. Volatility-based stop
  const a = atr(x.candles);
  if (isFinite(a)) out.push({ tag: 'Risk', tone: 'info', score: 0, title: `ATR ${px(a)} (${(a / mid * 100).toFixed(2)}%) per candle`,
    detail: `A 1.5×ATR stop is ${px(1.5 * a)} away: long stop ≈ ${px(mid - 1.5 * a)}, short stop ≈ ${px(mid + 1.5 * a)}. Max sensible leverage for that stop ≈ ${Math.max(1, Math.floor(100 / (1.5 * a / mid * 100) / 2))}x.`,
    ideas: [longAt(bb, 'Long with ATR stop'), shortAt(ba, 'Short with ATR stop')] });

  const bias = Math.max(-1, Math.min(1, out.reduce((s, i) => s + i.score, 0) / 3));
  const verdict = bias > 0.35 ? 'Bullish lean' : bias < -0.35 ? 'Bearish lean' : bias > 0.12 ? 'Slightly bullish' : bias < -0.12 ? 'Slightly bearish' : 'Neutral / range';
  return { items: out, bias, verdict };
}

// Pressure score: one number from -100 (sell pressure) to +100 (buy pressure).
// Weights: book imbalance within 1% (40), 15-min taker delta (30), liquidation pull (20), funding crowding (10, contrarian).
export interface PressureIn { mid: number; bids: Level[]; asks: Level[]; trades: Trade[]; liq: LiqBin[]; fundingHourly?: number }
export function pressure(x: PressureIn): { score: number; parts: Record<string, number> } {
  const { mid } = x; if (!mid) return { score: NaN, parts: {} };
  const within = (lv: Level[]) => lv.filter(([p]) => Math.abs(p - mid) / mid <= 0.01).reduce((s, [p, q]) => s + p * q, 0);
  const b = within(x.bids), a = within(x.asks); const book = b + a ? (b - a) / (b + a) : 0;
  const now = Date.now(); const rec = x.trades.filter(t => now - t.time < 15 * 60_000);
  const buy = rec.filter(t => t.buy).reduce((s, t) => s + t.price * t.qty, 0), sell = rec.filter(t => !t.buy).reduce((s, t) => s + t.price * t.qty, 0);
  const flow = buy + sell > 0 ? (buy - sell) / (buy + sell) * Math.min(1, rec.length / 5) : 0;
  const near = x.liq.filter(l => Math.abs(l.price - mid) / mid <= 0.1);
  const up = near.filter(l => l.price > mid).reduce((s, l) => s + l.short * l.price / Math.max(0.002, (l.price - mid) / mid), 0);
  const dn = near.filter(l => l.price < mid).reduce((s, l) => s + l.long * l.price / Math.max(0.002, (mid - l.price) / mid), 0);
  const liq = up + dn ? (up - dn) / (up + dn) : 0;
  const apr = (x.fundingHourly ?? 0) * 24 * 365 * 100; const fund = -Math.max(-1, Math.min(1, apr / 50));
  const parts = { book: book * 40, flow: flow * 30, liquidations: liq * 20, funding: fund * 10 };
  return { score: Math.round(Object.values(parts).reduce((s, v) => s + v, 0)), parts };
}
