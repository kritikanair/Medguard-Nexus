# MedGuard Nexus — Phase 2

> **Enterprise-grade Real-Time Intrusion Detection & Automated Response System (SOAR)**
> Built on Isolation Forest ML · Flask-SocketIO · React 19 · SQLite

---

## Architecture

```
[Scapy / CSV Replay]
        │
        ▼
  PacketSniffer (sniffer.py)
  • Live capture or CSV fallback
  • Computes 15 flow features
        │
        ▼
  Isolation Forest (anomaly_model.pkl)
  • Scores every flow
  • Verdict: NORMAL | ANOMALY
        │
        ├──▶ SOAREngine (soar.py)
        │    • Tracks per-IP strikes
        │    • Auto-isolates at threshold 3
        │    • JSON blacklist (+ optional iptables/pfctl)
        │    • Emits isolation_event via WebSocket
        │
        ├──▶ SQLite (database.py)
        │    • telemetry_logs table
        │    • isolation_events table
        │
        └──▶ Flask-SocketIO → /ws/telemetry
             • telemetry event   (every ~750ms)
             • stats_update      (every ~3s)
             • isolation_event   (on SOAR trigger)
```

## Tech Stack

| Component     | Technology                              | Phase |
|---------------|-----------------------------------------|-------|
| ML Model      | Isolation Forest (scikit-learn)         | 1+2   |
| Backend       | Flask 3.1 + Flask-SocketIO 5.x          | 2     |
| Real-time     | WebSocket `/ws/telemetry` namespace     | 2     |
| Packet Engine | Scapy (live) / CSV fallback (demo)      | 2     |
| SOAR Engine   | Custom Python + JSON blacklist          | 2     |
| Persistence   | SQLite3 (WAL mode, thread-safe)         | 2     |
| Frontend      | React 19 + socket.io-client v4          | 2     |
| Topology Map  | Inline SVG animated digital twin        | 2     |

---

## Quick Start

### Backend

```bash
cd backend

# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Start the server (no root required — runs in CSV replay mode)
python app.py
# → Server on http://localhost:5001
# → WebSocket on ws://localhost:5001/ws/telemetry

# Optional: live packet capture (macOS/Linux only, requires root)
sudo python app.py
```

### Frontend

```bash
cd frontend
npm install
npm start
# → React app on http://localhost:3000
```

---

## Phase 2 Features

### 1. WebSocket Communication (`/ws/telemetry`)

| Event (server → client) | Payload                     | Frequency |
|--------------------------|------------------------------|-----------|
| `telemetry`              | Single flow inference result | ~750ms    |
| `stats_update`           | Session metrics + blacklist  | ~3s       |
| `isolation_event`        | SOAR isolation/unblock event | On-demand |
| `stream_status`          | Stream start/stop ack        | On-demand |
| `history_snapshot`       | State snapshot on connect    | On connect|

| Event (client → server) | Payload       | Effect                 |
|--------------------------|---------------|------------------------|
| `stream_start`           | —             | Start sniffer + emitter|
| `stream_stop`            | —             | Stop sniffer + emitter |
| `isolate_ip`             | `{ ip }`      | Manual IP block        |
| `unblock_ip`             | `{ ip }`      | Remove IP block        |

### 2. Packet Sniffer Modes

- **LIVE MODE** (requires `sudo` / root): Scapy AsyncSniffer captures real packets on the active NIC.  Sliding flow windows compute 15 CIC-IDS features per flow.
- **CSV REPLAY MODE** (default / no root): Cycles through the Wednesday CSV dataset with clean BENIGN↔ATTACK alternation.  Identical inference pipeline to live mode.

Detection is automatic — the sniffer checks `os.getuid()` at startup.

### 3. SOAR Engine

- Tracks consecutive anomaly strikes per `src_ip`
- Auto-isolates when **3 consecutive anomalies** from the same IP are detected
- Writes to `soar_blacklist.json` (persists across restarts)
- Optionally applies `iptables` (Linux) or `pfctl` (macOS) rules when `ENABLE_FIREWALL=true`
- Emits `isolation_event` WebSocket payload immediately on containment

Ward mapping (src_ip 3rd octet):

| Octet | Ward        |
|-------|-------------|
| 1     | ICU         |
| 2     | Emergency   |
| 3     | Pharmacy    |
| 4     | Oncology    |
| 5–9   | General Ward|

### 4. Database (SQLite)

Database file: `backend/medguard_nexus.db`

```sql
-- All persisted flows
SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT 50;

-- All isolation events
SELECT * FROM isolation_events WHERE status = 'ACTIVE';
```

REST endpoints:
- `GET /api/history?limit=100` — last N telemetry rows
- `GET /api/isolations` — all isolation events
- `GET /api/blacklist` — current blocked IPs

### 5. Hospital Ward Topology

Interactive SVG floor plan on the Live Monitor page:
- **Normal** — green glow, steady pulse
- **Attack Detected** — red pulse, attack count badge
- **Isolated** — blue rotating dashed ring, 🔒 badge

Click any ward node to open the triage drawer for the most recent attack from that ward.

### 6. Triage Panel

Slide-in forensics drawer accessible by:
- Clicking any row in the traffic table
- Clicking an active or isolated ward node

Features:
- IP block/unblock with two-click confirmation
- Raw feature vector (all 15 model inputs)
- AI-generated threat narrative
- Flow details (score, threshold, rate, bytes)
- False-positive dismissal button

---

## Environment Variables

| Variable              | Default                                        | Description                     |
|-----------------------|------------------------------------------------|---------------------------------|
| `MODEL_PATH`          | `models/anomaly_model.pkl`                     | Isolation Forest model          |
| `SCALER_PATH`         | `models/scaler.pkl`                            | StandardScaler artifact         |
| `THRESHOLD_PATH`      | `models/threshold.pkl`                         | Decision threshold              |
| `CONFIG_PATH`         | `models/medguard_config.json`                  | Feature list + metadata         |
| `DATASET_PATH`        | `data/Wednesday-workingHours.pcap_ISCX.csv`   | CIC-IDS2017 Wednesday CSV       |
| `DB_PATH`             | `medguard_nexus.db`                            | SQLite database path            |
| `BLACKLIST_PATH`      | `soar_blacklist.json`                          | SOAR JSON blacklist             |
| `STREAM_INTERVAL`     | `0.75`                                         | Seconds between emitted events  |
| `ENABLE_FIREWALL`     | `false`                                        | Enable iptables/pfctl rules     |
| `AUTO_ISOLATE_THRESHOLD` | `3`                                         | Consecutive anomalies to isolate|

---

## API Reference (Phase 2 additions)

| Endpoint           | Method | Description                           |
|--------------------|--------|---------------------------------------|
| `/api/health`      | GET    | Server status + `can_sniff`, `phase`  |
| `/api/history`     | GET    | Last 100 persisted telemetry rows     |
| `/api/isolations`  | GET    | All isolation events (DB)             |
| `/api/blacklist`   | GET    | Current in-memory blacklist           |
| `/api/isolate`     | POST   | Manually block an IP `{ "ip": "..." }`|
| `/api/unblock`     | POST   | Manually unblock `{ "ip": "..." }`    |

All Phase 1 endpoints (`/api/predict`, `/api/logs`, `/api/stats`, `/api/scores/distribution`) are **preserved**.

---

## File Structure (Phase 2)

```
backend/
├── app.py              ← Flask + SocketIO server
├── sniffer.py          ← NEW: Packet capture & feature extraction
├── soar.py             ← NEW: SOAR isolation engine
├── database.py         ← NEW: SQLite persistence layer
├── requirements.txt    ← Updated with flask-socketio, scapy
├── models/             ← Pre-trained ML artifacts
│   ├── anomaly_model.pkl
│   ├── scaler.pkl
│   ├── threshold.pkl
│   └── medguard_config.json
├── data/
│   └── Wednesday-workingHours.pcap_ISCX.csv
├── medguard_nexus.db   ← auto-created on first run
└── soar_blacklist.json ← auto-created by SOAR

frontend/
├── src/
│   ├── App.js                       ← Socket context provider
│   ├── api.js                       ← REST client (Phase 1+2)
│   ├── hooks/
│   │   ├── useSocket.js             ← NEW: Primary WS hook
│   │   └── useStream.js             ← Preserved (fallback)
│   ├── components/
│   │   ├── WardTopology.js          ← NEW: SVG hospital digital twin
│   │   ├── TriagePanel.js           ← NEW: Forensics drawer
│   │   ├── Navbar.js                ← Updated: 3-state WS indicator
│   │   ├── AISummary.js             ← Preserved
│   │   ├── ConfusionMatrix.js       ← Preserved
│   │   ├── LiveScoreGraph.js        ← Preserved
│   │   ├── MetricCard.js            ← Preserved
│   │   └── ScoreDistributionChart.js← Preserved
│   └── pages/
│       ├── Dashboard.js             ← Updated: WebSocket stats
│       └── LiveMonitor.js           ← Updated: Topology + Triage
```
