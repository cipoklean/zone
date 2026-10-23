"""Pack recorder output into static files the app loads.
python3 tools/pack.py <data_dir>   -> public/replay/*.json + index.json, public/track/live.json"""
import json, sys, os, bisect, time, datetime
D = sys.argv[1] if len(sys.argv) > 1 else 'tools/data'
os.makedirs('public/replay', exist_ok=True)

def sig(x, n=6): return float(f'{x:.{n}g}')

# ---- replay: trim each column to +-1.5% of mid, compact arrays ----
def pack_heat(sym, start=0, end=None, title='', note=''):
    d = json.load(open(f'{D}/heat-{sym}.json')); cols = d['cols'][start:end]
    t0, t1 = cols[0]['t'], cols[-1]['t']
    out = {'symbol': sym, 'cols': [[c['t'], sig(c['mid'], 8), [[sig(p, 8), sig(q, 5)] for p, q in c['bids'] if p >= c['mid'] * 0.985][:90], [[sig(p, 8), sig(q, 5)] for p, q in c['asks'] if p <= c['mid'] * 1.015][:90], c['buys'], c['sells']] for c in cols],
           'trades': [[t['p'], t['q'], t['t'], 1 if t['b'] else 0] for t in d['trades'] if t0 - 1000 <= t['t'] <= t1 + 1000]}
    fn = f'{sym}-{datetime.datetime.utcfromtimestamp(t0/1000).strftime("%Y%m%d-%H%M")}.json'
    json.dump(out, open(f'public/replay/{fn}', 'w'), separators=(',', ':'))
    return {'file': fn, 'symbol': sym, 'title': title, 'note': note, 'from': t0, 'to': t1}

# ---- live track record: score at t vs mid ~15 min later ----
def live(th=30, horizon=15 * 60_000):
    rows = [json.loads(l) for l in open(f'{D}/pressure-log.jsonl')]
    by = {}
    for r in rows: by.setdefault(r['s'], []).append(r)
    strong = hits = calls = 0; moves = []
    for s, rs in by.items():
        ts = [r['t'] for r in rs]
        for r in rs:
            i = bisect.bisect_left(ts, r['t'] + horizon)
            if i >= len(rs) or abs(rs[i]['t'] - r['t'] - horizon) > 120_000: continue
            calls += 1; fwd = rs[i]['mid'] / r['mid'] - 1
            if abs(r['score']) >= th and fwd != 0:
                strong += 1; ok = (fwd > 0) == (r['score'] > 0); hits += ok; moves.append(fwd * (1 if r['score'] > 0 else -1))
    t0, t1 = rows[0]['t'], rows[-1]['t']
    span = f"over {round((t1 - t0) / 60000)} min on {datetime.datetime.utcfromtimestamp(t0/1000).strftime('%b %d, %Y')}"
    out = {'threshold': th, 'horizonMin': 15, 'calls': calls, 'span': span, 'baseline': 50.0,
           'strong': {'n': strong, 'hit': hits / strong * 100 if strong else float('nan'), 'avgMovePct': sum(moves) / len(moves) * 100 if moves else 0}}
    json.dump(out, open('public/track/live.json', 'w'))
    return out

if __name__ == '__main__':
    print(json.dumps(live(), indent=1))
