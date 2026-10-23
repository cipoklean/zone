import { useEffect, useState } from 'react';
import * as A from './api';
import { pressure } from './insights';

// Lightweight pressure score for the most active markets (depth + trades + premium + liquidation map), refreshed every 60s.
export function usePressureScan(symbols: string[]) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const key = symbols.join(',');
  useEffect(() => {
    if (!symbols.length) return; let alive = true;
    const run = async () => {
      for (const s of symbols) {
        if (!alive) return;
        try {
          const [d, tr, pr, liq] = await Promise.all([A.fetchDepth(s, 100), A.fetchTrades(s, 100), A.fetchPremium(s), A.fetchLiqMap(s).catch(() => [])]);
          const mid = d.bids[0] && d.asks[0] ? (d.bids[0][0] + d.asks[0][0]) / 2 : 0;
          const p = pressure({ mid, bids: d.bids, asks: d.asks, trades: tr, liq, fundingHourly: pr.fundingRate });
          if (alive && isFinite(p.score)) setScores(o => ({ ...o, [s]: p.score }));
        } catch {}
      }
    };
    run(); const t = setInterval(run, 60_000); return () => { alive = false; clearInterval(t); };
  }, [key]);
  return scores;
}
