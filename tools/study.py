"""Study the pressure score on the live log (tools/data/pressure-log.jsonl).
Searches part weights (incl. contrarian signs), thresholds and horizons on the first 70% of time (train),
then scores the winner on the last 30% (test). Calls are de-overlapped: at most one call per market per horizon.
Writes tools/data/study.json and prints a summary."""
import json, bisect, itertools, sys, time
P = 'tools/data/pressure-log.jsonl'
rows = [json.loads(l) for l in open(P)]
rows.sort(key=lambda r: r['t'])
by = {}
for r in rows: by.setdefault(r['s'], []).append(r)
PARTS = ['book', 'flow', 'liquidations', 'funding']
def fwd(rs, ts, i, h):
    j = bisect.bisect_left(ts, rs[i]['t'] + h * 60000)
    if j >= len(rs) or rs[j]['t'] - rs[i]['t'] > h * 60000 + 120000: return None
    return rs[j]['mid'] / rs[i]['mid'] - 1
samples = {h: [] for h in (5, 15, 60)}
for s, rs in by.items():
    ts = [r['t'] for r in rs]
    for h in samples:
        last = -1e18
        for i, r in enumerate(rs):
            if r['t'] - last < h * 60000: continue  # non-overlapping
            f = fwd(rs, ts, i, h)
            if f is None or f == 0: continue
            last = r['t']; samples[h].append((r['t'], s, [r['parts'].get(p, 0) / {'book': 40, 'flow': 30, 'liquidations': 20, 'funding': 10}[p] for p in PARTS], f))
def evaluate(data, w, th):
    n = hit = 0
    for _, _, x, f in data:
        sc = sum(a * b for a, b in zip(w, x))
        if abs(sc) >= th: n += 1; hit += (sc > 0) == (f > 0)
    return n, (hit / n * 100 if n else 0)
grid = [-1, -0.5, 0, 0.5, 1]
best = None; report = {}
for h, data in samples.items():
    if len(data) < 60: report[h] = {'samples': len(data), 'note': 'not enough data'}; continue
    cut = data[int(len(data) * 0.7)][0] if False else sorted(d[0] for d in data)[int(len(data) * 0.7)]
    tr = [d for d in data if d[0] < cut]; te = [d for d in data if d[0] >= cut]
    cand = None
    for w in itertools.product(grid, repeat=4):
        if not any(w): continue
        for th in (0.2, 0.4, 0.6, 0.8):
            n, hr = evaluate(tr, w, th)
            if n < max(30, len(tr) * 0.05): continue
            if cand is None or hr > cand[0]: cand = (hr, w, th, n)
    if not cand: report[h] = {'samples': len(data), 'note': 'no rule with enough calls'}; continue
    n2, hr2 = evaluate(te, cand[1], cand[2])
    report[h] = {'samples': len(data), 'train': {'hit': round(cand[0], 1), 'n': cand[3]}, 'test': {'hit': round(hr2, 1), 'n': n2}, 'weights': dict(zip(PARTS, cand[1])), 'threshold': cand[2],
                 'base_up_pct_test': round(sum(1 for d in te if d[3] > 0) / len(te) * 100, 1)}
    if n2 >= 30 and (best is None or hr2 > best['test']['hit']): best = {'horizon_min': h, **report[h]}
out = {'at': int(time.time() * 1000), 'log_rows': len(rows), 'hours_logged': round((rows[-1]['t'] - rows[0]['t']) / 3.6e6, 2), 'markets': len(by), 'by_horizon': report, 'best': best}
json.dump(out, open('tools/data/study.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
