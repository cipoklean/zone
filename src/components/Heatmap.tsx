import { useEffect, useRef } from 'react';
import type { MarketState } from '../useMarket';
import { fmtPx, fmtUsd } from '../api';

// Bookmap-style order-flow heatmap: every column is one second of Strike's live order book.
// Brightness = resting USD at that price; the line is mid price; bubbles are aggressive trades.
export default function Heatmap({ m, tick, rangePct }: { m: MarketState; tick: number; rangePct: number }) {
  const cv = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = cv.current, w = wrap.current; if (!c || !w) return;
    const W = w.clientWidth, H = w.clientHeight, dpr = devicePixelRatio || 1; c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
    const cols = m.heat; if (!cols.length) { g.fillStyle = '#5b6878'; g.font = '12px Inter'; g.fillText('Recording live order book… (1 column per second)', 12, 20); return; }
    const axis = 70, plotW = W - axis; const last = cols[cols.length - 1]; const center = last.mid; const lo = center * (1 - rangePct / 100), hi = center * (1 + rangePct / 100);
    const yOf = (p: number) => H - (p - lo) / (hi - lo) * H; const colW = Math.max(2, plotW / Math.min(cols.length, 300)); const shown = cols.slice(-Math.floor(plotW / colW));
    // scale by 95th percentile of level notional so one wall doesn't wash everything out
    const vals: number[] = []; shown.forEach(col => { for (const [p, q] of col.bids) if (p >= lo) vals.push(p * q); for (const [p, q] of col.asks) if (p <= hi) vals.push(p * q); });
    vals.sort((a, b) => a - b); const ref = vals[Math.floor(vals.length * 0.95)] || 1; const rowH = Math.max(1.5, (tick / (hi - lo)) * H);
    shown.forEach((col, i) => {
      const x = i * colW;
      for (const [p, q] of col.bids) { if (p < lo || p > hi) continue; const a = Math.min(1, (p * q) / ref); g.fillStyle = `rgba(${Math.round(30 + 225 * a)},${Math.round(120 + 120 * a)},${Math.round(80 * a)},${0.15 + 0.85 * a})`; g.fillRect(x, yOf(p) - rowH / 2, colW + 0.5, rowH); }
      for (const [p, q] of col.asks) { if (p < lo || p > hi) continue; const a = Math.min(1, (p * q) / ref); g.fillStyle = `rgba(${Math.round(120 + 135 * a)},${Math.round(40 + 160 * a)},${Math.round(60 * a)},${0.15 + 0.85 * a})`; g.fillRect(x, yOf(p) - rowH / 2, colW + 0.5, rowH); }
    });
    // mid line
    g.strokeStyle = '#f5c542'; g.lineWidth = 1.5; g.beginPath(); shown.forEach((col, i) => { const x = i * colW + colW / 2, y = yOf(col.mid); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    // trade bubbles from the trade stream, bucketed into columns
    const t0 = shown[0].t - 1000; for (const t of m.trades) { if (t.time < t0) continue; const idx = Math.min(shown.length - 1, Math.floor((t.time - t0) / 1000)); const x = idx * colW + colW / 2, y = yOf(t.price); const r = Math.min(14, 2 + Math.sqrt(t.price * t.qty) / 12); g.fillStyle = t.buy ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    // axis
    g.fillStyle = '#0b1017'; g.fillRect(plotW, 0, axis, H); g.fillStyle = '#8b98a9'; g.font = '10px Inter';
    for (let k = 0; k <= 8; k++) { const p = lo + (hi - lo) * k / 8; const y = yOf(p); g.fillText(fmtPx(p, tick), plotW + 4, Math.min(H - 2, Math.max(10, y + 3))); g.fillStyle = '#ffffff10'; g.fillRect(0, y, plotW, 1); g.fillStyle = '#8b98a9'; }
    g.fillStyle = '#f5c542'; g.fillText(fmtPx(last.mid, tick), plotW + 4, yOf(last.mid) + 3);
    // hover readout
    const h = hover.current; if (h && h.x < plotW) { const i = Math.floor(h.x / colW); const col = shown[i]; if (col) { const p = lo + (H - h.y) / H * (hi - lo); const near = [...col.bids, ...col.asks].reduce((b, l) => (Math.abs(l[0] - p) < Math.abs(b[0] - p) ? l : b), [0, 0] as [number, number]); const txt = `${new Date(col.t).toLocaleTimeString()} · ${fmtPx(near[0], tick)} · ${fmtUsd(near[0] * near[1])} resting`; g.fillStyle = '#000c'; g.fillRect(h.x + 8, h.y - 18, g.measureText(txt).width + 10, 16); g.fillStyle = '#fff'; g.fillText(txt, h.x + 13, h.y - 7); g.strokeStyle = '#ffffff40'; g.beginPath(); g.moveTo(0, h.y); g.lineTo(plotW, h.y); g.stroke(); } }
  }, [m.version, rangePct]);

  return <div ref={wrap} className="heat" onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); hover.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }} onMouseLeave={() => (hover.current = null)}><canvas ref={cv} /></div>;
}
