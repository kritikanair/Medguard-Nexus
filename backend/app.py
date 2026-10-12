"""
MedGuard Nexus — Flask Backend (Phase 2)
=========================================
Communication: Flask-SocketIO WebSocket (primary) + REST (preserved)
Namespace:     /ws/telemetry

Architecture:
  PacketSniffer  →  infer_row  →  SOAREngine  →  emit_telemetry
                                               →  emit_isolation_event
                                               →  insert_telemetry (SQLite)

All Phase 1 REST endpoints are preserved for backward compatibility.
"""

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
import pandas as pd
import numpy as np
import joblib
import json
import time
import threading
import os
from collections import deque
from datetime import datetime

import database as db
from soar import SOAREngine
from sniffer import PacketSniffer

# ─────────────────────────────────────────────────────────────────────────────
# APP & SOCKETIO INIT
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

MODEL_PATH     = os.environ.get("MODEL_PATH",     "models/anomaly_model.pkl")
SCALER_PATH    = os.environ.get("SCALER_PATH",    "models/scaler.pkl")
THRESHOLD_PATH = os.environ.get("THRESHOLD_PATH", "models/threshold.pkl")
CONFIG_PATH    = os.environ.get("CONFIG_PATH",    "models/medguard_config.json")
DATASET_PATH   = os.environ.get("DATASET_PATH",   "data/Wednesday-workingHours.pcap_ISCX.csv")

STREAM_INTERVAL = float(os.environ.get("STREAM_INTERVAL", "0.75"))
MAX_LOG_SIZE    = 200
SAMPLE_SIZE     = 3000

# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL STATE
# ─────────────────────────────────────────────────────────────────────────────

model     = None
scaler    = None
threshold = None
config    = None
dataset   = None
features  = None

log_buffer    = deque(maxlen=MAX_LOG_SIZE)
stream_active = False
emit_thread   = None

session_stats = {
    "total": 0, "attacks": 0, "normal": 0,
    "fp": 0, "tp": 0, "fn": 0, "tn": 0,
}

# Singletons initialised after model load
sniffer: PacketSniffer | None = None
soar:    SOAREngine    | None = None

# Phase 1 compatibility — alternating counter
_predict_counter = 0
_predict_lock    = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# MODEL & DATASET LOADING
# ─────────────────────────────────────────────────────────────────────────────

def load_model():
    global model, scaler, threshold, config, features
    print("[MedGuard] Loading model artifacts…")
    if not os.path.exists(MODEL_PATH):
        print(f"[MedGuard] ⚠️  Model not found at {MODEL_PATH}. Running in DEMO mode.")
        return False

    model     = joblib.load(MODEL_PATH)
    scaler    = joblib.load(SCALER_PATH)
    threshold = joblib.load(THRESHOLD_PATH)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    features = config.get("features", [])
    print(f"[MedGuard] ✓ Model loaded. Threshold={threshold:.4f}, Features={len(features)}")
    return True


def load_dataset():
    global dataset
    print("[MedGuard] Loading Wednesday dataset…")
    if not os.path.exists(DATASET_PATH):
        print("[MedGuard] ⚠️  Dataset not found. Generating mock data.")
        dataset = _generate_mock_dataset()
        return

    df = pd.read_csv(DATASET_PATH)
    df.columns   = df.columns.str.strip()
    df["Label"]  = df["Label"].str.strip()

    benign_df = df[df["Label"] == "BENIGN"]
    attack_df = df[df["Label"] == "DoS Hulk"]

    benign  = benign_df.sample(min(int(SAMPLE_SIZE * 0.6), len(benign_df)), random_state=42)
    attack  = attack_df.sample(min(int(SAMPLE_SIZE * 0.4), len(attack_df)), random_state=42)
    dataset = pd.concat([benign, attack]).sample(frac=1, random_state=42).reset_index(drop=True)
    print(f"[MedGuard] ✓ Dataset loaded: {len(dataset)} rows "
          f"({len(benign)} benign / {len(attack)} attack)")


def _generate_mock_dataset():
    """Fallback mock data when real dataset is unavailable."""
    np.random.seed(42)
    n      = SAMPLE_SIZE
    labels = ["BENIGN"] * int(n * 0.6) + ["DoS Hulk"] * int(n * 0.4)
    np.random.shuffle(labels)
    rows = []
    for label in labels:
        if label == "BENIGN":
            rows.append({
                "Flow Duration": np.random.normal(500000, 100000),
                "Packet Length Variance": np.random.normal(100, 30),
                "Fwd IAT Std": np.random.normal(80000, 20000),
                "Flow Packets/s": np.random.normal(10, 3),
                "Flow Bytes/s": np.random.normal(5000, 1000),
                "Label": "BENIGN",
            })
        else:
            rows.append({
                "Flow Duration": np.random.normal(5000, 2000),
                "Packet Length Variance": np.random.normal(20, 10),
                "Fwd IAT Std": np.random.normal(500, 200),
                "Flow Packets/s": np.random.normal(5000, 1000),
                "Flow Bytes/s": np.random.normal(800000, 150000),
                "Label": "DoS Hulk",
            })
    return pd.DataFrame(rows)


# ─────────────────────────────────────────────────────────────────────────────
# SNIFFER + SOAR INIT
# ─────────────────────────────────────────────────────────────────────────────

def init_sniffer_and_soar():
    global sniffer, soar
    soar    = SOAREngine(socketio=socketio)
    sniffer = PacketSniffer(
        model=model,
        scaler=scaler,
        threshold=threshold,
        features=features,
        dataset=dataset,
        session_stats=session_stats,
        interval=STREAM_INTERVAL,
    )
    print("[MedGuard] ✓ Sniffer & SOAR initialised.")


# ─────────────────────────────────────────────────────────────────────────────
# STATS HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _compute_stats_payload() -> dict:
    total     = session_stats["total"]
    tp, fp    = session_stats["tp"], session_stats["fp"]
    fn        = session_stats["fn"]
    tn        = session_stats["tn"]
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy  = (tp + tn) / total if total > 0 else 0

    return {
        "session": {k: session_stats[k] for k in session_stats},
        "metrics": {
            "precision": round(precision * 100, 1),
            "recall":    round(recall    * 100, 1),
            "f1":        round(f1        * 100, 1),
            "accuracy":  round(accuracy  * 100, 1),
        },
        "model": {
            "precision": config["performance"]["precision"] * 100 if config else 96.4,
            "recall":    config["performance"]["recall"]    * 100 if config else 63.7,
            "f1":        config["performance"]["f1"]        * 100 if config else 76.7,
            "accuracy":  85.9,
            "threshold": round(threshold, 4) if threshold is not None else -0.0185,
            "features":  len(features) if features else 15,
            "tp_model":  18516,
            "fp_model":  684,
            "fn_model":  10568,
            "tn_model":  50232,
        },
        "streaming":  stream_active,
        "blacklist":  soar.get_blacklist() if soar else [],
        "isolation_count": len(soar.get_blacklist()) if soar else 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET BACKGROUND EMIT LOOP
# ─────────────────────────────────────────────────────────────────────────────

def _ws_emit_loop():
    """
    Background thread: polls sniffer, runs SOAR evaluation,
    pushes telemetry + periodic stats over WebSocket.
    """
    global stream_active
    stats_tick = 0

    while stream_active:
        # ── Pull next inference result from sniffer ────────────────────────
        entry = sniffer.get_next() if sniffer else None

        if entry:
            # SOAR evaluation
            isolation = soar.evaluate(entry) if soar else None

            # Persist to SQLite
            try:
                db.insert_telemetry(entry)
            except Exception as e:
                print(f"[emit] DB error: {e}")

            # Add to in-memory buffer (Phase 1 compat)
            log_buffer.append(entry)

            # Emit telemetry to all clients
            socketio.emit("telemetry", entry, namespace="/ws/telemetry")

        # ── Push stats every ~3 s ─────────────────────────────────────────
        stats_tick += 1
        if stats_tick >= int(3.0 / STREAM_INTERVAL):
            stats_tick = 0
            socketio.emit("stats_update", _compute_stats_payload(), namespace="/ws/telemetry")

        time.sleep(STREAM_INTERVAL)


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET EVENTS
# ─────────────────────────────────────────────────────────────────────────────

NS = "/ws/telemetry"


@socketio.on("connect", namespace=NS)
def ws_connect():
    print(f"[WS] Client connected: {request.sid}")
    # Send immediate snapshot on connect
    emit("stats_update", _compute_stats_payload())
    emit("history_snapshot", {
        "logs":       list(log_buffer),
        "streaming":  stream_active,
        "blacklist":  soar.get_blacklist() if soar else [],
        "isolations": db.get_isolation_history(),
    })


@socketio.on("disconnect", namespace=NS)
def ws_disconnect():
    print(f"[WS] Client disconnected: {request.sid}")


@socketio.on("stream_start", namespace=NS)
def ws_stream_start():
    global stream_active, emit_thread, session_stats
    if stream_active:
        emit("stream_status", {"status": "already_running"})
        return

    # Reset session
    for k in session_stats:
        session_stats[k] = 0
    log_buffer.clear()

    sniffer.start()
    stream_active = True

    emit_thread = threading.Thread(target=_ws_emit_loop, daemon=True, name="ws_emit")
    emit_thread.start()

    emit("stream_status", {"status": "started"})
    socketio.emit("stats_update", _compute_stats_payload(), namespace=NS)
    print("[WS] ▶ Stream started")


@socketio.on("stream_stop", namespace=NS)
def ws_stream_stop():
    global stream_active
    stream_active = False
    if sniffer:
        sniffer.stop()
    emit("stream_status", {"status": "stopped"})
    socketio.emit("stats_update", _compute_stats_payload(), namespace=NS)
    print("[WS] ■ Stream stopped")


@socketio.on("isolate_ip", namespace=NS)
def ws_isolate_ip(data):
    """Manual isolation request from the frontend triage panel."""
    ip = data.get("ip", "")
    if not ip or soar is None:
        emit("error", {"msg": "Invalid IP or SOAR not initialised"})
        return
    event = soar.isolate_ip_manual(ip)
    emit("isolation_event", event)


@socketio.on("unblock_ip", namespace=NS)
def ws_unblock_ip(data):
    """Manual unblock request from the frontend triage panel."""
    ip = data.get("ip", "")
    if soar and soar.unblock_ip(ip):
        socketio.emit("isolation_event", {"ip": ip, "status": "UNBLOCKED",
                                          "timestamp": datetime.now().strftime("%H:%M:%S")},
                      namespace=NS)
    else:
        emit("error", {"msg": f"{ip} not found in blacklist"})


# ─────────────────────────────────────────────────────────────────────────────
# REST ENDPOINTS — PHASE 1 (preserved)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    from sniffer import CAN_SNIFF
    return jsonify({
        "status":       "ok",
        "model_loaded": model is not None,
        "dataset_rows": len(dataset) if dataset is not None else 0,
        "streaming":    stream_active,
        "threshold":    round(threshold, 4) if threshold is not None else -0.0185,
        "can_sniff":    CAN_SNIFF,
        "phase":        2,
    })


@app.route("/api/stream/start")
def start_stream_rest():
    global stream_active, emit_thread
    if stream_active:
        return jsonify({"status": "already_running"})
    for k in session_stats:
        session_stats[k] = 0
    log_buffer.clear()
    sniffer.start()
    stream_active = True
    emit_thread = threading.Thread(target=_ws_emit_loop, daemon=True, name="ws_emit_rest")
    emit_thread.start()
    return jsonify({"status": "started"})


@app.route("/api/stream/stop")
def stop_stream_rest():
    global stream_active
    stream_active = False
    if sniffer:
        sniffer.stop()
    return jsonify({"status": "stopped"})


@app.route("/api/logs")
def get_logs():
    return jsonify({
        "logs":      list(log_buffer),
        "streaming": stream_active,
        "count":     len(log_buffer),
    })


@app.route("/api/logs/latest/<int:after_id>")
def get_logs_after(after_id):
    new_entries = [e for e in log_buffer if e["id"] > after_id]
    return jsonify({"logs": new_entries, "streaming": stream_active})


@app.route("/api/stats")
def get_stats():
    return jsonify(_compute_stats_payload())


@app.route("/api/scores/distribution")
def get_score_distribution():
    np.random.seed(42)
    benign_scores = np.random.normal(0.309, 0.105, 800).tolist()
    attack_scores = np.random.normal(0.062, 0.213, 500).tolist()
    live_scores   = [e["score"]       for e in log_buffer]
    live_labels   = [e["true_label"]  for e in log_buffer]
    return jsonify({
        "benign_scores": [round(s, 4) for s in benign_scores],
        "attack_scores": [round(s, 4) for s in attack_scores],
        "threshold":     round(threshold, 4) if threshold is not None else -0.0185,
        "live_scores":   live_scores,
        "live_labels":   live_labels,
        "benign_mean":   0.3090,
        "attack_mean":   0.0620,
        "benign_std":    0.1053,
        "attack_std":    0.2126,
    })


@app.route("/api/predict")
def predict():
    """Phase 1 compatibility — single prediction via dataset alternation."""
    global _predict_counter
    if dataset is None or len(dataset) == 0:
        return jsonify({"error": "dataset not loaded"}), 503

    with _predict_lock:
        _predict_counter += 1
        counter = _predict_counter

    use_attack  = (counter % 2 == 0)
    benign_pool = dataset[dataset["Label"] == "BENIGN"]
    attack_pool = dataset[dataset["Label"] != "BENIGN"]
    pool        = attack_pool if (use_attack and len(attack_pool) > 0) else benign_pool
    if len(pool) == 0:
        pool = dataset

    row        = pool.sample(1).iloc[0]
    true_label = str(row["Label"]).strip()
    entry      = sniffer._infer_row(row, true_label) if sniffer else {}
    log_buffer.append(entry)
    return jsonify(entry)


# ─────────────────────────────────────────────────────────────────────────────
# REST ENDPOINTS — PHASE 2 (new)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/history")
def get_history():
    """Return last 100 persisted telemetry rows from SQLite."""
    limit = int(request.args.get("limit", 100))
    rows  = db.get_recent_telemetry(limit)
    return jsonify({"logs": rows, "count": len(rows)})


@app.route("/api/isolations")
def get_isolations():
    """Return all isolation events from SQLite."""
    events = db.get_isolation_history()
    return jsonify({"events": events, "count": len(events)})


@app.route("/api/blacklist")
def get_blacklist():
    """Return current in-memory blacklist."""
    bl = soar.get_blacklist() if soar else []
    return jsonify({"blacklist": bl, "count": len(bl)})


@app.route("/api/isolate", methods=["POST"])
def manual_isolate():
    """Manually block an IP (from triage panel or REST client)."""
    data = request.get_json(force=True) or {}
    ip   = data.get("ip", "").strip()
    if not ip:
        return jsonify({"error": "ip required"}), 400
    event = soar.isolate_ip_manual(ip)
    return jsonify({"status": "isolated", "event": event})


@app.route("/api/unblock", methods=["POST"])
def manual_unblock():
    """Manually unblock an IP."""
    data = request.get_json(force=True) or {}
    ip   = data.get("ip", "").strip()
    if not ip:
        return jsonify({"error": "ip required"}), 400
    success = soar.unblock_ip(ip) if soar else False
    return jsonify({"status": "unblocked" if success else "not_found", "ip": ip})


@app.route("/api/twin/status")
def get_twin_status():
    """Returns simulated Digital Twin state for each hospital ward.
    Uses the existing in-memory log_buffer and soar blacklist to derive ward states.
    No new data structures needed — reads only from existing globals."""
    # Ward definitions matching frontend WardTopology.js
    ward_ids = ["ICU", "Emergency", "Pharmacy", "Oncology", "General Ward"]

    # Derive isolated wards from SOAR blacklist
    isolated_wards = set()
    if soar:
        for event in soar.get_blacklist():
            ward = event.get("ward", "General Ward")
            isolated_wards.add(ward)

    # Derive attacked wards from recent log buffer (last 30 entries)
    attack_counts = {}
    recent_logs = list(log_buffer)[-30:]
    for entry in recent_logs:
        if entry.get("verdict") == "ANOMALY":
            ward = entry.get("ward", "General Ward")
            attack_counts[ward] = attack_counts.get(ward, 0) + 1

    # Build per-ward status
    ward_status = []
    for ward_id in ward_ids:
        if ward_id in isolated_wards:
            state = "MICRO_ISOLATED"
        elif attack_counts.get(ward_id, 0) >= 2:
            state = "DESYNC_DETECTED"
        else:
            state = "SYNCED"
        ward_status.append({
            "ward":         ward_id,
            "state":        state,
            "attack_count": attack_counts.get(ward_id, 0),
            "is_isolated":  ward_id in isolated_wards,
            # Hardcoded baseline values from Monday CIC-IDS2017 training data
            "twin_baseline": {
                "expected_pkt_rate": 8.3,
                "expected_bytes_s":  4200,
                "expected_iat_ms":   120,
            }
        })

    return jsonify({
        "ward_status":     ward_status,
        "total_desyncs":   sum(1 for w in ward_status if w["state"] == "DESYNC_DETECTED"),
        "total_isolated":  len(isolated_wards),
        "streaming":       stream_active,
        "timestamp":       datetime.now().strftime("%H:%M:%S"),
    })


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────────────────

with app.app_context():
    db.init_db()
    load_model()
    load_dataset()
    init_sniffer_and_soar()

if __name__ == "__main__":
    print("[MedGuard] 🚀 Phase 2 server starting on port 5001…")
    socketio.run(app, debug=False, host="0.0.0.0", port=5001, allow_unsafe_werkzeug=True)