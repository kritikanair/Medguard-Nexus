# MedGuard Nexus
### Real-Time Network Anomaly Detection Dashboard

> A full-stack cybersecurity system that uses Machine Learning to detect network intrusions in real-time, built for hospital/enterprise network security monitoring.

---

## 📌 Overview

MedGuard Nexus simulates a live Security Operations Center (SOC) dashboard. It ingests real network traffic data from the CIC-IDS2017 dataset, runs it through a trained Isolation Forest model, and displays verdicts, scores, and AI-generated threat summaries on an interactive React dashboard — all in real time.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MACHINE LEARNING                            │
│                                                                     │
│   Wednesday-workingHours.pcap_ISCX.csv  (CIC-IDS2017 dataset)      │
│              ↓  3000 balanced rows (BENIGN + DoS Hulk)              │
│   IsolationForest  →  StandardScaler  →  Threshold (-0.0185)        │
│   Saved as: anomaly_model.pkl | scaler.pkl | threshold.pkl          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  loaded at startup
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FLASK BACKEND  (port 5000)                     │
│                                                                     │
│   GET /api/predict   →  infer_row()  →  JSON response               │
│   GET /api/stats     →  live session metrics                        │
│   GET /api/health    →  server + model status                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTP  (CORS enabled)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REACT FRONTEND  (port 3000)                      │
│                                                                     │
│   useStream hook  →  polls /api/predict every 1.5s                  │
│   Dashboard       →  metric cards, score graph, confusion matrix    │
│   Live Monitor    →  scrolling traffic table + AI Summary panel     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **ML Model** | scikit-learn `IsolationForest` |
| **Data** | CIC-IDS2017 — Wednesday Working Hours (PCAP-derived CSV) |
| **Backend** | Python 3.14 · Flask 3.1 · Flask-CORS · pandas · numpy · joblib |
| **Frontend** | React 19 · React Router v6 · Vanilla CSS |
| **Fonts** | Inter (body) · JetBrains Mono (monospace/data) |
| **Charts** | Pure SVG (no external chart library) |

---

## 📁 Project Structure

```
medguard/
├── backend/
│   ├── app.py                  ← Flask server + all API logic
│   ├── requirements.txt
│   ├── models/
│   │   ├── anomaly_model.pkl   ← Trained Isolation Forest
│   │   ├── scaler.pkl          ← StandardScaler
│   │   ├── threshold.pkl       ← Decision boundary (-0.0185)
│   │   └── medguard_config.json← Feature list + performance metrics
│   └── data/
│       └── Wednesday-workingHours.pcap_ISCX.csv
│
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── App.js              ← Router + health check
│       ├── api.js              ← All fetch calls (centralized)
│       ├── index.css           ← Design system + CSS variables
│       ├── hooks/
│       │   └── useStream.js    ← Polling hook (1.5s interval)
│       ├── components/
│       │   ├── Navbar.js
│       │   ├── MetricCard.js
│       │   ├── ConfusionMatrix.js
│       │   ├── ScoreDistributionChart.js
│       │   ├── LiveScoreGraph.js
│       │   └── AISummary.js    ← Live alerts + post-analysis report
│       └── pages/
│           ├── Dashboard.js
│           └── LiveMonitor.js
│
├── SYSTEM_FLOW.md              ← Detailed technical documentation
└── README.md                   ← This file
```

---

## 🔄 Complete Data Flow

```
1. DATASET
   Wednesday CSV (700k+ rows)
   → Sampled to 3000: 1800 BENIGN + 1200 DoS Hulk
   → Loaded into memory as a pandas DataFrame at startup

2. MODEL INFERENCE  (per prediction)
   Pick one row from dataset (alternates BENIGN ↔ Attack)
        ↓
   Extract 15 network flow features
   (packet length variance, IAT std, idle time, byte rates, etc.)
        ↓
   Normalise with StandardScaler
        ↓
   Feed into IsolationForest → anomaly score (float)
   e.g.  +0.31  = normal traffic
         −0.09  = suspicious / anomalous
        ↓
   Compare to threshold (−0.0185):
     score < threshold  →  ANOMALY  🔴
     score ≥ threshold  →  NORMAL   🟢

3. API  (GET /api/predict)
   Returns JSON every time frontend asks:
   { score, verdict, true_label, is_tp, is_fp, flow_bytes, pkt_rate, … }

4. FRONTEND  (useStream.js)
   Polls /api/predict every 1.5 seconds
   Appends each result to logs[] state (max 200 entries)
   Triggers re-render of all subscribed components

5. UI DISPLAY
   Live Monitor → scrolling table, color-coded rows
   Dashboard    → score timeline graph, distribution chart, metric cards
   AI Summary   → live alerts while streaming, report when stopped
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.12+ (tested on 3.14)
- Node.js 18+

### 1. Start the Backend

```bash
cd medguard/backend
pip install -r requirements.txt
python app.py
```

> Server starts at **http://localhost:5000**
> You should see:
> ```
> [MedGuard] Loading model artifacts...
> [MedGuard] ✓ Model loaded. Threshold=-0.0185, Features=15
> [MedGuard] ✓ Dataset loaded: 3000 rows (1800 benign / 1200 attack)
> ```

### 2. Start the Frontend

Open a **second terminal**:

```bash
cd medguard/frontend
npm install
npm start
```

> App opens at **http://localhost:3000**

### 3. Using the Dashboard

1. Navigate to **Live Monitor** tab
2. Click **▶ START** to begin real-time prediction stream
3. Watch traffic rows appear every 1.5 seconds
4. Click **■ STOP** to halt streaming and view the AI summary report
5. Visit the **Dashboard** tab to see model performance metrics and score graphs

---

## 🧠 Key Features

### 1. Anomaly Detection (Isolation Forest)
- **Algorithm:** Isolation Forest — detects anomalies by measuring how easily a data point can be "isolated" from the rest
- **Training:** Trained exclusively on Monday (100% benign) traffic — it learns what "normal" looks like
- **Testing:** Evaluated on Wednesday traffic (BENIGN + DoS Hulk attacks)
- **Score interpretation:** Lower score = more anomalous. Threshold tuned to the 24th percentile for high recall

### 2. Threshold Tuning
- The decision boundary is **not** the default Isolation Forest output
- It was manually tuned to `−0.0185` (24th percentile of training scores)
- This trades some precision for better recall — catching more real attacks
- Result: **Precision 96.4%**, **Recall 63.7%**, **F1 76.7%**

### 3. Real-Time Log Streaming
- Frontend polls `/api/predict` every **1500ms**
- Each response is a complete prediction from a real dataset row
- Demo mode alternates BENIGN ↔ Attack requests for a clean 50/50 display
- Table supports filtering: ALL / ATTACK / NORMAL + auto-scroll toggle

### 4. AI Summary Panel
**Live mode (while streaming):**
- Displays a rolling alert feed with 4 severity levels: INFO → MEDIUM → HIGH → CRITICAL
- Alerts are generated based on patterns: burst detection, RDP targeting, high packet rates, etc.

**Post-analysis mode (after STOP):**
- Generates a structured threat intelligence report:
  - Overall risk level (LOW / MEDIUM / HIGH / CRITICAL)
  - Total flows, anomaly count, attack rate
  - Confusion matrix breakdown (TP / FP / FN / TN)
  - Key observations (automated text insights)

### 5. Model Performance Dashboard
- Static metrics from training displayed as metric cards
- Live session metrics update in real-time as predictions arrive
- Score distribution histogram (benign vs attack populations with threshold marker)
- SVG-based live score timeline with animated glow effects

---

## 📊 Model Performance (CIC-IDS2017 Wednesday)

| Metric | Value |
|---|---|
| Precision | 96.4% |
| Recall | 63.7% |
| F1-Score | 76.7% |
| Accuracy | 85.9% |
| True Positives | 18,516 |
| False Positives | 684 |
| False Negatives | 10,568 |
| True Negatives | 50,232 |
| Threshold | −0.0185 |
| Features Used | 15 |

---

## 🌐 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server + model status |
| `/api/predict` | GET | One prediction from dataset |
| `/api/stats` | GET | Live session + model metrics |
| `/api/scores/distribution` | GET | Score histogram data |
| `/api/stream/start` | GET | Start background stream thread |
| `/api/stream/stop` | GET | Stop background stream thread |
| `/api/logs` | GET | All buffered log entries |
| `/api/logs/latest/<id>` | GET | Delta logs after a given entry ID |

---

## 🎨 Design System

- **Theme:** Dark cyber-medical aesthetic (`#080d14` base)
- **Accent colours:** Teal (`#00e5a0`) · Red (`#ff3b5c`) · Amber (`#f59e0b`) · Green (`#22c55e`)
- **Grid overlay:** Subtle scanline grid on the background for SOC terminal feel
- **Animations:** Blinking live indicators, row flash on new entry, score line glow, spinning brand logo

---

## 📄 Dataset

**CIC-IDS2017 — Canadian Institute for Cybersecurity**

- Wednesday file contains: BENIGN traffic + DoS Hulk attack traffic
- Features are network flow statistics (not raw packets): packet lengths, inter-arrival times, byte rates, idle periods
- IP addresses in the dashboard are **simulated** (the dataset uses anonymised/derived flow stats, not raw IPs)

---

*MedGuard Nexus · Built for Industry Conclave Demo · April 2026*
