import { useEffect, useMemo, useState } from 'react';
import type { MarketState } from '../useMarket';
import { brief, TradeIdea } from '../insights';
import { FundingRow, fetchFundingComparison, fmtPct, fmtPx, fmtUsd } from '../api';

export function Spark({ data, color = '#f8931a', h = 40, zero = false }: { data: number[]; color?: string; h?: number; zero?: boolean }) {
  if (data.length < 2) return <svg height={h} />;
  let mn = Math.min(...data), mx = Math.max(...data); if (zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); } if (mx === mn) mx = mn + 1;
  const W = 240; const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${h - ((v - mn) / (mx - mn)) * (h - 4) - 2}`).join(' ');
  const zy = h - ((0 - mn) / (mx - mn)) * (h - 4) - 2;
  return <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" height={h} width="100%">{zero && <line x1="0" x2={W} y1={zy} y2={zy} stroke="#ffffff22" />}<polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

export function Brief({ m, symbol, tick, change24h, venues, onTrade }: { m: MarketState; symbol: string; tick: number; change24h?: number; venues?: Record<string, number>; onTrade: (t: TradeIdea) => void }) {
  const mid = m.bids[0] && m.asks[0] ? (m.bids[0][0] + m.asks[0][0]) / 2 : 0;
  const b = useMemo(() => brief({ symbol, tick, mid, bids: m.bids, asks: m.asks, trades: m.trades, candles: m.candles, mark: m.mark, index: m.index, fundingHourly: m.fundingHourly, nextFunding: m.nextFunding, venueFunding: venues, liq: m.liq, live: m.live, oiSeries: m.oiSeries, ls: m.ls, topLs: m.topLs, change24h }), [Math.floor(m.version / 3), symbol]);
  const pct = (b.bias + 1) / 2 * 100;
  return (
    <div className="panel brief">
      <div className="ph"><b>Trader brief · {symbol}</b><span className="muted">auto-generated from live Strike data</span></div>
      <div className="gauge"><div className="gtrack"><i style={{ left: `${pct}%` }} /></div><div className="glabels"><span>Bearish</span><b className={b.bias > 0.12 ? 'up' : b.bias < -0.12 ? 'down' : ''}>{b.verdict}</b><span>Bullish</span></div></div>
      <div className="ins">{b.items.map((i, k) => <div key={k} className={`insight ${i.tone}`}><div><em>{i.tag}</em><b>{i.title}</b></div><p>{i.detail}</p>{i.ideas?.length ? <div className="ideas">{i.ideas.map((t, j) => <button key={j} className={`idea ${t.side}`} onClick={() => onTrade(t)} title={`Load into ticket: ${t.side === 'buy' ? 'long' : 'short'} @ ${fmtPx(t.price ?? NaN, tick)}, stop ${fmtPx(t.stop ?? NaN, tick)}, target ${fmtPx(t.tp ?? NaN, tick)}`}>{t.side === 'buy' ? '▲' : '▼'} {t.label} <span>→ ticket</span></button>)}</div> : null}</div>)}</div>
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
      <div className="sp"><span className="muted">Open interest (1h)</span><Spark data={m.oiSeries.map(r => r[1])} color="#4eabfa" /></div>
      <div className="sp"><span className="muted">Avg spread (1h)</span><Spark data={m.spreadSeries.map(r => r[1])} color="#c084fc" /></div>
    </div>
  );
}

export function useFundingTable() {
  const [rows, setRows] = useState<FundingRow[]>([]);
  useEffect(() => { const go = () => fetchFundingComparison().then(setRows).catch(() => {}); go(); const t = setInterval(go, 120_000); return () => clearInterval(t); }, []);
  return rows;
}

// Cross-venue funding arbitrage scanner (8h-equivalent rates from Strike's stats API) with a net-of-fees carry calculator.
const VENUE_TAKER: Record<string, number> = { strike: 0.0005, binance: 0.0005, bybit: 0.00055, okx: 0.0005, hyperliquid: 0.00045, lighter: 0, extended: 0.00025, variational: 0 };
export function FundingArb({ rows, onPick }: { rows: FundingRow[]; onPick: (s: string) => void }) {
  const [size, setSize] = useState('10000'); const [days, setDays] = useState('7');
  const venues = ['strike', 'binance', 'bybit', 'okx', 'hyperliquid', 'lighter', 'extended', 'variational'];
  const N = Math.max(0, +size || 0), D = Math.max(0, +days || 0);
  const data = rows.map(r => {
    const others = Object.entries(r.venues).filter(([k, v]) => k !== 'strike' && isFinite(v)); const sorted = others.map(([, v]) => v).sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN; const gap = (r.venues.strike - med) * 3 * 365 * 100;
    // best hedge venue: largest rate gap vs Strike; we short the higher-funding leg and long the lower one
    const best = others.reduce<[string, number] | null>((b, o) => (!b || Math.abs(r.venues.strike - o[1]) > Math.abs(r.venues.strike - b[1]) ? o : b), null);
    const per8 = best ? Math.abs(r.venues.strike - best[1]) : NaN; const gross = per8 * 3 * D * N;
    const fees = best ? 2 * N * (VENUE_TAKER.strike + (VENUE_TAKER[best[0]] ?? 0.0005)) : NaN; // open + close both legs, taker
    const net = gross - fees; const breakeven = per8 > 0 ? fees / (per8 * 3 * N) : NaN;
    return { ...r, med, gap, hedge: best?.[0], strikeShort: best ? r.venues.strike > best[1] : false, gross, fees, net, breakeven };
  }).filter(r => isFinite(r.gap)).sort((a, b) => b.net - a.net);
  const present = venues.filter(v => rows.some(r => r.venues[v] !== undefined));
  return (
    <div className="panel">
      <div className="ph"><b>Funding arbitrage scanner</b><span className="muted">8h-equivalent rates · ranked by net carry after taker fees on both legs</span>
        <label className="inl">Size $<input value={size} onChange={e => setSize(e.target.value)} /></label><label className="inl">Days<input value={days} onChange={e => setDays(e.target.value)} /></label></div>
      <div className="tablewrap"><table><thead><tr><th>Market</th>{present.map(v => <th key={v}>{v}</th>)}<th>APR gap</th><th>Trade</th><th>Gross</th><th>Fees</th><th>Net</th><th>Break-even</th></tr></thead>
        <tbody>{data.slice(0, 20).map(r => <tr key={r.symbol} onClick={() => onPick(r.symbol)} className="click"><td><b>{r.symbol}</b></td>{present.map(v => <td key={v} className={(r.venues[v] ?? 0) >= 0 ? 'up' : 'down'}>{r.venues[v] !== undefined ? (r.venues[v] * 100).toFixed(4) + '%' : '—'}</td>)}
          <td className={Math.abs(r.gap) > 15 ? 'hot' : ''}>{fmtPct(r.gap, 1)}</td><td className="muted">{r.hedge ? `${r.strikeShort ? 'Short' : 'Long'} Strike / ${r.strikeShort ? 'long' : 'short'} ${r.hedge}` : '—'}</td>
          <td>{fmtUsd(r.gross, 2)}</td><td className="muted">{fmtUsd(r.fees, 2)}</td><td className={r.net > 0 ? 'up hot' : 'down'}>{fmtUsd(r.net, 2)}</td><td className="muted">{isFinite(r.breakeven) ? r.breakeven.toFixed(1) + ' d' : '—'}</td></tr>)}</tbody></table></div>
      <p className="muted small">Assumes today's rates hold for the whole period and taker fills on both venues at entry and exit. Funding rates move every hour, so re-check before you put on a carry trade.</p>
    </div>
  );
}
