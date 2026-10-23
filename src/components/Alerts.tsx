import { useState } from 'react';
import { AlertEvent, AlertSettings, saveAlertSettings } from '../alerts';

// Alert settings + log. Browser notifications work with the tab open; the webhook feeds external bots (Telegram/Discord).
export default function Alerts({ s, setS, log, onTest }: { s: AlertSettings; setS: (s: AlertSettings) => void; log: AlertEvent[]; onTest: () => void }) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const up = (p: Partial<AlertSettings>) => { const n = { ...s, ...p }; setS(n); saveAlertSettings(n); };
  const ask = async () => { if (typeof Notification === 'undefined') return; const r = await Notification.requestPermission(); setPerm(r); if (r === 'granted') up({ notify: true }); };
  return (
    <div className="panel alerts">
      <div className="ph"><b>Alerts</b><span className="muted">checked every 5s on the selected market · 10-min cooldown per alert</span>
        <label className="tog"><input type="checkbox" checked={s.enabled} onChange={e => up({ enabled: e.target.checked })} /> On</label></div>
      <div className="arow">
        <label>Liq. cluster within <input value={s.clusterPct} onChange={e => up({ clusterPct: +e.target.value || 0 })} />%</label>
        <label>Whale within <input value={s.whalePct} onChange={e => up({ whalePct: +e.target.value || 0 })} />% of liq.</label>
        <label>Min size $<input value={s.minClusterUsd} onChange={e => up({ minClusterUsd: +e.target.value || 0 })} /></label>
        <label>Pressure beyond ±<input value={s.pressure} onChange={e => up({ pressure: +e.target.value || 0 })} /></label>
        <label className="tog"><input type="checkbox" checked={s.funding} onChange={e => up({ funding: e.target.checked })} /> Funding flips</label>
      </div>
      <div className="arow">
        {perm === 'granted' ? <label className="tog"><input type="checkbox" checked={s.notify} onChange={e => up({ notify: e.target.checked })} /> Browser notifications</label> : <button onClick={ask}>Enable browser notifications</button>}
        <label className="grow">Webhook (Telegram / Discord bot) <input placeholder="https://your-bot.example.com/strike-zone" value={s.webhook} onChange={e => up({ webhook: e.target.value.trim() })} /></label>
        <button className="ghost" onClick={onTest}>Send test alert</button>
      </div>
      <div className="alog">{log.length ? log.slice(0, 30).map(a => <div key={a.id} className={`aitem ${a.kind}`}><span className="muted">{new Date(a.time).toLocaleTimeString()}</span><b>{a.title}</b><p>{a.message}</p></div>) : <p className="muted small">No alerts yet. They'll show here and, if enabled, as notifications and webhook posts.</p>}</div>
    </div>
  );
}
