import { useEffect, useMemo, useState } from 'react';
import type { MarketState } from '../useMarket';
import { brief } from '../insights';
import { FundingRow, fetchFundingComparison, fmtPct, fmtPx, fmtUsd } from '../api';

export function Spark({ data, color = '#f5c542', h = 40, zero = false }: { data: number[]; color?: string; h?: number; zero?: boolean }) {
  if (data.length < 2) return <svg height={h} />;
  let mn = Math.min(...data), mx = Math.max(...data); if (zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); } if (mx === mn) mx = mn + 1;
  const W = 240; const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${h - ((v - mn) / (mx - mn)) * (h - 4) - 2}`).join(' ');
  const zy = h - ((0 - mn) / (mx - mn)) * (h - 4) - 2;
  return <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" height={h} width="100%">{zero && <line x1="0" x2={W} y1={zy} y2={zy} stroke="#ffffff22" />}<polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

export function Brief({ m, symbol, tick, change24h, venues }: { m: MarketState; symbol: string; tick: number; change24h?: number; venues?: Record<string, number> }) {
  const mid = m.bids[0] && m.asks[0] ? (m.bids[0][0] + m.asks[0][0]) / 2 : 0;
  const b = useMemo(() => brief({ symbol, tick, mid, bids: m.bids, asks: m.asks, trades: m.trades, candles: m.candles, mark: m.mark, index: m.index, fundingHourly: m.fundingHourly, nextFunding: m.nextFunding, venueFunding: venues, liq: m.liq, live: m.live, oiSeries: m.oiSeries, ls: m.ls, topLs: m.topLs, change24h }), [Math.floor(m.version / 3), symbol]);
  const pct = (b.bias + 1) / 2 * 100;
  return (
    <div className="panel brief">
      <div className="ph"><b>Trader brief · {symbol}</b><span className="muted">auto-generated from live Strike data</span></div>
      <div className="gauge"><div className="gtrack"><i style={{ left: `${pct}%` }} /></div><div className="glabels"><span>Bearish</span><b className={b.bias > 0.12 ? 'up' : b.bias < -0.12 ? 'down' : ''}>{b.verdict}</b><span>Bullish</span></div></div>
      <div className="ins">{b.items.map((i, k) => <div key={k} className={`insight ${i.tone}`}><div><em>{i.tag}</em><b>{i.title}</b></div><p>{i.detail}</p></div>)}</div>
      <p className="muted small">Signals are heuristics over Strike's public order book, trades, funding, OI and liquidation data. Not financial advice.</p>
    </div>
  );
}

export function Derivs({ m, tick }: { m: MarketState; tick: number }) {
  const apr = (m.fundingHourly ?? NaN) * 24 * 365 * 100; const mins = m.nextFunding ? Math.max(0, Math.round((m.nextFunding - Date.now()) / 1000)) : 0;
  const basis = m.mark && m.index ? (m.mark / m.index - 1) * 1e4 : NaN;
  const oiUsd = (m.oi ?? NaN) * (m.mark ?? NaN);
  return (
    <div className="panel">
      <div className="ph"><b>Derivatives</b></div>
      <div className="kv"><span>Mark</span><b>{fmtPx(m.mark ?? NaN, tick)}</b><span>Index</span><b>{fmtPx(m.index ?? NaN, tick)}</b><span>Basis</span><b className={basis >= 0 ? 'up' : 'down'}>{isFinite(basis) ? basis.toFixed(1) + ' bps' : '—'}</b>
        <span>Funding (1h)</span><b className={(m.fundingHourly ?? 0) >= 0 ? 'up' : 'down'}>{m.fundingHourly !== undefined ? (m.fundingHourly * 100).toFixed(4) + '%' : '—'}</b><span>Annualized</span><b>{isFinite(apr) ? apr.toFixed(1) + '%' : '—'}</b><span>Next funding</span><b>{Math.floor(mins / 60)}m {mins % 60}s</b>
        <span>Open interest</span><b>{fmtUsd(oiUsd)}</b><span>Crowd long</span><b>{m.ls ? m.ls.long.toFixed(0) + '%' : '—'}</b><span>Top traders long</span><b>{m.topLs ? m.topLs.long.toFixed(0) + '%' : '—'}</b></div>
      <div className="sp"><span className="muted">Funding, 7d (hourly)</span><Spark data={m.fundingSeries.map(r => r[1])} zero color="#a78bfa" /></div>
      <div className="sp"><span className="muted">Open interest (1h)</span><Spark data={m.oiSeries.map(r => r[1])} color="#38bdf8" /></div>
      <div className="sp"><span className="muted">Avg spread (1h)</span><Spark data={m.spreadSeries.map(r => r[1])} color="#f97316" /></div>
    </div>
  );
}

export function useFundingTable() {
  const [rows, setRows] = useState<FundingRow[]>([]);
  useEffect(() => { const go = () => fetchFundingComparison().then(setRows).catch(() => {}); go(); const t = setInterval(go, 120_000); return () => clearInterval(t); }, []);
  return rows;
}

// Cross-venue funding arbitrage scanner (8h-equivalent rates from Strike's stats API)
export function FundingArb({ rows, onPick }: { rows: FundingRow[]; onPick: (s: string) => void }) {
  const venues = ['strike', 'binance', 'bybit', 'okx', 'hyperliquid', 'lighter', 'extended', 'variational'];
  const data = rows.map(r => { const others = Object.entries(r.venues).filter(([k, v]) => k !== 'strike' && isFinite(v)).map(([, v]) => v).sort((a, b) => a - b); const med = others.length ? others[Math.floor(others.length / 2)] : NaN; const gap = (r.venues.strike - med) * 3 * 365 * 100; return { ...r, med, gap }; })
    .filter(r => isFinite(r.gap)).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const present = venues.filter(v => rows.some(r => r.venues[v] !== undefined));
  return (
    <div className="panel">
      <div className="ph"><b>Funding arbitrage scanner</b><span className="muted">8h-equivalent rates · APR gap = Strike vs other-venue median</span></div>
      <div className="tablewrap"><table><thead><tr><th>Market</th>{present.map(v => <th key={v}>{v}</th>)}<th>APR gap</th><th>Carry idea</th></tr></thead>
        <tbody>{data.slice(0, 20).map(r => <tr key={r.symbol} onClick={() => onPick(r.symbol)} className="click"><td><b>{r.symbol}</b></td>{present.map(v => <td key={v} className={(r.venues[v] ?? 0) >= 0 ? 'up' : 'down'}>{r.venues[v] !== undefined ? (r.venues[v] * 100).toFixed(4) + '%' : '—'}</td>)}<td className={Math.abs(r.gap) > 15 ? 'hot' : ''}>{fmtPct(r.gap, 1)}</td><td className="muted">{Math.abs(r.gap) < 10 ? 'none' : r.gap > 0 ? 'Short Strike / long hedge' : 'Long Strike / short hedge'}</td></tr>)}</tbody></table></div>
    </div>
  );
}
