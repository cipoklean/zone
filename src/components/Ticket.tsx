import { useEffect, useMemo, useState } from 'react';
import * as ed from '@noble/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import type { MarketState } from '../useMarket';
import { APP, SymbolInfo, fmtPct, fmtPx, fmtQty, fmtUsd, n } from '../api';
import { ApiWallet, derivePub, signed } from '../sign';
import { atr, slippage } from '../insights';

const TAKER = 0.0005, MAKER = -0.00005, MMR = 0.005; // tier-0 fees; tier-1 maintenance rate (docs example)

// Order ticket with a pre-trade risk preview, wired to Strike's signed trading API (API wallets cannot withdraw).
export interface Preset { side: 'buy' | 'sell'; price?: number; stop?: number; tp?: number; seq: number }
export default function Ticket({ m, info, pickPrice, onAccount, preset }: { m: MarketState; info?: SymbolInfo; pickPrice?: number; onAccount: (a: string) => void; preset?: Preset }) {
  const sym = info?.symbol || ''; const tick = info?.tickSize || 0.01; const step = info?.stepSize || 0.001;
  const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [type, setType] = useState<'limit' | 'market'>('limit');
  const [usd, setUsd] = useState('100'); const [price, setPrice] = useState(''); const [lev, setLev] = useState(5); const [stop, setStop] = useState(''); const [tp, setTp] = useState('');
  const [postOnly, setPostOnly] = useState(false); const [reduceOnly, setReduceOnly] = useState(false);
  const [wallet, setWallet] = useState<ApiWallet | null>(null); const [keyIn, setKeyIn] = useState(''); const [acct, setAcct] = useState<any>(null); const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false); const [gen, setGen] = useState<{ pub: string; priv: string } | null>(null);

  useEffect(() => { if (pickPrice) { setType('limit'); setPrice(String(pickPrice)); } }, [pickPrice]);
  useEffect(() => { setPrice(''); setStop(''); setTp(''); }, [sym]);
  const clean = (v?: number) => (v && isFinite(v) ? String(+v.toFixed(Math.max(0, Math.ceil(-Math.log10(tick))))) : '');
  useEffect(() => { if (!preset) return; setSide(preset.side); setType('limit'); setPrice(clean(preset.price)); setStop(clean(preset.stop)); setTp(clean(preset.tp)); setReduceOnly(false); }, [preset?.seq]);
  useEffect(() => { const h = (e: any) => setSide(e.detail); addEventListener('sz-side', h); return () => removeEventListener('sz-side', h); }, []);

  const bestBid = m.bids[0]?.[0], bestAsk = m.asks[0]?.[0]; const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : m.mark || 0;
  const p = useMemo(() => {
    const notional = Math.max(0, +usd || 0);
    const fill = type === 'market' ? slippage(side === 'buy' ? m.asks : m.bids, notional, mid) : { avg: +price || NaN, bps: 0, filled: notional };
    const entry = fill.avg; const qtyRaw = notional / entry; const qty = Math.floor(qtyRaw / step) * step;
    const realNotional = qty * entry; const margin = realNotional / lev; const isMaker = type === 'limit' && (postOnly || (side === 'buy' ? entry < bestAsk : entry > bestBid));
    const fee = realNotional * (isMaker ? MAKER : TAKER);
    const liq = side === 'buy' ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR);
    const liqDist = (liq / entry - 1) * 100; const a = atr(m.candles); const sl = +stop || NaN, tpp = +tp || NaN;
    const risk = isFinite(sl) ? Math.abs(entry - sl) * qty + Math.abs(fee) : NaN; const reward = isFinite(tpp) ? Math.abs(tpp - entry) * qty : NaN;
    const warns: string[] = [];
    if (info && qty < info.minQty) warns.push(`Below min size ${info.minQty} ${info.baseAsset}`);
    if (info && realNotional < info.minNotional) warns.push(`Below min notional $${info.minNotional}`);
    if (isFinite(a) && Math.abs(liq - entry) < 2 * a) warns.push(`Liquidation is within 2× ATR (${fmtPx(2 * a, tick)}) — normal noise can liquidate you. Lower leverage.`);
    if (isFinite(sl) && ((side === 'buy' && sl <= liq) || (side === 'sell' && sl >= liq))) warns.push('Your stop is beyond the liquidation price, so it will never trigger.');
    const cluster = m.liq.filter(b => side === 'buy' ? (b.price < entry && b.price > liq && b.long > 0) : (b.price > entry && b.price < liq && b.short > 0)).sort((x, y) => (side === 'buy' ? y.long - x.long : y.short - x.short))[0];
    if (cluster) warns.push(`A ${side === 'buy' ? 'long' : 'short'}-liquidation cluster sits at ${fmtPx(cluster.price, tick)}, between your entry and liquidation — cascades there can run through your level.`);
    if (type === 'market' && fill.bps > 20) warns.push(`Market order slips ${fill.bps.toFixed(0)} bps on the current book — use a limit.`);
    if (type === 'market' && !isFinite(fill.avg)) warns.push('Visible book is too thin to fill this size.');
    const fundH = (m.fundingHourly ?? 0) * (side === 'buy' ? -1 : 1) * realNotional; // + = you receive
    return { entry, qty, realNotional, margin, fee, isMaker, liq, liqDist, risk, reward, warns, slip: fill.bps, fundH, a };
  }, [usd, price, type, side, lev, stop, tp, postOnly, m.version, step]);

  const connect = async () => {
    try { const priv = keyIn.trim(); const pub = derivePub(priv); const w = { pub, priv }; setBusy(true); const a = await signed(w, 'GET', '/v2/account'); setWallet(w); setAcct(a); setKeyIn(''); setMsg({ ok: true, t: `Connected ${a.blockchain_address ? a.blockchain_address.slice(0, 10) + '…' : a.account_id}` }); if (a.blockchain_address) onAccount(a.blockchain_address); }
    catch (e: any) { setMsg({ ok: false, t: `Connect failed: ${e.message}. Register the public key at app.strikefinance.org/api-keys first.` }); } finally { setBusy(false); }
  };
  const refresh = async () => { if (!wallet) return; try { const [a, o] = await Promise.all([signed(wallet, 'GET', '/v2/account'), signed(wallet, 'GET', `/v2/openOrders?symbol=${sym}`)]); setAcct(a); setOrders(o.orders || []); } catch {} };
  useEffect(() => { refresh(); const t = setInterval(refresh, 10000); return () => clearInterval(t); }, [wallet, sym]);

  const place = async () => {
    if (!wallet) return; setBusy(true); setMsg(null);
    try {
      const dp = (x: number) => Math.max(0, Math.ceil(-Math.log10(x)));
      if (!reduceOnly) await signed(wallet, 'POST', '/v2/leverage', { symbol: sym, leverage: lev });
      const body: any = { symbol: sym, side, type, size: p.qty.toFixed(dp(step)), client_order_id: `lens-${Date.now()}` };
      if (type === 'limit') { body.price = (Math.round(+price / tick) * tick).toFixed(dp(tick)); body.time_in_force = 'GTC'; if (postOnly) body.post_only = true; } else body.slippage = '0.01';
      if (reduceOnly) body.reduce_only = true;
      const r = await signed(wallet, 'POST', '/v2/order', body); let extra = '';
      const exit = side === 'buy' ? 'sell' : 'buy';
      if (+stop) { await signed(wallet, 'POST', '/v2/order', { symbol: sym, side: exit, type: 'stop', size: body.size, stop_price: (+stop).toFixed(dp(tick)), working_type: 'mark_price', reduce_only: true }); extra += ' + stop'; }
      if (+tp) { await signed(wallet, 'POST', '/v2/order', { symbol: sym, side: exit, type: 'take_profit', size: body.size, stop_price: (+tp).toFixed(dp(tick)), working_type: 'mark_price', reduce_only: true }); extra += ' + take-profit'; }
      setMsg({ ok: true, t: `Order sent (${r.ID ?? r.order_id ?? r.id ?? 'ok'})${extra}` }); refresh();
    } catch (e: any) { setMsg({ ok: false, t: `Rejected: ${e.message}` }); } finally { setBusy(false); }
  };
  const cancel = async (o: any) => { if (!wallet) return; try { await signed(wallet, 'DELETE', '/v2/order/cancel', { order_id: o.ID, symbol: o.Symbol }); refresh(); } catch (e: any) { setMsg({ ok: false, t: e.message }); } };
  const genKey = () => { const priv = ed.utils.randomPrivateKey(); setGen({ priv: bytesToHex(priv), pub: bytesToHex(ed.getPublicKey(priv)) }); };

  const base = sym.split('-')[0]?.toLowerCase();
  return (
    <div className="panel ticket" id="ticket">
      <div className="ph"><b>Trade {sym}</b><a href={`${APP}/perpetuals/${base}`} target="_blank">Open on Strike ↗</a></div>
      <div className="seg"><button className={side === 'buy' ? 'on buy' : ''} onClick={() => setSide('buy')}>Long</button><button className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>Short</button></div>
      <div className="seg small"><button className={type === 'limit' ? 'on' : ''} onClick={() => setType('limit')}>Limit</button><button className={type === 'market' ? 'on' : ''} onClick={() => setType('market')}>Market</button></div>
      {type === 'limit' && <label>Price <span className="muted">bid {fmtPx(bestBid, tick)} · ask {fmtPx(bestAsk, tick)}</span><input value={price} onChange={e => setPrice(e.target.value)} placeholder={fmtPx(mid, tick).replace(/,/g, '')} /></label>}
      <label>Size (USD notional)<input value={usd} onChange={e => setUsd(e.target.value)} /></label>
      <label>Leverage <b>{lev}x</b><input type="range" min={1} max={50} value={lev} onChange={e => setLev(+e.target.value)} /></label>
      <div className="two"><label>Stop-loss<input value={stop} onChange={e => setStop(e.target.value)} placeholder={isFinite(p.a) ? fmtPx(side === 'buy' ? mid - 1.5 * p.a : mid + 1.5 * p.a, tick).replace(/,/g, '') : ''} /></label><label>Take-profit<input value={tp} onChange={e => setTp(e.target.value)} /></label></div>
      <div className="checks"><label><input type="checkbox" checked={postOnly} onChange={e => setPostOnly(e.target.checked)} /> Post-only</label><label><input type="checkbox" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} /> Reduce-only</label></div>

      <div className="preview">
        <div><span>Est. entry</span><b>{fmtPx(p.entry, tick)}{type === 'market' && isFinite(p.slip) ? ` (${p.slip.toFixed(1)} bps slip)` : ''}</b></div>
        <div><span>Quantity</span><b>{fmtQty(p.qty)} {info?.baseAsset}</b></div>
        <div><span>Margin used</span><b>{fmtUsd(p.margin, 2)}</b></div>
        <div><span>Fee ({p.isMaker ? 'maker rebate' : 'taker'})</span><b className={p.fee < 0 ? 'up' : ''}>{fmtUsd(p.fee, 3)}</b></div>
        <div><span>Est. liquidation*</span><b className="down">{fmtPx(p.liq, tick)} ({fmtPct(p.liqDist, 1)})</b></div>
        <div><span>Funding / hour</span><b className={p.fundH >= 0 ? 'up' : 'down'}>{p.fundH >= 0 ? 'receive ' : 'pay '}{fmtUsd(Math.abs(p.fundH), 4)}</b></div>
        {isFinite(p.risk) && <div><span>Risk at stop</span><b className="down">{fmtUsd(p.risk, 2)}{acct ? ` (${(p.risk / n(acct.margin_balance) * 100).toFixed(1)}% of equity)` : ''}</b></div>}
        {isFinite(p.risk) && isFinite(p.reward) && <div><span>Reward : risk</span><b>{(p.reward / p.risk).toFixed(2)} R</b></div>}
      </div>
      {p.warns.map((w, i) => <div key={i} className="warnbox">⚠ {w}</div>)}
      <p className="muted small">*Isolated-margin estimate at the 0.5% tier-1 maintenance rate; cross margin uses your whole balance.</p>

      {wallet ? <>
        <button className={`cta ${side}`} disabled={busy || !p.qty} onClick={place}>{busy ? 'Sending…' : `${side === 'buy' ? 'Long' : 'Short'} ${fmtQty(p.qty)} ${info?.baseAsset} on Strike`}</button>
        {acct && <div className="kv small"><span>Equity</span><b>{fmtUsd(n(acct.margin_balance), 2)}</b><span>Available</span><b>{fmtUsd(n(acct.available_balance), 2)}</b></div>}
        {orders.length > 0 && <div className="orders"><b>Open orders</b>{orders.map(o => <div key={o.ID} className="orow"><span className={o.Side === 'buy' ? 'up' : 'down'}>{o.Side} {o.Type}</span><span>{o.Size ?? o.OrigQty} @ {o.Price || o.StopPrice}</span><button className="ghost" onClick={() => cancel(o)}>Cancel</button></div>)}</div>}
        <button className="ghost" onClick={() => { setWallet(null); setAcct(null); setOrders([]); }}>Disconnect API wallet</button>
      </> : <div className="connect">
        <p className="muted small">Trade from here with a Strike <b>API wallet</b>: it can place and cancel orders but <b>cannot withdraw</b>. The key stays in this tab's memory and is never sent anywhere; requests are Ed25519-signed in your browser.</p>
        <ul className="keynote"><li>Create a <b>fresh API wallet just for Strike Zone</b>, and keep only trading margin behind it.</li><li>Any key held in a web page can be read by a malicious browser extension or a site bug. That's why we only accept API wallets, which can't withdraw.</li><li>Closing or reloading the tab forgets the key.</li></ul>
        <input type="password" placeholder="API wallet private key (hex)" value={keyIn} onChange={e => setKeyIn(e.target.value)} />
        <div className="row"><button disabled={!keyIn || busy} onClick={connect}>Connect</button><button className="ghost" onClick={genKey}>Generate key pair</button></div>
        {gen && <div className="gen small"><div>Register this public key at <a href={`${APP}/api-keys`} target="_blank">app.strikefinance.org/api-keys</a>:</div><code>{gen.pub}</code><div>Private key (save it now, then paste above):</div><code>{gen.priv}</code></div>}
      </div>}
      {msg && <div className={msg.ok ? 'okbox' : 'warnbox'}>{msg.t}</div>}
    </div>
  );
}
