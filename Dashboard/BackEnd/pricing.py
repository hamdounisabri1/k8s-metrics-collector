"""
pricing.py
──────────
Persistent, thread-safe price store backed by SQLite.

Default prices (€ / unit / hour):
  cpu_core_price_per_hour   = 0.048   → price for 1 vCPU-core during 1 h
  ram_gb_price_per_hour     = 0.006   → price for 1 GB RAM  during 1 h
  storage_gb_price_per_hour = 0.0001  → price for 1 GB disk  during 1 h

All prices are stored with full audit history so the Angular dashboard can
show "who changed what and when".
"""

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────
DB_PATH = Path("/data/pricing.db")          # override via PRICING_DB env-var
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Default prices in € per unit per hour
DEFAULTS: dict[str, float] = {
    "cpu_core_price_per_hour":   0.048,
    "ram_gb_price_per_hour":     0.006,
    "storage_gb_price_per_hour": 0.0001,
}

_lock = threading.Lock()


# ── DB bootstrap ───────────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _bootstrap() -> None:
    """Create tables and seed defaults if the DB is fresh."""
    with _lock:
        conn = _get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS prices (
                key        TEXT PRIMARY KEY,
                value      REAL NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT 'system'
            );

            CREATE TABLE IF NOT EXISTS prices_history (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                key        TEXT    NOT NULL,
                old_value  REAL,
                new_value  REAL    NOT NULL,
                changed_at TEXT    NOT NULL,
                changed_by TEXT    NOT NULL DEFAULT 'system',
                reason     TEXT
            );
        """)

        # Seed defaults only for keys that don't exist yet
        now = datetime.utcnow().isoformat()
        for key, value in DEFAULTS.items():
            conn.execute(
                """
                INSERT OR IGNORE INTO prices (key, value, updated_at, updated_by)
                VALUES (?, ?, ?, 'system')
                """,
                (key, value, now),
            )
        conn.commit()
        conn.close()


_bootstrap()


# ── Public API ─────────────────────────────────────────────────────────────────

def get_prices() -> dict[str, float]:
    """Return all current prices as {key: value}."""
    with _lock:
        conn = _get_conn()
        rows = conn.execute("SELECT key, value FROM prices").fetchall()
        conn.close()
    return {r["key"]: r["value"] for r in rows}


def get_price(key: str) -> Optional[float]:
    """Return a single price value, or None if the key doesn't exist."""
    with _lock:
        conn = _get_conn()
        row = conn.execute(
            "SELECT value FROM prices WHERE key = ?", (key,)
        ).fetchone()
        conn.close()
    return row["value"] if row else None


def set_price(key: str, new_value: float, updated_by: str = "api", reason: Optional[str] = None) -> dict:
    """
    Update a price and record the change in the audit history.
    Returns the updated price record.
    Raises ValueError if the key is unknown or value is negative.
    """
    if key not in DEFAULTS:
        raise ValueError(f"Unknown price key '{key}'. Valid keys: {list(DEFAULTS)}")
    if new_value < 0:
        raise ValueError("Price must be >= 0")

    now = datetime.utcnow().isoformat()
    with _lock:
        conn = _get_conn()
        old_row = conn.execute(
            "SELECT value FROM prices WHERE key = ?", (key,)
        ).fetchone()
        old_value = old_row["value"] if old_row else None

        conn.execute(
            """
            INSERT INTO prices (key, value, updated_at, updated_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value      = excluded.value,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (key, new_value, now, updated_by),
        )
        conn.execute(
            """
            INSERT INTO prices_history (key, old_value, new_value, changed_at, changed_by, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (key, old_value, new_value, now, updated_by, reason),
        )
        conn.commit()
        conn.close()

    return {
        "key":        key,
        "value":      new_value,
        "updated_at": now,
        "updated_by": updated_by,
    }


def get_history(key: Optional[str] = None, limit: int = 100) -> list[dict]:
    """
    Return audit history for all keys, or a single key.
    Most recent changes first.
    """
    with _lock:
        conn = _get_conn()
        if key:
            rows = conn.execute(
                """
                SELECT id, key, old_value, new_value, changed_at, changed_by, reason
                FROM prices_history
                WHERE key = ?
                ORDER BY id DESC LIMIT ?
                """,
                (key, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, key, old_value, new_value, changed_at, changed_by, reason
                FROM prices_history
                ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        conn.close()

    return [dict(r) for r in rows]


def reset_to_defaults(updated_by: str = "api") -> dict[str, float]:
    """Reset all prices to their default values."""
    for key, value in DEFAULTS.items():
        set_price(key, value, updated_by=updated_by, reason="reset to defaults")
    return get_prices()


# ── Cost calculation helpers ───────────────────────────────────────────────────

def compute_cost(
    cpu_cores: float,
    ram_gb: float,
    storage_gb: float,
    hours: float = 1.0,
) -> dict[str, float]:
    """
    Calculate cost in € for given resource amounts over `hours` hours.

    Returns:
        {
          cpu_cost      : float,   # € for cpu
          ram_cost      : float,   # € for ram
          storage_cost  : float,   # € for storage
          total_cost    : float,   # sum of above
          hours         : float,   # the duration used
        }
    """
    p = get_prices()
    cpu_cost     = cpu_cores  * p["cpu_core_price_per_hour"]   * hours
    ram_cost     = ram_gb     * p["ram_gb_price_per_hour"]     * hours
    storage_cost = storage_gb * p["storage_gb_price_per_hour"] * hours
    total        = cpu_cost + ram_cost + storage_cost

    return {
        "cpu_cost":     round(cpu_cost,     6),
        "ram_cost":     round(ram_cost,     6),
        "storage_cost": round(storage_cost, 6),
        "total_cost":   round(total,        6),
        "hours":        hours,
    }