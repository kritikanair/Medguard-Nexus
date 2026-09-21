"""
MedGuard Nexus — database.py
Thread-safe SQLite persistence layer.
Tables:
  • telemetry_logs    — every network flow inference result
  • isolation_events  — SOAR-triggered or manual IP containment records
"""

import sqlite3
import threading
import os
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "medguard_nexus.db")

# One lock to serialise writes; reads use their own connections (thread-local)
_write_lock = threading.Lock()
_local = threading.local()


# ─────────────────────────────────────────────────────────────────────────────
# CONNECTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    """Return a thread-local read connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")  # concurrent read+write
        _local.conn = conn
    return _local.conn


def _write_conn() -> sqlite3.Connection:
    """Return a fresh connection for a write transaction."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─────────────────────────────────────────────────────────────────────────────
# INITIALISATION
# ─────────────────────────────────────────────────────────────────────────────

def init_db():
    """Create tables if they do not exist. Called once at startup."""
    with _write_lock, _write_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS telemetry_logs (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp     TEXT    NOT NULL,
                src_ip        TEXT,
                dst_ip        TEXT,
                port          INTEGER,
                anomaly_score REAL,
                verdict       TEXT,
                true_label    TEXT,
                ward          TEXT,
                flow_bytes    REAL,
                pkt_rate      REAL
            );

            CREATE TABLE IF NOT EXISTS isolation_events (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp     TEXT    NOT NULL,
                ip_address    TEXT    NOT NULL,
                target_ward   TEXT,
                attack_type   TEXT,
                trigger_score REAL,
                status        TEXT    DEFAULT 'ACTIVE',
                unblocked_at  TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_tel_verdict
                ON telemetry_logs (verdict);
            CREATE INDEX IF NOT EXISTS idx_iso_ip
                ON isolation_events (ip_address);
        """)
    print(f"[DB] ✓ Database initialised at {DB_PATH}")


# ─────────────────────────────────────────────────────────────────────────────
# TELEMETRY WRITES
# ─────────────────────────────────────────────────────────────────────────────

def insert_telemetry(entry: dict):
    """Persist one inference result. Non-blocking — called from stream thread."""
    sql = """
        INSERT INTO telemetry_logs
            (timestamp, src_ip, dst_ip, port, anomaly_score,
             verdict, true_label, ward, flow_bytes, pkt_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    vals = (
        entry.get("timestamp"),
        entry.get("src_ip"),
        entry.get("dst_ip"),
        entry.get("port"),
        entry.get("score"),
        entry.get("verdict"),
        entry.get("true_label"),
        entry.get("ward"),
        entry.get("flow_bytes"),
        entry.get("pkt_rate"),
    )
    with _write_lock, _write_conn() as conn:
        conn.execute(sql, vals)
        conn.commit()


def get_recent_telemetry(limit: int = 100) -> list[dict]:
    """Fetch the last `limit` telemetry rows (newest first)."""
    sql = """
        SELECT * FROM telemetry_logs
        ORDER BY id DESC
        LIMIT ?
    """
    conn = _get_conn()
    rows = conn.execute(sql, (limit,)).fetchall()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# ISOLATION WRITES
# ─────────────────────────────────────────────────────────────────────────────

def insert_isolation(event: dict):
    """Persist a new SOAR containment action."""
    sql = """
        INSERT INTO isolation_events
            (timestamp, ip_address, target_ward, attack_type,
             trigger_score, status)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    """
    vals = (
        event.get("timestamp", datetime.now().strftime("%H:%M:%S")),
        event.get("ip"),
        event.get("ward"),
        event.get("attack_type", "DoS Hulk"),
        event.get("score"),
    )
    with _write_lock, _write_conn() as conn:
        conn.execute(sql, vals)
        conn.commit()


def update_isolation_status(ip: str, status: str):
    """Mark an isolation event resolved (e.g., 'UNBLOCKED')."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status == "UNBLOCKED" else None
    sql = """
        UPDATE isolation_events
        SET status = ?, unblocked_at = ?
        WHERE ip_address = ? AND status = 'ACTIVE'
    """
    with _write_lock, _write_conn() as conn:
        conn.execute(sql, (status, ts, ip))
        conn.commit()


def get_isolation_history() -> list[dict]:
    """Fetch all isolation events, newest first."""
    sql = "SELECT * FROM isolation_events ORDER BY id DESC"
    conn = _get_conn()
    rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]
