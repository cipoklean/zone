import { useMemo, useState } from 'react';
import type { MarketState } from '../useMarket';
import { fmtPx, fmtQty, fmtUsd } from '../api';

export function OrderBook({ m, tick, onPick }: { m: MarketState; tick: number; onPick: (p: number) => void }) {
  const [group, setGroup] = useState(1);
  const g = tick * group;
  const agg = (lv: [number, number][], side: 'b' | 'a') => { const mp = new Map<number, number>(); for (const [p, q] of lv) { const k = side === 'b' ? Math.floor(p / g) * g : Math.ceil(p / g) * g; mp.set(k, (mp.get(k) || 0) + q); } return [...mp.entries()].sort((x, y) => side === 'b' ? y[0] - x[0] : x[0] - y[0]).slice(0, 14); };
  const bids = useMemo(() => agg(m.bids, 'b'), [m.version, group]), asks = useMemo(() => agg(m.asks, 'a'), [m.version, group]);
  let cb = 0, ca = 0; const bc = bids.map(([p, q]) => (cb += p * q)), ac = asks.map(([p, q]) => (ca += p * q)); const mx = Math.max(cb, ca, 1);
  const spread = asks[0] && bids[0] ? asks[0][0] - bids[0][0] : NaN; const mid = asks[0] && bids[0] ? (asks[0][0] + bids[0][0]) / 2 : NaN;
  return (
    <div className="panel book">
      <div className="ph"><b>Order book</b><span className="muted">click a level to load it in the ticket</span>
        <select value={group} onChange={e => setGroup(+e.target.value)}>{[1, 5, 10, 50, 100].map(x => <option key={x} value={x}>{fmtPx(tick * x, tick)}</option>)}</select></div>
      <div className="brow head"><span>Price</span><span>Size</span><span>Total</span></div>
      {[...asks].reverse().map(([p, q], i) => { const ci = asks.length - 1 - i; return <div key={'a' + p} className="brow ask" onClick={() => onPick(p)}><i style={{ width: `${ac[ci] / mx * 100}%` }} /><span>{fmtPx(p, tick)}</span><span>{fmtQty(q)}</span><span>{fmtUsd(ac[ci])}</span></div>; })}
      <div className="brow mid"><span>{fmtPx(mid, tick)}</span><span className="muted">spread {fmtPx(spread, tick)} ({(spread / mid * 1e4).toFixed(1)} bps)</span></div>
      {bids.map(([p, q], i) => <div key={'b' + p} className="brow bid" onClick={() => onPick(p)}><i style={{ width: `${bc[i] / mx * 100}%` }} /><span>{fmtPx(p, tick)}</span><span>{fmtQty(q)}</span><span>{fmtUsd(bc[i])}</span></div>)}
    </div>
  );
}

export function Tape({ m, tick }: { m: MarketState; tick: number }) {
  const [minUsd, setMin] = useState(0);
  const list = m.trades.filter(t => t.price * t.qty >= minUsd).slice(0, 60);
  const cutoff = Date.now() - 5 * 60_000; let buy = 0, sell = 0; m.trades.forEach(t => { if (t.time >= cutoff) { t.buy ? (buy += t.price * t.qty) : (sell += t.price * t.qty); } });
  const tot = buy + sell || 1;
  return (
    <div className="panel tape">
      <div className="ph"><b>Trades</b><select value={minUsd} onChange={e => setMin(+e.target.value)}>{[0, 100, 1000, 5000, 25000].map(x => <option key={x} value={x}>{x ? `≥ ${fmtUsd(x)}` : 'all sizes'}</option>)}</select></div>
      <div className="flowbar" title="Taker buy vs sell volume, last 5 minutes"><i style={{ width: `${buy / tot * 100}%` }} /><span>5m buys {fmtUsd(buy)}</span><span>sells {fmtUsd(sell)}</span></div>
      <div className="brow head"><span>Price</span><span>Size</span><span>Time</span></div>
      <div className="scroll">{list.map(t => <div key={t.id} className={`brow ${t.buy ? 'bid' : 'ask'} ${t.price * t.qty > 10000 ? 'big' : ''}`}><span>{fmtPx(t.price, tick)}</span><span>{fmtUsd(t.price * t.qty)}</span><span className="muted">{new Date(t.time).toLocaleTimeString()}</span></div>)}</div>
    </div>
  );
}
