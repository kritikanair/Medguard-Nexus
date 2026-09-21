"""
MedGuard Nexus — soar.py
Security Orchestration, Automation & Response engine.

Triggered every time an inference result is below the anomaly threshold.
Supports:
  • In-memory + JSON blacklist (always active — safe, cross-platform)
  • iptables rules   (Linux, requires root)
  • pfctl rules      (macOS, requires root)

Ward mapping (src_ip 3rd octet → hospital department):
  1  → ICU
  2  → Emergency
  3  → Pharmacy
  4  → Oncology
  5+ → General Ward
"""

import os
import json
import subprocess
import threading
import platform
from datetime import datetime

import database as db

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

BLACKLIST_PATH = os.environ.get("BLACKLIST_PATH", "soar_blacklist.json")
ENABLE_FIREWALL = os.environ.get("ENABLE_FIREWALL", "false").lower() == "true"

# Minimum consecutive anomalies from same IP before auto-isolation
AUTO_ISOLATE_THRESHOLD = int(os.environ.get("AUTO_ISOLATE_THRESHOLD", "3"))

WARD_MAP = {
    "1": "ICU",
    "2": "Emergency",
    "3": "Pharmacy",
    "4": "Oncology",
}


def _ip_to_ward(ip: str) -> str:
    """Derive hospital ward from the 3rd octet of a simulated src_ip."""
    try:
        octet = ip.split(".")[2]
        return WARD_MAP.get(octet, "General Ward")
    except Exception:
        return "General Ward"


# ─────────────────────────────────────────────────────────────────────────────
# SOAR ENGINE
# ─────────────────────────────────────────────────────────────────────────────

class SOAREngine:
    """
    Monitors inference results and automatically isolates offending IPs
    when the anomaly count from that IP exceeds AUTO_ISOLATE_THRESHOLD.

    Thread-safe: uses a single internal lock.
    """

    def __init__(self, socketio=None):
        self._socketio   = socketio          # Flask-SocketIO instance
        self._lock       = threading.Lock()
        self._blacklist: dict[str, dict] = {}  # ip → event metadata
        self._ip_strike_counter: dict[str, int] = {}  # ip → consecutive anomalies
        self._system     = platform.system()  # 'Linux', 'Darwin', 'Windows'
        self._load_blacklist()
        print(f"[SOAR] ✓ Engine initialised. Platform={self._system}, "
              f"Firewall={'ENABLED' if ENABLE_FIREWALL else 'BLACKLIST ONLY'}")

    # ── Blacklist persistence ──────────────────────────────────────────────

    def _load_blacklist(self):
        """Load persisted blacklist from disk on startup."""
        if os.path.exists(BLACKLIST_PATH):
            try:
                with open(BLACKLIST_PATH) as f:
                    self._blacklist = json.load(f)
                print(f"[SOAR] Loaded {len(self._blacklist)} blocked IPs from disk.")
            except Exception as e:
                print(f"[SOAR] ⚠️  Could not load blacklist: {e}")

    def _save_blacklist(self):
        """Persist current blacklist to disk (called under lock)."""
        try:
            with open(BLACKLIST_PATH, "w") as f:
                json.dump(self._blacklist, f, indent=2)
        except Exception as e:
            print(f"[SOAR] ⚠️  Could not save blacklist: {e}")

    # ── Main evaluation ──────────────────────────────────────────────────────

    def evaluate(self, entry: dict) -> dict | None:
        """
        Called for every inference result.
        Returns an isolation event dict if a new isolation was triggered,
        otherwise returns None.
        """
        ip      = entry.get("src_ip", "")
        verdict = entry.get("verdict", "NORMAL")

        with self._lock:
            if verdict == "ANOMALY":
                self._ip_strike_counter[ip] = self._ip_strike_counter.get(ip, 0) + 1
                count = self._ip_strike_counter[ip]

                if count >= AUTO_ISOLATE_THRESHOLD and not self.is_blocked(ip):
                    return self._isolate_ip(
                        ip=ip,
                        score=entry.get("score", 0),
                        attack_type=entry.get("true_label", "DoS Hulk"),
                    )
            else:
                # Reset strike counter on clean traffic
                self._ip_strike_counter.pop(ip, None)

        return None

    # ── Isolation ─────────────────────────────────────────────────────────────

    def _isolate_ip(self, ip: str, score: float, attack_type: str) -> dict:
        """
        Block an IP address. Must be called under self._lock.
        Returns the isolation event dict.
        """
        ward = _ip_to_ward(ip)
        ts   = datetime.now().strftime("%H:%M:%S")

        event = {
            "ip":          ip,
            "ward":        ward,
            "attack_type": attack_type,
            "score":       score,
            "timestamp":   ts,
            "status":      "ACTIVE",
        }

        # Update in-memory blacklist
        self._blacklist[ip] = event
        self._save_blacklist()

        # Attempt OS-level firewall rule (optional, requires root)
        if ENABLE_FIREWALL:
            self._apply_firewall_rule(ip, action="block")

        # Persist to DB
        try:
            db.insert_isolation(event)
        except Exception as e:
            print(f"[SOAR] DB insert failed: {e}")

        # Emit WebSocket event to all connected clients
        self._emit_isolation(event)

        print(f"[SOAR] 🔴 ISOLATED: {ip} ({ward}) | score={score:.4f} | type={attack_type}")
        return event

    def isolate_ip_manual(self, ip: str) -> dict:
        """Manual isolation triggered via REST endpoint."""
        with self._lock:
            if self.is_blocked(ip):
                return self._blacklist[ip]
            return self._isolate_ip(ip=ip, score=0.0, attack_type="Manual Block")

    def unblock_ip(self, ip: str) -> bool:
        """Remove IP from blacklist and optionally remove firewall rule."""
        with self._lock:
            if ip not in self._blacklist:
                return False
            del self._blacklist[ip]
            self._ip_strike_counter.pop(ip, None)
            self._save_blacklist()

        if ENABLE_FIREWALL:
            self._apply_firewall_rule(ip, action="unblock")

        try:
            db.update_isolation_status(ip, "UNBLOCKED")
        except Exception as e:
            print(f"[SOAR] DB update failed: {e}")

        # Emit unblock event
        self._emit_isolation({"ip": ip, "status": "UNBLOCKED",
                               "timestamp": datetime.now().strftime("%H:%M:%S")})
        print(f"[SOAR] 🟢 UNBLOCKED: {ip}")
        return True

    def is_blocked(self, ip: str) -> bool:
        """Check if an IP is currently in the blacklist (must be called under lock or read-only)."""
        return ip in self._blacklist

    def get_blacklist(self) -> list[dict]:
        """Return current blacklist as a list of event dicts."""
        with self._lock:
            return list(self._blacklist.values())

    # ── Firewall helpers ──────────────────────────────────────────────────────

    def _apply_firewall_rule(self, ip: str, action: str):
        """
        Attempt OS-level firewall rule. Fails silently — always falls back
        to the in-memory blacklist which is the source of truth.
        """
        try:
            if self._system == "Linux":
                self._iptables(ip, action)
            elif self._system == "Darwin":
                self._pfctl(ip, action)
            else:
                print(f"[SOAR] Firewall not supported on {self._system}, using blacklist only.")
        except Exception as e:
            print(f"[SOAR] ⚠️  Firewall rule failed (continuing with blacklist): {e}")

    def _iptables(self, ip: str, action: str):
        """Linux iptables — requires sudo."""
        if action == "block":
            cmd = ["sudo", "iptables", "-I", "INPUT", "-s", ip, "-j", "DROP"]
        else:
            cmd = ["sudo", "iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print(f"[SOAR] iptables {action} applied for {ip}")
        else:
            raise RuntimeError(result.stderr)

    def _pfctl(self, ip: str, action: str):
        """
        macOS pfctl — requires sudo.
        Adds/removes IP from a persistent anchor table.
        """
        anchor = "medguard_nexus"
        if action == "block":
            cmd = f'echo "block drop from {ip} to any" | sudo pfctl -a {anchor} -f -'
        else:
            cmd = f"sudo pfctl -a {anchor} -F rules 2>/dev/null || true"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
        if result.returncode not in (0, 1):
            raise RuntimeError(result.stderr)
        print(f"[SOAR] pfctl {action} applied for {ip}")

    # ── WebSocket emission ────────────────────────────────────────────────────

    def _emit_isolation(self, event: dict):
        """Push isolation event to all connected WebSocket clients."""
        if self._socketio is None:
            return
        try:
            self._socketio.emit(
                "isolation_event",
                event,
                namespace="/ws/telemetry",
            )
        except Exception as e:
            print(f"[SOAR] WebSocket emit failed: {e}")
