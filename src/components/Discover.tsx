import { useEffect, useState } from 'react';
import * as A from '../api';
import { fmtPct, fmtUsd, n, short } from '../api';
import { Spark } from './Intel';

// Leaderboard, copy-trader discovery, vaults and live whale positions — all one click from the wallet lens.
export default function Discover({ onWallet, symbol, mark }: { onWallet: (a: string) => void; symbol: string; mark?: number }) {
  const [tab, setTab] = useState<'whales' | 'leaders' | 'copy' | 'vaults'>('whales');
  const [range, setRange] = useState('7d'); const [data, setData] = useState<any>(null); const [live, setLive] = useState<A.LivePos[]>([]);
  useEffect(() => {
    let alive = true; setData(null);
    const p = tab === 'leaders' ? A.fetchLeaderboard(range) : tab === 'copy' ? A.fetchCopyTraders('strike', 20) : tab === 'vaults' ? A.fetchVaults() : A.fetchLivePositions(symbol);
    p.then(d => { if (!alive) return; tab === 'whales' ? setLive(d as any) : setData(d); }).catch(() => alive && setData({ error: true }));
    return () => { alive = false; };
  }, [tab, range, symbol]);
  const T = (k: typeof tab, l: string) => <button className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>;
  return (
    <div className="panel">
      <div className="ph"><div className="tabs">{T('whales', `Live positions · ${symbol}`)}{T('leaders', 'Leaderboard')}{T('copy', 'Copy traders')}{T('vaults', 'Vaults')}</div>
        {tab === 'leaders' && <select value={range} onChange={e => setRange(e.target.value)}>{['24h', '7d', '30d', 'all_time'].map(r => <option key={r}>{r}</option>)}</select>}</div>
      <div className="tablewrap tall">
        {tab === 'whales' && <table><thead><tr><th>Trader</th><th>Side</th><th>Notional</th><th>Lev.</th><th>Entry</th><th>Liq.</th><th>To liq.</th><th>uPnL</th></tr></thead><tbody>
          {[...live].sort((a, b) => Math.abs(b.size * b.mark) - Math.abs(a.size * a.mark)).slice(0, 40).map((p, i) => { const mk = mark || p.mark; const dist = p.liq > 0 ? (p.liq / mk - 1) * 100 : NaN; const pnl = p.size * (mk - p.entry); return <tr key={i} className="click" onClick={() => onWallet(p.address)}><td>{short(p.address)}</td><td className={p.size > 0 ? 'up' : 'down'}>{p.size > 0 ? 'Long' : 'Short'}</td><td>{fmtUsd(Math.abs(p.size * mk))}</td><td>{p.leverage}x</td><td>{p.entry.toPrecision(6)}</td><td>{p.liq > 0 ? p.liq.toPrecision(6) : '—'}</td><td className={Math.abs(dist) < 5 ? 'down hot' : ''}>{isFinite(dist) ? fmtPct(dist, 1) : '—'}</td><td className={pnl >= 0 ? 'up' : 'down'}>{fmtUsd(pnl)}</td></tr>; })}
          {!live.length && <tr><td colSpan={8} className="muted">No open positions reported for {symbol}.</td></tr>}</tbody></table>}
        {tab === 'leaders' && data?.entries && <table><thead><tr><th>#</th><th>Trader</th><th>Total PnL</th><th>ROI</th><th>Equity</th><th>Max DD</th><th>Sharpe</th><th>Win rate</th></tr></thead><tbody>
          {data.entries.map((e: any, i: number) => <tr key={e.account_id} className="click" onClick={() => e.blockchain_address && onWallet(e.blockchain_address)}><td>{e.rank || i + 1}</td><td>{e.ada_handle ? '$' + e.ada_handle : e.nickname || short(e.blockchain_address)}{e.vault_name ? <span className="muted"> · {e.vault_name}</span> : null}</td><td className={n(e.total_pnl) >= 0 ? 'up' : 'down'}>{fmtUsd(n(e.total_pnl))}</td><td>{fmtPct(n(e.roi), 1)}</td><td>{fmtUsd(n(e.equity))}</td><td>{isFinite(n(e.max_drawdown_pct)) ? n(e.max_drawdown_pct).toFixed(1) + '%' : '—'}</td><td>{isFinite(n(e.sharpe_ratio)) ? n(e.sharpe_ratio).toFixed(2) : '—'}</td><td>{isFinite(n(e.win_rate_pct)) ? n(e.win_rate_pct).toFixed(0) + '%' : '—'}</td></tr>)}</tbody></table>}
        {tab === 'copy' && data?.items && <table><thead><tr><th>Trader</th><th>Copy score</th><th>Bias</th><th>30d PnL</th><th>30d ROI</th><th>Equity</th><th>Top assets</th><th>30d equity</th></tr></thead><tbody>
          {data.items.map((t: any) => <tr key={t.address} className="click" onClick={() => t.blockchain_address && onWallet(t.blockchain_address)}><td>{short(t.blockchain_address || t.address)}</td><td><b>{t.copy_score}</b></td><td>{t.bias}</td><td className={n(t.pnl?.['30d']) >= 0 ? 'up' : 'down'}>{fmtUsd(n(t.pnl?.['30d']))}</td><td>{fmtPct(n(t.roi?.['30d']) * 100, 1)}</td><td>{fmtUsd(n(t.account_value))}</td><td className="muted">{(t.top_assets || []).slice(0, 3).map((a: any) => a.asset).join(', ')}</td><td style={{ width: 120 }}><Spark data={(t.equity_curve_30d || []).map((r: any) => n(r[1]))} h={24} color="#4efab0" /></td></tr>)}</tbody></table>}
        {tab === 'vaults' && data?.vaults && <table><thead><tr><th>Vault</th><th>Equity</th><th>APR</th><th>Period return</th><th>All-time PnL</th><th>Sharpe</th><th>Depositors</th><th>Lockup</th><th></th></tr></thead><tbody>
          {data.vaults.map((v: any) => <tr key={v.vault_id}><td><b>{v.name}</b>{v.is_verified ? <span className="pill">verified</span> : null}<div className="muted small">{v.type}</div></td><td>{fmtUsd(n(v.equity))}</td><td className={n(v.apr) >= 0 ? 'up' : 'down'}>{fmtPct(n(v.apr), 1)}</td><td>{fmtPct(n(v.period_return), 1)}</td><td className={n(v.all_time_pnl) >= 0 ? 'up' : 'down'}>{fmtUsd(n(v.all_time_pnl))}</td><td>{isFinite(n(v.sharpe_ratio)) ? n(v.sharpe_ratio).toFixed(2) : '—'}</td><td>{v.depositors}</td><td>{v.lockup_days}d</td><td><a href={`${A.APP}/vaults/${v.vault_id}`} target="_blank">Open ↗</a></td></tr>)}</tbody></table>}
        {data?.error && <p className="down">Couldn't load this list right now.</p>}
        {tab !== 'whales' && !data && <p className="muted">Loading…</p>}
      </div>
    </div>
  );
}
