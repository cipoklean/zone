import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, IPriceLine, LineStyle, CrosshairMode } from 'lightweight-charts';
import type { MarketState } from '../useMarket';
import { fmtUsd } from '../api';

export interface Overlay { price: number; label: string; color: string; style?: 'solid' | 'dash' }

// Candles + liquidation-map profile + resting-liquidity profile, aligned to the price axis.
export default function Chart({ m, overlays, showWhales, showProfile }: { m: MarketState; overlays: Overlay[]; showWhales: boolean; showProfile: boolean }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const chart = useRef<IChartApi>(), candles = useRef<ISeriesApi<'Candlestick'>>(), vol = useRef<ISeriesApi<'Histogram'>>();
  const lines = useRef<IPriceLine[]>([]); const lastLen = useRef(0); const firstTime = useRef(0);
  const mref = useRef(m); mref.current = m; const showRef = useRef(showProfile); showRef.current = showProfile;

  useEffect(() => {
    const c = createChart(box.current!, { autoSize: true, layout: { background: { color: 'transparent' }, textColor: '#8b98a9', fontFamily: 'Inter, system-ui' }, grid: { vertLines: { color: '#141b24' }, horzLines: { color: '#141b24' } }, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: '#1e2733' }, timeScale: { borderColor: '#1e2733', timeVisible: true } });
    candles.current = c.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false });
    vol.current = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    const redraw = () => draw(); c.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    const ro = new ResizeObserver(redraw); ro.observe(box.current!);
    let raf = 0; const loop = () => { draw(); raf = window.setTimeout(loop, 1000) as any; }; loop();
    return () => { clearTimeout(raf); ro.disconnect(); c.remove(); };
  }, []);

  // data
  useEffect(() => {
    if (!candles.current) return; const cs = m.candles;
    if (!cs.length) { candles.current.setData([]); vol.current!.setData([]); lastLen.current = 0; return; }
    if (cs.length !== lastLen.current || firstTime.current !== cs[0].time) {
      candles.current.setData(cs.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
      vol.current!.setData(cs.map(c => ({ time: c.time as any, value: c.volume, color: c.close >= c.open ? '#22c55e44' : '#ef444444' })));
      lastLen.current = cs.length; firstTime.current = cs[0].time;
    } else { const c = cs[cs.length - 1]; candles.current.update({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close }); vol.current!.update({ time: c.time as any, value: c.volume, color: c.close >= c.open ? '#22c55e44' : '#ef444444' }); }
  }, [m.version]);

  // price lines (whales + user overlays)
  const key = JSON.stringify(overlays) + showWhales + m.live.length;
  useEffect(() => {
    const s = candles.current; if (!s) return; lines.current.forEach(l => s.removePriceLine(l)); lines.current = [];
    const add = (o: Overlay) => lines.current.push(s.createPriceLine({ price: o.price, color: o.color, lineWidth: 1, lineStyle: o.style === 'dash' ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: o.label }));
    overlays.forEach(add);
    if (showWhales) {
      const mid = m.mark || 0;
      [...m.live].filter(p => p.liq > 0 && isFinite(p.liq)).sort((a, b) => Math.abs(b.size * b.mark) - Math.abs(a.size * a.mark)).slice(0, 12)
        .forEach(p => add({ price: p.liq, label: `${p.size > 0 ? 'L' : 'S'} liq ${fmtUsd(Math.abs(p.size * (p.mark || mid)))}`, color: p.size > 0 ? '#f97316aa' : '#38bdf8aa', style: 'dash' }));
    }
  }, [key]);

  function draw() {
    const c = cv.current, b = box.current, s = candles.current; if (!c || !b || !s) return;
    const W = b.clientWidth, H = b.clientHeight, dpr = devicePixelRatio || 1; c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); if (!showRef.current) return;
    const st = mref.current; const axisW = chart.current!.priceScale('right').width(); const right = W - axisW; const maxW = Math.min(160, right * 0.28);
    // liquidation profile (long liqs below price = orange, short liqs above = blue)
    const liq = st.liq; if (liq.length > 1) {
      const step = Math.abs(liq[1].price - liq[0].price); const mx = Math.max(...liq.map(x => Math.max(x.long, x.short)), 1e-9);
      for (const bin of liq) {
        const y1 = s.priceToCoordinate(bin.price + step / 2), y2 = s.priceToCoordinate(bin.price - step / 2); if (y1 === null || y2 === null) continue;
        const h = Math.max(1, Math.abs(y2 - y1) - 0.5), y = Math.min(y1, y2);
        if (bin.long > 0) { const w = bin.long / mx * maxW; g.fillStyle = 'rgba(249,115,22,0.55)'; g.fillRect(right - w, y, w, h); }
        if (bin.short > 0) { const w = bin.short / mx * maxW; g.fillStyle = 'rgba(56,189,248,0.55)'; g.fillRect(right - w, y, w, h); }
      }
    }
    // resting liquidity profile from the live book (left edge)
    const lv = [...st.bids.slice(0, 150), ...st.asks.slice(0, 150)]; if (lv.length) {
      const mx = Math.max(...lv.map(l => l[0] * l[1])); const bw = Math.min(110, right * 0.18);
      for (const [p, q] of lv) { const y = s.priceToCoordinate(p); if (y === null) continue; const w = (p * q) / mx * bw; g.fillStyle = st.bids.length && p <= st.bids[0][0] ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'; g.fillRect(0, y - 1, w, 2); }
    }
    g.fillStyle = '#8b98a9'; g.font = '10px Inter, system-ui'; g.fillText('◀ resting book', 4, 12); const t = 'liquidation map ▶'; g.fillText(t, right - g.measureText(t).width - 4, 12);
  }

  return <div className="chartwrap"><div ref={box} className="chartbox" /><canvas ref={cv} className="overlay" /></div>;
}
