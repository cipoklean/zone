import { useEffect, useState } from 'react';

// Track record: we measure the pressure score instead of just asserting it.
// backtest.json = flow + funding components on Strike's candle/funding history (tools/backtest.ts)
// live.json     = full score logged live every minute for the 12 most active markets (tools/recorder.ts), scored 15 min later
export default function Track() {
  const [bt, setBt] = useState<any>(null); const [lv, setLv] = useState<any>(null);
  useEffect(() => { fetch('./track/backtest.json').then(r => r.json()).then(setBt).catch(() => {}); fetch('./track/live.json').then(r => r.json()).then(setLv).catch(() => {}); }, []);
  const b = bt?.buckets?.find((x: any) => x.threshold === 20); const pct = (v: number) => isFinite(v) ? `${v.toFixed(1)}%` : '—';
  return (
    <div className="panel track">
      <div className="ph"><b>Does the pressure score work?</b><span className="muted">we measure it instead of asking you to trust it</span></div>
      <p>Pressure tells you <b>who is leaning right now</b>: resting book, taker flow, nearby liquidations and funding. It is a read of positioning, not a price forecast, and here is why we say that.</p>
      <div className="trackgrid">
        <div className="tcard"><small>Backtest · flow + funding parts</small>
          {b ? <><b>{pct(b.long.hit)} / {pct(b.short.hit)}</b><span>right on the next hour when the score leaned long / short, across {bt.samples.toLocaleString()} samples on {bt.markets.length} markets. Base rate: price rose {pct(bt.baselineUpPct)} of the time.</span><em>Verdict: no edge alone. These parts describe the crowd; they don't call direction.</em></> : <span className="muted">loading…</span>}</div>
        <div className="tcard"><small>Live log · full score</small>
          {lv ? <><b>{pct(lv.strong.hit)}</b><span>of {lv.strong.n} strong calls (|score| ≥ {lv.threshold}) had price moving their way 15 min later, vs {pct(lv.baseline)} for a random direction. {lv.calls.toLocaleString()} calls logged {lv.span}.</span><em>{lv.strong.n < 100 ? 'Small sample: treat as a running tally, not proof.' : 'Running tally, updated as the log grows.'}</em></> : <span className="muted">Book and liquidation parts have no public history on Strike, so we log them live.</span>}</div>
      </div>
      <p className="muted small">Method and code: tools/backtest.ts and tools/recorder.ts in the repo. Use the score to see where the crowd is leaning and where forced orders sit, then let the Trader brief's levels and stops do the work.</p>
    </div>
  );
}
