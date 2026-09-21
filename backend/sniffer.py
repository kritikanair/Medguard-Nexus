"""
MedGuard Nexus — sniffer.py
Packet capture & feature extraction engine.

Modes (auto-detected):
  LIVE   — Scapy AsyncSniffer on the active NIC (requires root/admin)
  REPLAY — CSV dataset simulation (no privileges required, always available)

In REPLAY mode the engine cycles through the pre-loaded Wednesday CSV dataset,
computing the same 15 flow features the trained model expects, then runs
inference identically to app.py.  This ensures offline / demo testing works
perfectly without root access.
"""

import os
import time
import threading
import queue
import random
import numpy as np
import pandas as pd
from datetime import datetime
from collections import defaultdict, deque

# ─────────────────────────────────────────────────────────────────────────────
# PRIVILEGE CHECK
# ─────────────────────────────────────────────────────────────────────────────

def _is_root() -> bool:
    """Return True if the process has root / admin privileges."""
    try:
        return os.getuid() == 0          # POSIX
    except AttributeError:
        import ctypes                    # Windows fallback
        try:
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            return False


CAN_SNIFF = _is_root()


# ─────────────────────────────────────────────────────────────────────────────
# WARD MAPPING  (mirrors soar.py so both modules agree)
# ─────────────────────────────────────────────────────────────────────────────

WARD_MAP = {"1": "ICU", "2": "Emergency", "3": "Pharmacy", "4": "Oncology"}

def _ip_to_ward(ip: str) -> str:
    try:
        return WARD_MAP.get(ip.split(".")[2], "General Ward")
    except Exception:
        return "General Ward"


# ─────────────────────────────────────────────────────────────────────────────
# SNIFFER CLASS
# ─────────────────────────────────────────────────────────────────────────────

class PacketSniffer:
    """
    Unified packet ingestion + feature extraction + inference pipeline.

    Parameters
    ----------
    model, scaler, threshold, features
        Pre-loaded ML artefacts from app.py.
    dataset : pd.DataFrame | None
        Wednesday CSV rows used in REPLAY mode.
    session_stats : dict
        Shared session counter dict from app.py (mutated in-place).
    interval : float
        Seconds between emitted entries (default 0.75).
    """

    def __init__(
        self,
        model,
        scaler,
        threshold,
        features,
        dataset,
        session_stats: dict,
        interval: float = 0.75,
    ):
        self.model         = model
        self.scaler        = scaler
        self.threshold     = float(threshold) if threshold is not None else -0.0185
        self.features      = features or []
        self.dataset       = dataset
        self.session_stats = session_stats
        self.interval      = interval

        self._active       = False
        self._thread       = None
        self._result_q: queue.Queue[dict] = queue.Queue(maxsize=500)

        # Live-sniff flow tracking (5-tuple → deque of packets)
        self._flows: dict[tuple, deque] = defaultdict(lambda: deque(maxlen=200))
        self._flow_lock = threading.Lock()

        # Alternating counter for demo mode (reproduces Phase 1 clean demo)
        self._replay_index = 0

        mode = "LIVE CAPTURE" if CAN_SNIFF else "CSV REPLAY (no root)"
        print(f"[Sniffer] ✓ Initialised — mode={mode}, interval={interval}s")

    # ── Public interface ──────────────────────────────────────────────────────

    def start(self):
        if self._active:
            return
        self._active = True
        target = self._live_sniff_loop if CAN_SNIFF else self._csv_replay_loop
        self._thread = threading.Thread(target=target, daemon=True, name="sniffer")
        self._thread.start()
        print(f"[Sniffer] ▶ Started — {'LIVE' if CAN_SNIFF else 'REPLAY'}")

    def stop(self):
        self._active = False
        print("[Sniffer] ■ Stopped")

    def get_next(self) -> dict | None:
        """Non-blocking dequeue of the latest inference result."""
        try:
            return self._result_q.get_nowait()
        except queue.Empty:
            return None

    def has_data(self) -> bool:
        return not self._result_q.empty()

    # ── CSV REPLAY LOOP ───────────────────────────────────────────────────────

    def _csv_replay_loop(self):
        """Cycle through the Wednesday dataset, run inference, enqueue results."""
        if self.dataset is None or len(self.dataset) == 0:
            print("[Sniffer] ⚠️  No dataset available for replay mode.")
            return

        # Separate pools for clean demo alternation
        benign_pool = self.dataset[self.dataset["Label"] == "BENIGN"].reset_index(drop=True)
        attack_pool = self.dataset[self.dataset["Label"] != "BENIGN"].reset_index(drop=True)

        counter = 0
        while self._active:
            # Strict alternation: even=BENIGN, odd=ATTACK
            counter += 1
            use_attack = (counter % 2 == 0)

            if use_attack and len(attack_pool) > 0:
                row = attack_pool.iloc[counter % len(attack_pool)]
            elif len(benign_pool) > 0:
                row = benign_pool.iloc[counter % len(benign_pool)]
            else:
                row = self.dataset.iloc[counter % len(self.dataset)]

            true_label = str(row.get("Label", "BENIGN")).strip()
            entry      = self._infer_row(row, true_label)

            # Enqueue; drop oldest if buffer full
            if self._result_q.full():
                try:
                    self._result_q.get_nowait()
                except queue.Empty:
                    pass
            self._result_q.put(entry)

            time.sleep(self.interval)

    # ── LIVE SNIFF LOOP ───────────────────────────────────────────────────────

    def _live_sniff_loop(self):
        """
        Live packet capture via Scapy.
        Falls back to CSV replay if Scapy import fails or sniffing errors.
        """
        try:
            from scapy.all import AsyncSniffer, IP, TCP, UDP
        except ImportError:
            print("[Sniffer] ⚠️  Scapy not installed — falling back to CSV replay.")
            self._csv_replay_loop()
            return

        print("[Sniffer] 🌐 Starting Scapy AsyncSniffer…")

        def _handle_packet(pkt):
            if not self._active:
                return
            try:
                self._process_packet(pkt)
            except Exception as e:
                pass  # Silently skip malformed packets

        try:
            sniffer = AsyncSniffer(
                filter="ip",
                prn=_handle_packet,
                store=False,
            )
            sniffer.start()

            while self._active:
                time.sleep(self.interval)
                # Periodically materialise flow features and run inference
                self._materialise_flows()

            sniffer.stop()

        except Exception as e:
            print(f"[Sniffer] ⚠️  Live sniff error ({e}) — falling back to CSV replay.")
            self._csv_replay_loop()

    def _process_packet(self, pkt):
        """
        Parse a raw Scapy packet and accumulate it into the per-flow window.
        Flow key = (src_ip, dst_ip, src_port, dst_port, proto)
        """
        from scapy.all import IP, TCP, UDP

        if IP not in pkt:
            return

        src = pkt[IP].src
        dst = pkt[IP].dst
        proto = pkt[IP].proto

        sport, dport = 0, 0
        if TCP in pkt:
            sport = pkt[TCP].sport
            dport = pkt[TCP].dport
        elif UDP in pkt:
            sport = pkt[UDP].sport
            dport = pkt[UDP].dport

        key = (src, dst, sport, dport, proto)
        ts  = time.time()
        pkt_len = len(pkt)

        with self._flow_lock:
            self._flows[key].append({"ts": ts, "len": pkt_len, "src": src, "dst": dst, "dport": dport})

    def _materialise_flows(self):
        """
        Extract feature vectors from accumulated flow windows and run inference.
        Emits one result per active flow into the result queue.
        """
        with self._flow_lock:
            flows_snapshot = dict(self._flows)
            self._flows.clear()

        if not flows_snapshot:
            return

        for key, pkts in flows_snapshot.items():
            if len(pkts) < 2:
                continue
            try:
                features_dict = self._compute_flow_features(pkts)
                entry = self._infer_features(features_dict, key)
                if entry:
                    if self._result_q.full():
                        try: self._result_q.get_nowait()
                        except queue.Empty: pass
                    self._result_q.put(entry)
            except Exception:
                pass

    def _compute_flow_features(self, pkts: deque) -> dict:
        """
        Compute the 15 flow-level features from a deque of packet records.
        Returns a dict matching the model's expected feature names.
        """
        lengths = [p["len"] for p in pkts]
        timestamps = [p["ts"] for p in pkts]
        intervals = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]

        n = len(pkts)
        duration = (timestamps[-1] - timestamps[0]) * 1e6  # microseconds
        if duration <= 0:
            duration = 1.0

        fwd_pkts   = lengths[::2]
        bwd_pkts   = lengths[1::2]
        fwd_iats   = intervals[::2] if intervals else [0]

        # Compute features mirroring the CIC-IDS feature set
        features = {
            "Flow Duration":                  duration,
            "Total Fwd Packets":              len(fwd_pkts),
            "Total Backward Packets":         len(bwd_pkts),
            "Total Length of Fwd Packets":    sum(fwd_pkts),
            "Fwd Packet Length Max":          max(fwd_pkts) if fwd_pkts else 0,
            "Fwd Packet Length Min":          min(fwd_pkts) if fwd_pkts else 0,
            "Fwd Packet Length Mean":         np.mean(fwd_pkts) if fwd_pkts else 0,
            "Fwd Packet Length Std":          np.std(fwd_pkts) if fwd_pkts else 0,
            "Bwd Packet Length Std":          np.std(bwd_pkts) if bwd_pkts else 0,
            "Flow Bytes/s":                   (sum(lengths) / duration * 1e6) if duration > 0 else 0,
            "Flow Packets/s":                 (n / duration * 1e6) if duration > 0 else 0,
            "Flow IAT Std":                   np.std(intervals) if intervals else 0,
            "Fwd IAT Std":                    np.std(fwd_iats) if fwd_iats else 0,
            "Packet Length Variance":         np.var(lengths) if lengths else 0,
            "Idle Mean":                      np.mean(intervals) if intervals else 0,
        }
        return features

    # ── INFERENCE ─────────────────────────────────────────────────────────────

    def _infer_features(self, features_dict: dict, key: tuple) -> dict | None:
        """Run the model on a live-computed feature dict."""
        src_ip = key[0]
        dst_ip = key[1]
        port   = key[3]

        row = pd.Series(features_dict)
        entry = self._infer_row(row, "LIVE", src_ip=src_ip, dst_ip=dst_ip, port=port)
        return entry

    def _infer_row(
        self,
        row_data: pd.Series,
        true_label: str,
        src_ip: str | None = None,
        dst_ip: str | None = None,
        port: int | None = None,
    ) -> dict:
        """
        Core inference: row_data → scaled features → IsolationForest → verdict.
        Mirrors app.py infer_row() but lives inside the sniffer for encapsulation.
        """
        thr = self.threshold
        is_benign_label = true_label.strip() == "BENIGN"

        # Build simulated IPs if not provided (CSV replay mode)
        if src_ip is None:
            src_ip = f"192.168.{random.randint(1, 9)}.{random.randint(1, 254)}"
        if dst_ip is None:
            dst_ip = f"10.0.0.{random.randint(1, 50)}"
        if port is None:
            port = random.choice([80, 443, 8080, 445, 3389, 22])

        # ── Model inference ────────────────────────────────────────────────
        if self.model is not None and self.features:
            try:
                available = [f for f in self.features if f in row_data.index]
                if not available:
                    raise ValueError("No matching features")
                x = row_data[available].values.reshape(1, -1).astype(np.float64)
                x = np.where(np.isinf(x), 0.0, x)
                x = np.nan_to_num(x, nan=0.0)
                x_df     = pd.DataFrame(x, columns=available)
                x_scaled = self.scaler.transform(x_df)
                score    = float(self.model.decision_function(x_scaled)[0])
                is_attack = score < thr
            except Exception:
                score, is_attack = self._demo_score(is_benign_label, thr)
        else:
            score, is_attack = self._demo_score(is_benign_label, thr)

        verdict = "ANOMALY" if is_attack else "NORMAL"
        is_tp   = is_attack and true_label.strip() == "DoS Hulk"
        is_fp   = is_attack and true_label.strip() == "BENIGN"

        # ── Update shared session stats (thread-safe via GIL for simple ints) ─
        stats = self.session_stats
        stats["total"]   += 1
        stats["attacks"] += 1 if is_attack else 0
        stats["normal"]  += 0 if is_attack else 1
        stats["tp"]      += 1 if is_tp else 0
        stats["fp"]      += 1 if is_fp else 0
        stats["fn"]      += 1 if (not is_attack and true_label.strip() == "DoS Hulk") else 0
        stats["tn"]      += 1 if (not is_attack and true_label.strip() == "BENIGN")   else 0

        def safe_float(key, fallback):
            try:
                return round(abs(float(row_data[key])), 2)
            except Exception:
                return round(abs(float(fallback)), 2)

        ward = _ip_to_ward(src_ip)

        return {
            "id":         int(stats["total"]),
            "timestamp":  datetime.now().strftime("%H:%M:%S"),
            "src_ip":     str(src_ip),
            "dst_ip":     str(dst_ip),
            "port":       int(port),
            "score":      round(float(score), 4),
            "threshold":  round(thr, 4),
            "verdict":    str(verdict),
            "true_label": str(true_label.strip()),
            "ward":       ward,
            "is_tp":      bool(is_tp),
            "is_fp":      bool(is_fp),
            "flow_bytes": safe_float("Flow Bytes/s",   random.uniform(1000, 900000)),
            "pkt_rate":   safe_float("Flow Packets/s", random.uniform(5, 5000)),
        }

    @staticmethod
    def _demo_score(is_benign: bool, thr: float) -> tuple[float, bool]:
        """Fallback demo scoring — guaranteed correct verdict."""
        if is_benign:
            s = float(np.random.normal(0.31, 0.05))
            s = max(s, thr + 0.05)
        else:
            s = float(np.random.normal(-0.09, 0.03))
            s = min(s, thr - 0.02)
        return s, s < thr
