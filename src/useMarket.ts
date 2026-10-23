import { useEffect, useRef, useState } from 'react';
import * as A from './api';
import type { Candle, Level, LiqBin, LivePos, Trade } from './api';

export interface HeatCol { t: number; mid: number; bids: Level[]; asks: Level[]; buys: number; sells: number }
export interface MarketState {
  bids: Level[]; asks: Level[]; trades: Trade[]; candles: Candle[]; mark?: number; index?: number; fundingHourly?: number; nextFunding?: number;
  liq: LiqBin[]; live: LivePos[]; oi?: number; oiSeries: number[][]; fundingSeries: number[][]; ls?: { long: number; short: number }; topLs?: { long: number; short: number };
  spreadSeries: number[][]; heat: HeatCol[]; version: number; loading: boolean;
}

const empty = (): MarketState => ({ bids: [], asks: [], trades: [], candles: [], liq: [], live: [], oiSeries: [], fundingSeries: [], spreadSeries: [], heat: [], version: 0, loading: true });

export function useMarket(symbol: string, interval: string) {
  const ref = useRef<MarketState>(empty());
  const book = useRef<{ id: number; bids: Map<number, number>; asks: Map<number, number> }>({ id: 0, bids: new Map(), asks: new Map() });
  const flow = useRef({ buys: 0, sells: 0 });
  const [, force] = useState(0);
  const bump = () => { ref.current.version++; force(v => v + 1); };

  // REST bootstrap + WS streams for this symbol
  useEffect(() => {
    let alive = true; ref.current = empty(); book.current = { id: 0, bids: new Map(), asks: new Map() }; bump();
    const buffered: any[] = [];
    const sorted = () => {
      ref.current.bids = [...book.current.bids.entries()].filter(l => l[1] > 0).sort((a, b) => b[0] - a[0]).slice(0, 400);
      ref.current.asks = [...book.current.asks.entries()].filter(l => l[1] > 0).sort((a, b) => a[0] - b[0]).slice(0, 400);
    };
    const applyDepth = (m: any) => {
      if (m.u <= book.current.id) return; book.current.id = m.u;
      for (const [p, q] of m.b) { const pn = +p, qn = +q; qn === 0 ? book.current.bids.delete(pn) : book.current.bids.set(pn, qn); }
      for (const [p, q] of m.a) { const pn = +p, qn = +q; qn === 0 ? book.current.asks.delete(pn) : book.current.asks.set(pn, qn); }
    };
    const off = A.hub.on(m => {
      if (!alive || (m.s && m.s !== symbol)) return;
      if (m.e === 'depthUpdate') { if (!book.current.id) buffered.push(m); else applyDepth(m); }
      else if (m.e === 'trade') {
        const t: Trade = { id: m.t, price: +m.p, qty: +m.q, time: m.T, buy: !m.m };
        ref.current.trades = [t, ...ref.current.trades].slice(0, 400);
        if (t.buy) flow.current.buys += t.price * t.qty; else flow.current.sells += t.price * t.qty;
      } else if (m.e === 'markPriceUpdate') { ref.current.mark = +m.p; ref.current.index = +m.i; ref.current.fundingHourly = +m.r; ref.current.nextFunding = m.T; }
      else if (m.e === 'kline' && m.k) {
        const k = m.k; if (k.i !== interval) return; const c: Candle = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, takerBuyVol: +(k.V ?? 0) };
        const cs = ref.current.candles; if (cs.length && cs[cs.length - 1].time === c.time) cs[cs.length - 1] = c; else if (!cs.length || c.time > cs[cs.length - 1].time) cs.push(c);
      }
    });
    ['depth', 'trade', 'markprice', `kline_${interval}`].forEach(ch => A.hub.sub(ch, symbol));

    (async () => {
      try {
        const [d, tr, kl, pr, oi] = await Promise.all([A.fetchDepth(symbol, 1000), A.fetchTrades(symbol, 300), A.fetchKlines(symbol, interval, 500), A.fetchPremium(symbol), A.fetchOI(symbol)]);
        if (!alive) return;
        book.current = { id: d.lastUpdateId, bids: new Map(d.bids), asks: new Map(d.asks) }; buffered.forEach(applyDepth); sorted();
        Object.assign(ref.current, { trades: tr, candles: kl, mark: pr.markPrice, index: pr.indexPrice, fundingHourly: pr.fundingRate, nextFunding: pr.nextFundingTime, oi, loading: false });
        bump();
      } catch (e) { console.error(e); ref.current.loading = false; bump(); }
    })();

    // UI tick: rebuild sorted book + record heatmap column every second
    const tick = setInterval(() => {
      if (!book.current.id) return; sorted(); const s = ref.current;
      const mid = s.bids[0] && s.asks[0] ? (s.bids[0][0] + s.asks[0][0]) / 2 : 0;
      if (mid) { s.heat.push({ t: Date.now(), mid, bids: s.bids.slice(0, 200), asks: s.asks.slice(0, 200), buys: flow.current.buys, sells: flow.current.sells }); if (s.heat.length > 600) s.heat.shift(); }
      flow.current = { buys: 0, sells: 0 }; bump();
    }, 1000);

    // Slow stats (liquidation map, whale positions, OI/LS/spread/funding history)
    const slow = async () => {
      const r = await Promise.allSettled([A.fetchLiqMap(symbol), A.fetchLivePositions(symbol), A.fetchOIHistory(symbol, '1h'), A.fetchLSHistory(symbol, '1h'), A.fetchTopLSHistory(symbol, '1h'), A.fetchSpreadHistory(symbol, '1h'), A.fetchFundingHistory(symbol, 7), A.fetchOI(symbol)]);
      if (!alive) return; const s = ref.current; const v = <T,>(i: number): T | undefined => (r[i].status === 'fulfilled' ? (r[i] as any).value : undefined);
      s.liq = v<LiqBin[]>(0) || []; s.live = v<LivePos[]>(1) || [];
      const oi = v<any>(2); if (oi) s.oiSeries = oi.data.map((d: number[]) => [d[0], d[1]]);
      const lastOf = (x: any) => { if (!x?.data?.length) return undefined; const c = x.columns; const d = x.data[x.data.length - 1]; return { long: d[c.indexOf('long_percent')], short: d[c.indexOf('short_percent')] }; };
      s.ls = lastOf(v(3)); s.topLs = lastOf(v(4));
      const sp = v<any>(5); if (sp) s.spreadSeries = sp.data;
      const fh = v<any>(6); if (fh) s.fundingSeries = fh.data;
      const o = v<number>(7); if (o !== undefined) s.oi = o;
      bump();
    };
    slow(); const slowT = setInterval(slow, 60_000);

    return () => { alive = false; off(); clearInterval(tick); clearInterval(slowT); ['depth', 'trade', 'markprice', `kline_${interval}`].forEach(ch => A.hub.unsub(ch, symbol)); };
  }, [symbol, interval]);

  return ref.current;
}
