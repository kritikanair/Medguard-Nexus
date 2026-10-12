# MedGuard Nexus

> **Real-Time Intrusion Detection & Automated Response System for Hospital Networks**
> Isolation Forest ML · Flask-SocketIO · React 19 · SQLite · Cyber Digital Twin

---

## What It Does

MedGuard Nexus monitors hospital network traffic in real time, detects anomalies using a trained Isolation Forest model, automatically isolates compromised nodes via a SOAR engine, and visualises the entire system across three live pages — including a Cyber Digital Twin that shows the physical network diverging from its virtual baseline during an attack.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BACKEND  (port 5001)                          │
│                                                                      │
│  PacketSniffer (sniffer.py)                                          │
│  ├─ LIVE MODE    : Scapy AsyncSniffer on active NIC (requires root)  │
│  └─ REPLAY MODE  : CIC-IDS2017 Wednesday CSV (default, no root)      │
│           │                                                          │
│           ▼  15 flow features per packet window                      │
│  Isolation Forest (anomaly_model.pkl)                                │
│  ├─ StandardScaler normalisation                                     │
│  ├─ decision_function() → anomaly score                              │
│  └─ score < threshold (−0.0185) → verdict: ANOMALY | NORMAL          │
│           │                                                          │
│           ├──▶  SOAREngine (soar.py)                                 │
│           │     ├─ Tracks consecutive anomaly strikes per src_ip     │
│           │     ├─ Auto-isolates at 3 consecutive anomalies          │
│           │     ├─ Persists blacklist to soar_blacklist.json         │
│           │     └─ Emits isolation_event via WebSocket               │
│           │                                                          │
│           ├──▶  SQLite (database.py)                                 │
│           │     ├─ telemetry_logs table                              │
│           │     └─ isolation_events table                            │
│           │                                                          │
│           └──▶  Flask-SocketIO  →  /ws/telemetry                    │
│                 ├─ telemetry        every ~750 ms                    │
│                 ├─ stats_update     every ~3 s                       │
│                 ├─ isolation_event  on SOAR trigger                  │
│                 ├─ stream_status    on start/stop                    │
│                 └─ history_snapshot on client connect                │
└──────────────────────────────────────────────────────────────────────┘
                              │  WebSocket  ws://localhost:5001/ws/telemetry
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND  (port 3000)                         │
│                                                                      │
│  useSocket.js  ──────────────────────────────────────────────────    │
│  (single shared WebSocket connection via React Context)              │
│  ├─ logs[]          200-entry rolling buffer, persists on stop       │
│  ├─ streaming       bool                                             │
│  ├─ isolationEvents[]                                                │
│  ├─ stats           model + session metrics                          │
│  ├─ frozenAt        timestamp of last stream stop                    │
│  └─ clearLogs()     explicit user-triggered clear only               │
│                                                                      │
│  /              Dashboard      Model metrics, score graph, CM        │
│  /logs          Live Monitor   Traffic table, topology, AI summary   │
│  /twin          Digital Twin   Physical ↔ Virtual state monitor      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML Model | Isolation Forest — scikit-learn 1.x |
| Training Data | CIC-IDS2017 (Monday benign → Wednesday benign + DoS Hulk) |
| Backend | Flask 3.1 + Flask-SocketIO 5.x |
| Real-time | WebSocket namespace `/ws/telemetry` |
| Packet Engine | Scapy (live) / CSV replay (default) |
| SOAR | Custom Python + JSON blacklist + optional iptables/pfctl |
| Persistence | SQLite 3 (WAL mode, thread-safe) |
| Frontend | React 19 + React Router 7 + socket.io-client 4 |
| Styling | Inline JS styles, CSS custom properties, JetBrains Mono |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend

# Recommended: create a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

python app.py
# → Flask + SocketIO server at http://localhost:5001
# → WebSocket at  ws://localhost:5001/ws/telemetry
# → Runs in CSV replay mode by default (no root required)
```

> **Live capture** (macOS/Linux only): `sudo python app.py`
> Scapy will detect root and switch to live packet capture automatically.

### Frontend

```bash
cd frontend
npm install
npm start
# → React dev server at http://localhost:3000
```

Open `http://localhost:3000` in your browser. Use the **Navbar** to navigate between pages.
Click **▶ START STREAM** on the Dashboard or Live Monitor to begin.

---

## Pages

### `/` — Model Performance Dashboard

Static and live metrics for the trained Isolation Forest model.

- **4 metric cards** — Precision 96.4%, Recall 63.7%, F1 76.7%, Accuracy 85.9% (from training)
- **Live score graph** — real-time anomaly score timeline with threshold line
- **Score distribution chart** — benign vs attack score histograms
- **Confusion matrix** — trained model TP/FP/FN/TN + live session matrix
- **Live session cards** — flows analysed, attacks flagged, live precision/recall (visible when streaming)
- **Model details panel** — algorithm config, feature count, threshold, training info
- **Isolation banner** — shown when SOAR has active blocks, links to Live Monitor

### `/logs` — Live Network Traffic Monitor

Full real-time traffic table with filtering, triage, and topology visualisation.

- **Stats bar** — flows, attacks, normal count, attack rate, isolated count, streaming status
- **Frozen session indicator** — `❄ FROZEN — HH:MM:SS` when stopped with logs preserved; CLEAR button to wipe
- **Stream button** — `▶ START` / `■ STOP` / `↺ RESTART` (smart label based on state)
- **Filter buttons** — ALL / ATTACK / NORMAL / ISOLATED
- **Auto-scroll toggle** — `↓ AUTO` / `○ PAUSED`
- **Active SOAR isolations bar** — lists blocked IPs with ward and one-click UNBLOCK
- **Ward Topology SVG** — animated hospital floor plan, ward state reflects live verdicts
  - 🟢 NORMAL — green glow
  - 🔴 ATTACK DETECTED — red pulse with attack count badge
  - 🔵 ISOLATED — rotating blue dashed ring + 🔒 badge
  - Click any ward node → opens triage for most recent attack from that ward
- **AI Summary** — auto-generated threat narrative (live ticker during stream, full report on stop)
- **Traffic table** — 12 columns: #, TIME, SRC IP, DST IP, PORT, WARD, PKT/s, BYTES/s, A.SCORE, VERDICT, LABEL, RESULT
  - New rows flash red (attack) or green (normal)
  - Click any row → opens Triage Panel
- **Triage Panel** (slide-in drawer)
  - Flow forensics: IP, port, ward, score, threshold, rate, bytes
  - Raw feature vector (15 model inputs)
  - AI-generated threat narrative
  - Block / Unblock with confirmation
  - False-positive dismissal

### `/twin` — Cyber Digital Twin

Simulation visualisation showing physical network state vs virtual twin baseline in real time.

**Concept:** Two parallel representations per ward — the left side shows what the live traffic is actually doing (physical), the right side shows what the trained model expects normal traffic to look like (virtual twin). When they diverge, that is a desync = an anomaly.

- **Header badges** — Physical Network (LIVE/IDLE) and Virtual Twin (BASELINE ACTIVE)
- **Global alert banner** — tiered threat indicator:
  - `◌ Start the stream…` — idle, no prior session
  - `❄ SIMULATION FROZEN — stopped at HH:MM:SS` — preserved last session with per-ward phase chips
  - `✓ ALL SYSTEMS NOMINAL` — streaming, all synced
  - Red / amber / blue alert strips for DESYNC / SCANNING / ISOLATED wards
- **Ward comparison cards** (one per ward, full width):
  - Colour-coded top bar (green / amber / red / blue)
  - State label: `✓ SYNCED` / `◎ SCANNING` / `⚠ DESYNC DETECTED` (blinks) / `🔒 MICRO-ISOLATED`
  - `❄` suffix on frozen state labels when stream is stopped
  - Left half — PHYSICAL NETWORK: animated PKT RATE, BYTES/S, ANOMALY SCORE, VERDICT
  - Center — `vs` circle with directional arrow (→ / ◎ / ⚠ / 🔒)
  - Right half — VIRTUAL TWIN: hardcoded baselines from Monday CIC-IDS2017 (always stable)
  - Footer — desync detail line with Δ pkt/s and SOAR response status
- **Ward phase engine** — driven by real WebSocket logs, no fake timers:
  - `< 15%` anomaly ratio → SYNCED
  - `15–50%` → SCANNING
  - `≥ 50%` → DESYNC
  - SOAR active isolation → ISOLATED
- **Frozen frame persistence** — simulation state (ward phases, metrics, incident log) is stored at module level and survives React unmount/remount when navigating between pages
- **Twin Sync Status Bar** — WARDS MONITORED / IN SYNC / SCANNING / DESYNCED / MICRO-ISOLATED / TWIN UPTIME: 100%
- **Active isolation panel** — shows blocked nodes with UNBLOCK buttons (same SOAR data as Live Monitor)
- **Simulation Incident Log** — append-only list of phase transitions with timestamps; title updates on stop: `SESSION ENDED HH:MM:SS — N EVENTS RECORDED`
- **Architecture info cards** — DATA SOURCE / TWIN BASELINE / DESYNC LOGIC

---

## Ward → IP Mapping

| IP 3rd Octet | Ward |
|---|---|
| 1 | ICU |
| 2 | Emergency |
| 3 | Pharmacy |
| 4 | Oncology |
| 5–9 | General Ward |

### Twin Baseline (Monday CIC-IDS2017 benign training data)

| Ward | Pkt/s | Bytes/s | IAT ms | Protocol |
|---|---|---|---|---|
| ICU | 12 | 3,200 | 180 | HL7/FHIR |
| Emergency | 45 | 8,100 | 95 | DICOM/HL7 |
| Pharmacy | 8 | 1,400 | 310 | REST |
| Oncology | 28 | 5,500 | 140 | DICOM |
| General Ward | 6 | 900 | 420 | HTTP/REST |

---

## WebSocket Events

### Server → Client

| Event | Payload | Frequency |
|---|---|---|
| `telemetry` | Single flow inference result | ~750 ms |
| `stats_update` | Session metrics + blacklist | ~3 s |
| `isolation_event` | SOAR isolation/unblock event | On SOAR trigger |
| `stream_status` | `{ status: "started" \| "stopped" }` | On start/stop |
| `history_snapshot` | Full state snapshot | On client connect |

### Client → Server

| Event | Payload | Effect |
|---|---|---|
| `stream_start` | — | Start sniffer + emit loop |
| `stream_stop` | — | Stop sniffer + emit loop |
| `isolate_ip` | `{ ip }` | Manual IP block via SOAR |
| `unblock_ip` | `{ ip }` | Remove block + re-emit event |

---

## REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server status, model loaded, can_sniff, phase |
| `/api/stats` | GET | Session + model metrics |
| `/api/logs` | GET | In-memory log buffer (up to 200) |
| `/api/logs/latest/<id>` | GET | Logs after a given ID |
| `/api/history` | GET | Last N rows from SQLite (`?limit=100`) |
| `/api/isolations` | GET | All isolation events from SQLite |
| `/api/blacklist` | GET | Current in-memory SOAR blacklist |
| `/api/isolate` | POST | Manually block `{ "ip": "..." }` |
| `/api/unblock` | POST | Manually unblock `{ "ip": "..." }` |
| `/api/twin/status` | GET | Per-ward Digital Twin state derived from logs |
| `/api/scores/distribution` | GET | Score histograms for distribution chart |
| `/api/predict` | GET | Single prediction (Phase 1 compatibility) |
| `/api/stream/start` | GET | Start stream (Phase 1 compatibility) |
| `/api/stream/stop` | GET | Stop stream (Phase 1 compatibility) |

---

## SOAR Engine

- Tracks consecutive anomaly strikes per `src_ip`
- Auto-isolates when **3 consecutive anomalies** from the same IP are detected
- Persists blacklist to `soar_blacklist.json` — survives backend restarts
- On Windows: blacklist-only mode
- On Linux: optionally applies `iptables DROP` rules (`ENABLE_FIREWALL=true`)
- On macOS: optionally applies `pfctl` rules (`ENABLE_FIREWALL=true`)
- Emits `isolation_event` immediately over WebSocket on containment and unblock

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODEL_PATH` | `models/anomaly_model.pkl` | Trained Isolation Forest |
| `SCALER_PATH` | `models/scaler.pkl` | StandardScaler artifact |
| `THRESHOLD_PATH` | `models/threshold.pkl` | Decision threshold (−0.0185) |
| `CONFIG_PATH` | `models/medguard_config.json` | Feature list + performance metadata |
| `DATASET_PATH` | `data/Wednesday-workingHours.pcap_ISCX.csv` | CIC-IDS2017 Wednesday CSV |
| `STREAM_INTERVAL` | `0.75` | Seconds between emitted telemetry events |
| `ENABLE_FIREWALL` | `false` | Apply real iptables/pfctl rules on isolation |
| `AUTO_ISOLATE_THRESHOLD` | `3` | Consecutive anomalies before auto-isolation |

---

## File Structure

```
medguard-nexus/
│
├── backend/
│   ├── app.py                  Flask + SocketIO server, all REST + WS endpoints
│   ├── sniffer.py              Packet capture & CSV replay, feature extraction
│   ├── soar.py                 SOAR isolation engine, blacklist management
│   ├── database.py             SQLite init, insert, query helpers
│   ├── requirements.txt
│   ├── medguard_nexus.db       Auto-created on first run
│   ├── soar_blacklist.json     Auto-created by SOAR, persists across restarts
│   └── models/
│       ├── anomaly_model.pkl   Trained IsolationForest
│       ├── scaler.pkl          Fitted StandardScaler
│       ├── threshold.pkl       Decision threshold float
│       └── medguard_config.json Feature names, contamination, performance metrics
│
└── frontend/
    └── src/
        ├── App.js              BrowserRouter + SocketContext provider (3 routes)
        ├── api.js              REST client helpers
        ├── index.css           Design system: CSS custom properties, animations
        ├── hooks/
        │   └── useSocket.js    Single shared WS connection, logs buffer, frozenAt
        ├── components/
        │   ├── Navbar.js       3-page nav, WS connection state indicator
        │   ├── WardTopology.js Animated SVG hospital floor plan
        │   ├── TriagePanel.js  Slide-in forensics drawer
        │   ├── AISummary.js    AI-generated threat narrative
        │   ├── MetricCard.js   KPI card
        │   ├── ConfusionMatrix.js  TP/FP/FN/TN grid
        │   ├── LiveScoreGraph.js   Real-time score timeline
        │   └── ScoreDistributionChart.js  Score histogram
        └── pages/
            ├── Dashboard.js    Model metrics + live session stats
            ├── LiveMonitor.js  Traffic table + topology + triage
            └── DigitalTwin.js  Physical ↔ Virtual state monitor
```

---

## Database Schema

```sql
-- Flow telemetry
CREATE TABLE telemetry_logs (
    id          INTEGER PRIMARY KEY,
    timestamp   TEXT,
    src_ip      TEXT,
    dst_ip      TEXT,
    port        INTEGER,
    ward        TEXT,
    score       REAL,
    verdict     TEXT,
    true_label  TEXT,
    pkt_rate    REAL,
    flow_bytes  REAL
);

-- SOAR isolation events
CREATE TABLE isolation_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address  TEXT,
    target_ward TEXT,
    status      TEXT,    -- ACTIVE | UNBLOCKED
    timestamp   TEXT,
    attack_type TEXT
);
```

---

## Model Details

| Property | Value |
|---|---|
| Algorithm | Isolation Forest |
| Contamination | 0.01 (trained on 100% benign data) |
| Features | 15 (selected by benign/attack separation score) |
| Scaler | StandardScaler (fitted on Monday benign traffic) |
| Threshold | −0.0185 (24th percentile of benign score distribution) |
| Training set | CIC-IDS2017 Monday — 100% BENIGN |
| Test set | CIC-IDS2017 Wednesday — BENIGN + DoS Hulk |
| Precision | 96.4% |
| Recall | 63.7% |
| F1 Score | 76.7% |
| Accuracy | 85.9% |

The threshold is tuned to favour precision. Recall is intentionally traded off to minimise false positives in a clinical environment where alert fatigue is a patient safety concern.

---

## Session State Preservation

When the stream is stopped, MedGuard Nexus preserves the last session state across all three pages:

- **Live Monitor** — all traffic logs remain in the table, stats bar shows `❄ FROZEN — HH:MM:SS`, button changes to `↺ RESTART`, CLEAR button available to wipe
- **Digital Twin** — ward phases, physical metrics, and incident log are stored at module level (outside React component lifecycle), so they survive navigation between pages and component remounts; frozen labels show `❄` suffix; banner shows per-ward phase snapshot
- **Dashboard** — score graph and confusion matrix retain last session data

---

*MedGuard Nexus · CIC-IDS2017 · Isolation Forest · Flask-SocketIO · React 19*
