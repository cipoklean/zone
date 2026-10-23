import { useEffect, useMemo, useState } from 'react';
import * as A from './api';
import { fmtPct, fmtPx, fmtUsd } from './api';
import { useMarket } from './useMarket';
import Chart, { Overlay } from './components/Chart';
import Heatmap from './components/Heatmap';
import { OrderBook, Tape } from './components/Book';
import { Brief, Derivs, FundingArb, useFundingTable } from './components/Intel';
import Wallet, { WalletPos } from './components/Wallet';
import Discover from './components/Discover';
import Ticket from './components/Ticket';

const qs = new URLSearchParams(location.search);
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function App() {
  const [symbols, setSymbols] = useState<A.SymbolInfo[]>([]);
  const [tickers, setTickers] = useState<Record<string, A.Ticker>>({});
  const [symbol, setSymbol] = useState(qs.get('s') || 'BTC-USD');
  const [interval, setIntervalV] = useState(qs.get('i') || '15m');
  const [addr, setAddr] = useState(qs.get('addr') || '');
  const [wpos, setWpos] = useState<WalletPos[]>([]);
  const [range, setRange] = useState(0.6);
  const [whales, setWhales] = useState(true); const [profile, setProfile] = useState(true);
  const [pick, setPick] = useState<number>(); const [summary, setSummary] = useState<any>(null); const [status, setStatus] = useState(A.hub.status); const [q, setQ] = useState('');
  const m = useMarket(symbol, interval); const funding = useFundingTable();

  useEffect(() => {
    A.fetchExchangeInfo().then(setSymbols); A.fetchSummary().then(setSummary).catch(() => {});
    A.fetchTickers().then(ts => setTickers(Object.fromEntries(ts.map(t => [t.symbol, t]))));
    A.hub.statusCb.add(setStatus as any); A.hub.connect(); A.hub.sub('!miniticker@arr');
    const off = A.hub.on(msg => { if (msg.e === '24hrMiniTicker') setTickers(prev => { const o = prev[msg.s] || ({} as A.Ticker); const last = +msg.c, open = +msg.o; return { ...prev, [msg.s]: { ...o, symbol: msg.s, lastPrice: last, priceChangePercent: (last / open - 1) * 100, highPrice: +msg.h, lowPrice: +msg.l, volume: +msg.v, quoteVolume: +msg.q } }; }); });
    return () => { off(); };
  }, []);
  useEffect(() => { const p = new URLSearchParams({ s: symbol, i: interval, ...(addr ? { addr } : {}) }); history.replaceState(null, '', '?' + p); document.title = `${symbol} ${fmtPx(m.mark ?? NaN, info?.tickSize)} · Strike Lens`; }, [symbol, interval, addr, Math.floor(m.version / 5)]);

  const info = symbols.find(s => s.symbol === symbol); const tick = info?.tickSize || 0.01; const t = tickers[symbol];
  const marks = useMemo(() => Object.fromEntries(Object.values(tickers).map(t => [t.symbol, t.lastPrice])), [tickers]);
  const overlays: Overlay[] = wpos.filter(p => p.symbol === symbol).flatMap(p => [{ price: p.entry, label: `Your ${p.size > 0 ? 'long' : 'short'} entry`, color: '#f5c542' }, ...(p.liq > 0 ? [{ price: p.liq, label: 'Your liquidation', color: '#ef4444', style: 'dash' as const }] : [])]);
  const venues = funding.find(f => f.symbol === symbol)?.venues;
  const list = Object.values(tickers).filter(x => symbols.some(s => s.symbol === x.symbol) && x.symbol.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
  const pickWallet = (a: string) => { setAddr(a); document.getElementById('wallet')?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="app">
      <header>
        <div className="brand"><svg width="26" height="26" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#f5c542" strokeWidth="2.5" /><path d="M17 7l-6 10h5l-1 8 6-10h-5z" fill="#f5c542" /></svg><div><b>Strike Lens</b><span>order flow · liquidity · risk for Strike perps</span></div></div>
        {summary && <div className="stats"><span>Users <b>{(+summary.total_users).toLocaleString()}</b></span><span>All-time volume <b>{fmtUsd(+summary.total_volume_usd)}</b></span><span>Liquidated <b>{fmtUsd(+summary.total_liquidated_usd)}</b></span><span>Revenue <b>{fmtUsd(+summary.total_revenue_usd)}</b></span></div>}
        <span className={`live ${status}`}>{status === 'live' ? '● live' : status === 'connecting' ? '○ connecting' : '○ reconnecting'}</span>
      </header>

      <div className="strip">{list.slice(0, 40).map(x => <button key={x.symbol} className={x.symbol === symbol ? 'on' : ''} onClick={() => setSymbol(x.symbol)}><b>{x.symbol.replace('-USD', '')}</b><span className={x.priceChangePercent >= 0 ? 'up' : 'down'}>{fmtPct(x.priceChangePercent, 1)}</span></button>)}</div>

      <section className="hero">
        <div className="mkt">
          <select value={symbol} onChange={e => setSymbol(e.target.value)}>{symbols.map(s => <option key={s.symbol}>{s.symbol}</option>)}</select>
          <input className="search" placeholder="filter markets" value={q} onChange={e => setQ(e.target.value)} />
          <b className="px">{fmtPx(t?.lastPrice ?? m.mark ?? NaN, tick)}</b><span className={(t?.priceChangePercent ?? 0) >= 0 ? 'up' : 'down'}>{fmtPct(t?.priceChangePercent ?? NaN)}</span>
          <span className="muted">24h H {fmtPx(t?.highPrice ?? NaN, tick)} · L {fmtPx(t?.lowPrice ?? NaN, tick)} · Vol {fmtUsd(t?.quoteVolume ?? NaN)}</span>
          <div className="iv">{INTERVALS.map(i => <button key={i} className={i === interval ? 'on' : ''} onClick={() => setIntervalV(i)}>{i}</button>)}</div>
          <label className="tog"><input type="checkbox" checked={profile} onChange={e => setProfile(e.target.checked)} /> Liquidity & liquidation profile</label>
          <label className="tog"><input type="checkbox" checked={whales} onChange={e => setWhales(e.target.checked)} /> Whale liq. lines</label>
        </div>
        <div className="grid-main">
          <div className="panel chartp"><Chart m={m} overlays={overlays} showWhales={whales} showProfile={profile} /><div className="legend"><span><i style={{ background: '#22c55e' }} />bids</span><span><i style={{ background: '#ef4444' }} />asks</span><span><i style={{ background: '#f97316' }} />long liquidations</span><span><i style={{ background: '#38bdf8' }} />short liquidations</span><span><i style={{ background: '#f5c542' }} />your position</span></div></div>
          <OrderBook m={m} tick={tick} onPick={setPick} />
          <Ticket m={m} info={info} pickPrice={pick} onAccount={pickWallet} />
        </div>
      </section>

      <section className="grid-2">
        <div className="panel heatp"><div className="ph"><b>Order-flow heatmap</b><span className="muted">each column = 1s of Strike's live book · bubbles = taker trades</span><select value={range} onChange={e => setRange(+e.target.value)}>{[0.2, 0.4, 0.6, 1, 2, 4].map(r => <option key={r} value={r}>±{r}%</option>)}</select></div><Heatmap m={m} tick={tick} rangePct={range} /></div>
        <Tape m={m} tick={tick} />
      </section>

      <section className="grid-2b">
        <Brief m={m} symbol={symbol} tick={tick} change24h={t?.priceChangePercent} venues={venues} />
        <Derivs m={m} tick={tick} />
      </section>

      <section id="wallet"><Wallet addr={addr} setAddr={setAddr} marks={marks} onPositions={setWpos} onPick={setSymbol} /></section>
      <section><Discover onWallet={pickWallet} symbol={symbol} mark={m.mark} /></section>
      <section><FundingArb rows={funding} onPick={s => { setSymbol(s); scrollTo({ top: 0, behavior: 'smooth' }); }} /></section>

      <footer>Built on Strike Finance's public market, stats, vault and copy-trading APIs, plus signed API-wallet trading. Data from api.strikefinance.org. Not financial advice. <a href="https://github.com/cipoklean/strike-lens" target="_blank">Source</a></footer>
    </div>
  );
}
