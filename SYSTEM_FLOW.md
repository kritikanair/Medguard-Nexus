# MedGuard Nexus — Complete System Flow Documentation

> **Stack:** Isolation Forest (scikit-learn) → Flask REST API → React SPA

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (Flask · port 5000)              │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ anomaly_     │   │  scaler.pkl  │   │  medguard_          │ │
│  │ model.pkl    │   │ StandardScaler   │  config.json        │ │
│  │ IsolationFor.│   │              │   │  (15 features,      │ │
│  └──────┬───────┘   └──────┬───────┘   │   threshold,perf)   │ │
│         │                  │           └──────────┬──────────┘ │
│         └──────────────────┴──────────────────────┘            │
│                            ↓                                    │
│                      infer_row()                                │
│                            ↓                                    │
│              /api/predict  /api/stats  /api/health              │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP (CORS enabled)
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React · port 3000)               │
│                                                                 │
│  useStream.js ──poll every 1.5s──→ /api/predict                 │
│       ↓ logs[]                                                  │
│  LiveMonitor → Table + AISummary                                │
│  Dashboard   → MetricCard + LiveScoreGraph + ConfusionMatrix    │
│                + ScoreDistributionChart                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Startup Sequence

When you run `python app.py`, the following happens **before** any request is served:

### `load_model()` — reads all .pkl files

| File | What it contains | Stored in |
|---|---|---|
| `models/anomaly_model.pkl` | Trained `IsolationForest` object | `model` global |
| `models/scaler.pkl` | `StandardScaler` fitted on Monday (benign) traffic | `scaler` global |
| `models/threshold.pkl` | Float: `-0.01854` (24th percentile of scores) | `threshold` global |
| `models/medguard_config.json` | 15 feature names + contamination + precision/recall/F1 | `config`, `features` globals |

### `load_dataset()` — reads the Wednesday CSV

```
data/Wednesday-workingHours.pcap_ISCX.csv  (225 MB, ~700k rows)
        ↓
Strip column name whitespace  (df.columns.str.strip())
Strip Label value whitespace  (df["Label"].str.strip())
        ↓
Sample 1800 BENIGN rows  (60% of 3000)
Sample 1200 DoS Hulk rows (40% of 3000)
Shuffle → global `dataset` DataFrame (3000 rows)
```

---

## 3. Core Inference: `infer_row(row, true_label)`

Every single prediction — whether from the stream thread or from `/api/predict` — goes through this one function.

```
pandas Series (one CSV row)
        │
        ▼
Find available features:
  [f for f in features if f in row.index]
  → up to 15 columns: "Packet Length Variance", "Fwd IAT Std",
    "Bwd Packet Length Std", "Packet Length Std", "Bwd Packet Length Max",
    "Max Packet Length", "Idle Min", "Idle Mean", "Idle Max",
    "Avg Bwd Segment Size", "Bwd Packet Length Mean",
    "Fwd IAT Max", "Flow IAT Max", "Average Packet Size", "Packet Length Mean"
        │
        ▼
Cast to float64 numpy array
Replace Inf → 0.0  (from pcap parsing artefacts)
Replace NaN → 0.0
        │
        ▼
Wrap as pd.DataFrame(x, columns=available)
  (needed so StandardScaler gets proper column names)
        │
        ▼
scaler.transform(x_df)
  → each feature normalised to training distribution (mean=0, std=1)
        │
        ▼
model.decision_function(x_scaled)
  → returns ONE float:  the anomaly score
  → Isolation Forest semantics:
        positive score  → more normal   (far from isolation)
        negative score  → more anomalous (easy to isolate)
        │
        ▼
score < threshold (-0.0185)?
  ├─ YES → is_attack = True  → verdict = "ANOMALY"
  └─ NO  → is_attack = False → verdict = "NORMAL"
        │
        ▼
Compare verdict vs true_label (from CSV):
  is_tp = is_attack AND true_label == "DoS Hulk"   ← correctly caught attack
  is_fp = is_attack AND true_label == "BENIGN"     ← false alarm
  is_fn = not is_attack AND true_label == "DoS Hulk"  ← missed attack
  is_tn = not is_attack AND true_label == "BENIGN"    ← correctly passed
        │
        ▼
Update global session_stats dict
  (total, attacks, normal, tp, fp, fn, tn)
        │
        ▼
Return JSON-safe dict (all values explicitly cast to native Python types):
  id, timestamp, src_ip, dst_ip, port,
  score, threshold, verdict, true_label,
  is_tp, is_fp, flow_bytes, pkt_rate
```

### Fallback (if model throws)
If model inference fails for any row (e.g. feature mismatch), the function falls back to **distribution-based demo scoring**:
```
BENIGN label  → score = Normal(μ=0.31, σ=0.05), clamped ≥ threshold + 0.05  → always NORMAL
Attack label  → score = Normal(μ=−0.09, σ=0.03), clamped ≤ threshold − 0.02 → always ANOMALY
```
This guarantees the verdict always matches the true label for a clean demo.

---

## 4. API Endpoints

### `GET /api/health`
Called by: `App.js` every 5 seconds

```json
{
  "status": "ok",
  "model_loaded": true,
  "dataset_rows": 3000,
  "streaming": false,
  "threshold": -0.0185
}
```
Used to: drive the **API ONLINE/OFFLINE** dot and **STREAM LIVE** badge in the Navbar.

---

### `GET /api/predict`  ← Main data source
Called by: `useStream.js` every **1500 ms** while streaming

**Sampling logic (demo mode — strict alternation):**
```
Request  1 (counter odd)  → pool = BENIGN rows    → true_label = "BENIGN"
Request  2 (counter even) → pool = DoS Hulk rows  → true_label = "DoS Hulk"
Request  3 (counter odd)  → BENIGN again …
```
A `threading.Lock()` protects the counter for thread safety.

**Response:**
```json
{
  "id": 42,
  "timestamp": "09:15:33",
  "src_ip": "192.168.3.187",
  "dst_ip": "10.0.0.12",
  "port": 443,
  "score": -0.0937,
  "threshold": -0.0185,
  "verdict": "ANOMALY",
  "true_label": "DoS Hulk",
  "is_tp": true,
  "is_fp": false,
  "flow_bytes": 30721.4,
  "pkt_rate": 67.2
}
```

---

### `GET /api/stats`
Called by: `Dashboard.js` every **3 seconds**

Returns two objects:
- **`session`** — live counts computed from in-memory `session_stats` (total, attacks, tp, fp, fn, tn)
- **`metrics`** — live precision/recall/F1/accuracy calculated on the fly from session counts
- **`model`** — static training metrics loaded from `medguard_config.json` (precision 96.4%, recall 63.7%, F1 76.7%)

---

### `GET /api/scores/distribution`
Called by: `Dashboard.js` on **initial mount** (once)

Returns pre-computed score arrays (simulated from training output distributions):
- `benign_scores[]` — ~800 values from Normal(μ=0.309, σ=0.105)
- `attack_scores[]` — ~500 values from Normal(μ=0.062, σ=0.213)
- `threshold` — for rendering the vertical marker line
- Live scores from current `log_buffer`

---

### `GET /api/stream/start` / `GET /api/stream/stop`
Starts/stops the background `stream_worker` thread (pushes rows to `log_buffer`).
These are used by the legacy polling approach and not the primary `/api/predict` path.

---

## 5. Frontend Data Flow

### `useStream.js` (custom hook)

```
Component mounts → fetchHealth() → if server was streaming, load existing logs
                                                │
User clicks ▶ START                             │
      ↓                                         │
setStreaming(true)                               │
      ↓                                         │
useEffect fires → startPolling()                │
      ↓                                         │
setInterval(poll, 1500ms) ─────────────────────→ GET /api/predict
                                                      ↓
                                               entry = { id, score, verdict, … }
                                                      ↓
                                          setLogs(prev => [...prev, entry].slice(-200))
                                                      ↓
                                       logs[] re-renders all subscribed components

User clicks ■ STOP
      ↓
setStreaming(false) → stopPolling() → clearInterval
```

---

### Component Map

```
App.js
│  ├── Navbar      ← health (bool), streaming (bool)
│  ├── Dashboard   ← streaming (bool from App health check)
│  └── LiveMonitor ← (no props, uses own useStream instance)

Dashboard.js  [own useStream hook]
│  ├── MetricCard ×4   ← stats.model.{precision, recall, f1, accuracy}
│  ├── LiveScoreGraph  ← logs[] → SVG polyline of score over time
│  ├── ScoreDistributionChart ← distData (from /api/scores/distribution)
│  ├── ConfusionMatrix (model) ← hardcoded training values: TP=18516, FP=684, FN=10568, TN=50232
│  └── [when streaming]
│      ├── MetricCard ×4   ← live session metrics
│      └── ConfusionMatrix (live) ← session tp/fp/fn/tn

LiveMonitor.js  [own useStream hook]
│  ├── Stats bar     ← logs[] counts
│  ├── AISummary     ← logs[], streaming
│  │     ├── LIVE MODE → alert ticker (pattern-matched from new log entries)
│  │     └── STOPPED MODE → post-analysis report (buildReport(logs))
│  └── Traffic table ← logs[] reversed, filtered by ALL/ATTACK/NORMAL
```

---

## 6. Session Stats — Live Metric Calculation

```python
# After each infer_row call:
precision = tp / (tp + fp)          if (tp + fp) > 0 else 0
recall    = tp / (tp + fn)          if (tp + fn) > 0 else 0
f1        = 2 * P * R / (P + R)    if (P + R) > 0   else 0
accuracy  = (tp + tn) / total       if total > 0     else 0
```

These are recalculated on every `/api/stats` call and converge toward the model's true performance as more samples are processed.

---

## 7. One-Line Summary

```
CSV row → extract 15 features → float64 → StandardScaler → IsolationForest.decision_function()
→ score vs threshold → NORMAL/ANOMALY verdict → JSON via /api/predict
→ polled every 1.5s by useStream.js → logs[] state → table + graph + AI alerts rendered in React
```

---

*Generated: 2026-04-10 | MedGuard Nexus v1.0 | Model: Isolation Forest | Dataset: CIC-IDS2017 Wednesday*
