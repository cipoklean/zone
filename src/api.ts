// Strike Finance public API client (mainnet). All endpoints below are public and CORS-enabled.
export const API = 'https://api.strikefinance.org';
export const WS_PRICE = 'wss://api.strikefinance.org/ws/price';
export const APP = 'https://app.strikefinance.org';

async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export const n = (x: any) => (x === null || x === undefined || x === '' ? NaN : Number(x));

export type Level = [number, number];
export interface SymbolInfo { symbol: string; baseAsset: string; tickSize: number; stepSize: number; minQty: number; minNotional: number; maxQty: number; liquidationFee: number }
export interface Ticker { symbol: string; lastPrice: number; priceChangePercent: number; highPrice: number; lowPrice: number; quoteVolume: number; volume: number }
export interface Premium { markPrice: number; indexPrice: number; fundingRate: number; nextFundingTime: number; latestPremiumIndex: number; interestRate: number }
export interface Trade { id: number; price: number; qty: number; time: number; buy: boolean }
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; takerBuyVol: number }
export interface LiqBin { price: number; long: number; short: number }
export interface LivePos { symbol: string; size: number; entry: number; mark: number; liq: number; leverage: number; address: string; margin: number; funding: number }
export interface FundingRow { symbol: string; venues: Record<string, number> }

export const fetchExchangeInfo = async (): Promise<SymbolInfo[]> => {
  const d = await get('/price/v2/exchangeInfo');
  return d.symbols.filter((s: any) => s.status === 'trading').map((s: any) => {
    const f = (t: string) => s.filters.find((x: any) => x.filterType === t) || {};
    return { symbol: s.symbol, baseAsset: s.baseAsset, tickSize: n(f('PRICE_FILTER').tickSize), stepSize: n(f('LOT_SIZE').stepSize), minQty: n(f('LOT_SIZE').minQty), maxQty: n(f('LOT_SIZE').maxQty), minNotional: n(f('MIN_NOTIONAL').notional), liquidationFee: n(s.liquidationFee) };
  });
};

export const fetchTickers = async (): Promise<Ticker[]> => (await get<any[]>('/price/v2/ticker/24hr')).map(t => ({ symbol: t.symbol, lastPrice: n(t.lastPrice), priceChangePercent: n(t.priceChangePercent), highPrice: n(t.highPrice), lowPrice: n(t.lowPrice), quoteVolume: n(t.quoteVolume), volume: n(t.volume) }));

export const fetchDepth = async (symbol: string, limit = 500) => {
  const d = await get(`/price/v2/depth?symbol=${symbol}&limit=${limit}`);
  return { lastUpdateId: d.lastUpdateId as number, bids: d.bids.map((l: any) => [n(l[0]), n(l[1])]) as Level[], asks: d.asks.map((l: any) => [n(l[0]), n(l[1])]) as Level[] };
};

export const fetchTrades = async (symbol: string, limit = 200): Promise<Trade[]> => (await get<any[]>(`/price/v2/trades?symbol=${symbol}&limit=${limit}`)).map(t => ({ id: t.id, price: n(t.price), qty: n(t.qty), time: t.time, buy: !t.isBuyerMaker }));

export const fetchKlines = async (symbol: string, interval: string, limit = 500): Promise<Candle[]> => (await get<any[]>(`/price/v2/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(k => ({ time: Math.floor(k[0] / 1000), open: n(k[1]), high: n(k[2]), low: n(k[3]), close: n(k[4]), volume: n(k[5]), takerBuyVol: n(k[9]) }));

export const fetchPremium = async (symbol: string): Promise<Premium> => {
  const d = await get(`/price/v2/premiumIndex?symbol=${symbol}`);
  return { markPrice: n(d.markPrice), indexPrice: n(d.indexPrice), fundingRate: n(d.fundingRate), nextFundingTime: d.nextFundingTime, latestPremiumIndex: n(d.latestPremiumIndex), interestRate: n(d.interestRate) };
};

export const fetchOI = async (symbol: string) => n((await get(`/price/v2/openInterest?symbol=${symbol}`)).openInterest);

export const fetchLiqMap = async (symbol: string): Promise<LiqBin[]> => {
  const d = await get(`/stat/v1/stats/coin/liquidation-map?symbol=${symbol}`);
  const c = d.columns as string[]; const i = (k: string) => c.indexOf(k);
  return (d.data || []).map((r: number[]) => ({ price: r[i('price')], long: r[i('long_base')], short: r[i('short_base')] }));
};

export const fetchLivePositions = async (symbol?: string): Promise<LivePos[]> => {
  const d = await get(`/stat/v1/stats/live-positions${symbol ? `?symbol=${symbol}` : ''}`);
  return (d.positions || []).map((p: any) => ({ symbol: p.symbol, size: n(p.size), entry: n(p.entry_price), mark: n(p.mark_price), liq: n(p.liquidation_price), leverage: p.leverage, address: p.blockchain_address, margin: n(p.margin), funding: n(p.accumulated_funding_fees) }));
};

export const fetchFundingComparison = async (): Promise<FundingRow[]> => {
  const d = await get('/stat/v1/stats/coin/funding-rate-comparison');
  return (d.data || []).map((r: any) => {
    const venues: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) if (k !== 'symbol' && v && typeof v === 'object') venues[k] = n((v as any).rate);
    return { symbol: r.symbol, venues };
  });
};

const series = async (path: string) => { const d = await get(path); return { columns: d.columns as string[], data: (d.data || []) as number[][] }; };
export const fetchFundingHistory = (s: string, days = 7) => series(`/stat/v1/stats/coin/history/funding?symbol=${s}&days=${days}`);
export const fetchOIHistory = (s: string, interval = '1h') => series(`/stat/v1/stats/coin/history/open-interest?symbol=${s}&interval=${interval}`);
export const fetchLSHistory = (s: string, interval = '1h') => series(`/stat/v1/stats/coin/history/long-short-ratio?symbol=${s}&interval=${interval}`);
export const fetchTopLSHistory = (s: string, interval = '1h') => series(`/stat/v1/stats/coin/history/top-trader-long-short-ratio?symbol=${s}&interval=${interval}`);
export const fetchSpreadHistory = (s: string, interval = '1h') => series(`/stat/v1/stats/coin/history/spread?symbol=${s}&interval=${interval}`);
export const fetchBasisHistory = (s: string, interval = '1h') => series(`/stat/v1/stats/coin/history/basis?symbol=${s}&interval=${interval}`);

export const fetchSummary = () => get('/stat/v1/dashboard/summary');
export const fetchDaily = (symbol = 'ALL') => get(`/stat/v1/stats/daily?symbol=${symbol}`);
export const fetchLeaderboard = (range = '7d', sort = 'total_pnl', limit = 25) => get(`/stat/v1/stats/leaderboard?time_range=${range}&sort_by=${sort}&sort_dir=desc&limit=${limit}&platform=strike`);
export const fetchVaults = () => get('/v2/vaults?status=active');
export const fetchCopyTraders = (platform = 'strike', limit = 20) => get(`/v2/copy/discover?platform=${platform}&sort=copy_score&order=desc&limit=${limit}`);

// Wallet lens — Strike exposes read-only account views by blockchain address.
export const fetchAccount = (addr: string) => get(`/v2/account?blockchain_address=${encodeURIComponent(addr)}`);
export const fetchPositions = (addr: string) => get(`/v2/positions?blockchain_address=${encodeURIComponent(addr)}`);
export const fetchPortfolio = (addr: string) => get(`/v2/portfolio?blockchain_address=${encodeURIComponent(addr)}`);
export const fetchOpenOrders = (addr: string) => get(`/v2/openOrders?blockchain_address=${encodeURIComponent(addr)}`);
export const fetchClosed = (addr: string) => get(`/v2/closedPositions?blockchain_address=${encodeURIComponent(addr)}&limit=20`);

// ---------- WebSocket hub (one socket, many subscriptions) ----------
type Handler = (msg: any) => void;
class Hub {
  ws?: WebSocket; subs = new Map<string, { channel: string; symbol?: string }>(); handlers = new Set<Handler>(); id = 1; status: 'connecting' | 'live' | 'down' = 'connecting'; statusCb = new Set<(s: string) => void>(); retry = 0;
  connect() {
    this.setStatus('connecting');
    const ws = new WebSocket(WS_PRICE); this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.setStatus('live'); this.subs.forEach(s => this.send({ method: 'subscribe', ...s, id: this.id++ })); };
    ws.onmessage = ev => {
      // Frames can carry several newline-delimited JSON messages; array frames carry all-symbol streams.
      for (const line of String(ev.data).split('\n')) {
        if (!line.trim()) continue; let m: any; try { m = JSON.parse(line); } catch { continue; }
        const list = Array.isArray(m) ? m : [m]; for (const x of list) this.handlers.forEach(h => h(x));
      }
    };
    ws.onclose = () => { this.setStatus('down'); setTimeout(() => this.connect(), Math.min(10000, 1000 * 2 ** this.retry++)); };
    ws.onerror = () => ws.close();
    setInterval(() => this.send({ method: 'ping', id: 0 }), 30000);
  }
  setStatus(s: any) { this.status = s; this.statusCb.forEach(c => c(s)); }
  send(o: any) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  sub(channel: string, symbol?: string) { const k = channel + '|' + (symbol || ''); if (!this.subs.has(k)) { this.subs.set(k, { channel, symbol }); this.send({ method: 'subscribe', channel, symbol, id: this.id++ }); } }
  unsub(channel: string, symbol?: string) { const k = channel + '|' + (symbol || ''); if (this.subs.delete(k)) this.send({ method: 'unsubscribe', channel, symbol, id: this.id++ }); }
  on(h: Handler) { this.handlers.add(h); return () => { this.handlers.delete(h); }; }
}
export const hub = new Hub();

// ---------- formatting ----------
export const fmtUsd = (v: number, d = 0) => !isFinite(v) ? '—' : (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toLocaleString(undefined, { maximumFractionDigits: d })}`);
export const fmtPx = (v: number, tick = 0.01) => { if (!isFinite(v)) return '—'; const dp = Math.max(0, Math.min(8, Math.ceil(-Math.log10(tick || 0.01)))); return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }); };
export const fmtPct = (v: number, d = 2) => !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
export const fmtQty = (v: number) => !isFinite(v) ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
export const short = (a: string) => a ? (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a) : '—';
