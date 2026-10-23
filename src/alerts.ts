// Alert engine: watches live Strike market state and fires browser notifications and an optional webhook.
// The webhook payload is the contract for external bots (Telegram/Discord): see ALERTS.md.
import type { MarketState } from './useMarket';
import { fmtPx, fmtUsd } from './api';

export type AlertKind = 'liq_cluster_near' | 'funding_flip' | 'whale_near_liq' | 'pressure_extreme';
export interface AlertEvent { id: string; kind: AlertKind; symbol: string; time: number; price: number; title: string; message: string; data: Record<string, number | string>; app: string }
export interface AlertSettings { enabled: boolean; notify: boolean; webhook: string; clusterPct: number; whalePct: number; pressure: number; funding: boolean; minClusterUsd: number }

export const DEFAULT_ALERTS: AlertSettings = { enabled: true, notify: false, webhook: '', clusterPct: 1, whalePct: 1, pressure: 60, funding: true, minClusterUsd: 5000 };
const KEY = 'sz-alerts';
export const loadAlertSettings = (): AlertSettings => { try { return { ...DEFAULT_ALERTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT_ALERTS; } };
export const saveAlertSettings = (s: AlertSettings) => localStorage.setItem(KEY, JSON.stringify(s));

const COOLDOWN = 10 * 60_000;
const lastFired = new Map<string, number>();
const prevFunding = new Map<string, number>();

export function evaluate(symbol: string, m: MarketState, score: number, tick: number, s: AlertSettings): AlertEvent[] {
  const mid = m.bids[0] && m.asks[0] ? (m.bids[0][0] + m.asks[0][0]) / 2 : m.mark || 0; if (!mid || m.demo) return [];
  const out: Omit<AlertEvent, 'id' | 'time' | 'app'>[] = []; const px = (v: number) => fmtPx(v, tick);

  // 1. Liquidation cluster within X% of price
  const biggest = (above: boolean) => m.liq.filter(b => (above ? b.price > mid && b.short > 0 : b.price < mid && b.long > 0) && Math.abs(b.price / mid - 1) * 100 <= s.clusterPct).sort((x, y) => (above ? y.short * y.price - x.short * x.price : y.long * y.price - x.long * x.price))[0];
  for (const b of [biggest(true), biggest(false)]) {
    if (!b) continue; const d = (b.price / mid - 1) * 100; const usd = (b.price > mid ? b.short : b.long) * b.price;
    if (usd >= s.minClusterUsd) {
      const side = b.price > mid ? 'short' : 'long';
      out.push({ kind: 'liq_cluster_near', symbol, price: mid, title: `${symbol}: ${fmtUsd(usd)} ${side} liquidations ${Math.abs(d).toFixed(2)}% ${d > 0 ? 'above' : 'below'}`, message: `Price ${px(mid)} is ${Math.abs(d).toFixed(2)}% from a ${fmtUsd(usd)} ${side}-liquidation cluster at ${px(b.price)}. A move into it can cascade.`, data: { cluster_price: b.price, cluster_usd: Math.round(usd), distance_pct: +d.toFixed(3), side } });
    }
  }
  // 2. Funding sign flip
  if (s.funding && m.fundingHourly !== undefined && isFinite(m.fundingHourly)) {
    const prev = prevFunding.get(symbol); prevFunding.set(symbol, m.fundingHourly);
    if (prev !== undefined && prev !== 0 && m.fundingHourly !== 0 && Math.sign(prev) !== Math.sign(m.fundingHourly))
      out.push({ kind: 'funding_flip', symbol, price: mid, title: `${symbol}: funding flipped ${m.fundingHourly > 0 ? 'positive' : 'negative'}`, message: `Hourly funding went from ${(prev * 100).toFixed(4)}% to ${(m.fundingHourly * 100).toFixed(4)}%. ${m.fundingHourly > 0 ? 'Longs now pay shorts.' : 'Shorts now pay longs.'}`, data: { from_hourly: prev, to_hourly: m.fundingHourly } });
  }
  // 3. Whale near liquidation
  for (const p of m.live) {
    if (!isFinite(p.liq) || p.liq <= 0) continue; const d = (p.liq / mid - 1) * 100; const usd = Math.abs(p.size) * mid;
    if (Math.abs(d) <= s.whalePct && usd >= s.minClusterUsd)
      out.push({ kind: 'whale_near_liq', symbol, price: mid, title: `${symbol}: ${fmtUsd(usd)} ${p.size > 0 ? 'long' : 'short'} ${Math.abs(d).toFixed(2)}% from liquidation`, message: `A ${p.leverage}x ${p.size > 0 ? 'long' : 'short'} worth ${fmtUsd(usd)} liquidates at ${px(p.liq)}. Its forced ${p.size > 0 ? 'sell' : 'buy'} would hit the book.`, data: { liq_price: p.liq, notional_usd: Math.round(usd), leverage: p.leverage, address: p.address || '', distance_pct: +d.toFixed(3) } });
  }
  // 4. Pressure score extreme
  if (isFinite(score) && Math.abs(score) >= s.pressure)
    out.push({ kind: 'pressure_extreme', symbol, price: mid, title: `${symbol}: pressure ${score > 0 ? '+' : ''}${score}`, message: `Order flow, book and liquidation pull combine to ${score > 0 ? 'strong buy' : 'strong sell'} pressure (${score}/100).`, data: { score } });

  const now = Date.now(); const fired: AlertEvent[] = [];
  for (const a of out) {
    const key = `${a.kind}:${symbol}:${a.data.cluster_price ?? a.data.liq_price ?? Math.sign(+(a.data.score ?? a.data.to_hourly ?? 0))}`;
    if (now - (lastFired.get(key) || 0) < COOLDOWN) continue; lastFired.set(key, now);
    fired.push({ ...a, id: `${key}:${now}`, time: now, app: `${location.origin}${location.pathname}?s=${symbol}` });
  }
  return fired;
}

export function deliver(ev: AlertEvent, s: AlertSettings) {
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(ev.title, { body: ev.message, tag: ev.id, icon: './favicon.svg' }); } catch {} }
  if (s.webhook) {
    // text/plain keeps this a "simple" CORS request (no preflight); the bot backend parses the body as JSON.
    fetch(s.webhook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(ev) }).catch(() => {});
  }
}
