import { useEffect, useState } from 'react';
import * as A from '../api';
import { fmtPct, fmtPx, fmtUsd, n, short } from '../api';

export interface WalletPos { symbol: string; size: number; entry: number; liq: number; upnl: number; leverage: number; margin_mode: string; funding: number }

// Read-only wallet risk view. Strike serves account/positions/orders by blockchain address, no keys needed.
export default function Wallet({ addr, setAddr, marks, onPositions, onPick }: { addr: string; setAddr: (a: string) => void; marks: Record<string, number>; onPositions: (p: WalletPos[]) => void; onPick: (s: string) => void }) {
  const [input, setInput] = useState(addr); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => setInput(addr), [addr]);
  useEffect(() => {
    if (!addr) { setD(null); onPositions([]); return; } let alive = true;
    const load = async () => {
      setBusy(true); setErr('');
      try {
        const [acc, pos, pf, oo] = await Promise.all([A.fetchAccount(addr), A.fetchPositions(addr), A.fetchPortfolio(addr).catch(() => null), A.fetchOpenOrders(addr).catch(() => ({ orders: [] }))]);
        if (!alive) return; setD({ acc, pos: pos.positions || [], pf, oo: oo.orders || [] });
        onPositions((pos.positions || []).map((p: any) => ({ symbol: p.symbol, size: n(p.size), entry: n(p.entry_price), liq: n(p.liquidation_price), upnl: n(p.upnl), leverage: p.leverage, margin_mode: p.margin_mode, funding: n(p.accumulated_funding_fees) })));
      } catch (e: any) { if (alive) { setErr(String(e.message || e).includes('404') ? 'No Strike account for that address.' : `Couldn't load: ${e.message}`); setD(null); onPositions([]); } }
      finally { alive && setBusy(false); }
    };
    load(); const t = setInterval(load, 15000); return () => { alive = false; clearInterval(t); };
  }, [addr]);

  const acc = d?.acc; const mb = n(acc?.margin_balance), mm = n(acc?.maintenance_margin); const ratio = mb > 0 ? mm / mb * 100 : NaN;
  const health = !isFinite(ratio) ? '' : ratio < 30 ? 'Healthy' : ratio < 60 ? 'Watch' : ratio < 85 ? 'At risk' : 'Liquidation imminent';
  return (
    <div className="panel wallet">
      <div className="ph"><b>Wallet lens</b><span className="muted">any Cardano, EVM or Solana address trading on Strike</span></div>
      <form className="row" onSubmit={e => { e.preventDefault(); setAddr(input.trim()); }}><input placeholder="addr1… / 0x… / Solana address" value={input} onChange={e => setInput(e.target.value)} /><button>{busy ? '…' : 'Load'}</button>{addr && <button type="button" className="ghost" onClick={() => setAddr('')}>Clear</button>}</form>
      {err && <p className="down">{err}</p>}
      {acc && <>
        <div className="kv"><span>Equity</span><b>{fmtUsd(mb, 2)}</b><span>Available</span><b>{fmtUsd(n(acc.available_balance), 2)}</b><span>Unrealized PnL</span><b className={n(acc.unrealized_pnl) >= 0 ? 'up' : 'down'}>{fmtUsd(n(acc.unrealized_pnl), 2)}</b>
          <span>Maint. margin</span><b>{fmtUsd(mm, 2)}</b><span>Margin ratio</span><b className={ratio < 30 ? 'up' : ratio < 60 ? 'warn' : 'down'}>{isFinite(ratio) ? ratio.toFixed(1) + '%' : '—'}</b><span>Health</span><b>{health}</b>
          {d.pf?.account && <><span>Realized PnL</span><b className={n(d.pf.account.realized_pnl) >= 0 ? 'up' : 'down'}>{fmtUsd(n(d.pf.account.realized_pnl))}</b><span>All-time volume</span><b>{fmtUsd(n(d.pf.account.all_time_volume))}</b><span>Funding paid</span><b>{fmtUsd(n(d.pf.account.all_time_funding_fees))}</b></>}</div>
        <div className="meter"><i style={{ width: `${Math.min(100, ratio || 0)}%`, background: ratio < 30 ? '#4efab0' : ratio < 60 ? '#eab308' : '#f43f5e' }} /><span>Liquidation at 100% margin ratio</span></div>
        <div className="tablewrap"><table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Liq.</th><th>To liq.</th><th>uPnL</th><th>Funding (net)</th></tr></thead><tbody>
          {d.pos.length ? d.pos.map((p: any) => { const mk = marks[p.symbol] || NaN; const liq = n(p.liquidation_price); const dist = (liq / mk - 1) * 100; const sz = n(p.size); return <tr key={p.id} className="click" onClick={() => onPick(p.symbol)}><td><b>{p.symbol}</b> <span className="muted">{p.leverage}x {p.margin_mode}</span></td><td className={sz > 0 ? 'up' : 'down'}>{sz > 0 ? 'Long' : 'Short'}</td><td>{fmtUsd(Math.abs(sz) * (mk || n(p.entry_price)))}</td><td>{fmtPx(n(p.entry_price), 0.0001)}</td><td>{fmtPx(mk, 0.0001)}</td><td>{liq > 0 ? fmtPx(liq, 0.0001) : '—'}</td><td className={Math.abs(dist) < 5 ? 'down hot' : Math.abs(dist) < 15 ? 'warn' : 'up'}>{liq > 0 && isFinite(dist) ? fmtPct(dist, 1) : '—'}</td><td className={n(p.upnl) >= 0 ? 'up' : 'down'}>{fmtUsd(n(p.upnl), 2)}</td><td className={n(p.accumulated_funding_fees) >= 0 ? "up" : "down"}>{fmtUsd(n(p.accumulated_funding_fees), 2)}</td></tr>; })
            : <tr><td colSpan={9} className="muted">No open positions.</td></tr>}</tbody></table></div>
        {d.oo.length > 0 && <p className="muted">{d.oo.length} open order(s) resting.</p>}
        <p className="muted small">Positions for the selected market are drawn on the chart (entry solid, liquidation dashed). Refreshes every 15s · {short(addr)}</p>
      </>}
    </div>
  );
}
