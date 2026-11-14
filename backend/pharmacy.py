"""MedInventory: onboard pharmacy in SQLite with radiation-adjusted expiry.

effective_expiry = label_expiry - radiation_load_days * radiation_factor
radiation_load_days = cumulative mission dose / nominal daily dose (1.8 mSv/day), so it equals
days_in_mission on a quiet trip and grows faster during a solar particle event.
radiation_factor is OUR ASSUMPTION per drug (0 = stable, 1 = loses a day of shelf life per mission day),
motivated by NASA ISS medication stability findings (Du et al., AAPS Journal 2011).
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

import os
# Vercel's code directory is read-only; /tmp is the writable scratch space there.
DB = Path("/tmp/vitalorbit.db") if os.environ.get("VERCEL") else Path(__file__).parent / "vitalorbit.db"
TODAY = date(2026, 11, 13)   # mission calendar "today" (fixed so the demo is reproducible)

# name, category, form, qty, min_qty, label expiry, radiation_factor, used for (keywords)
SEED = [
    ("Ibuprofen 400 mg", "Pain / inflammation", "tablet", 6, 20, "2028-02-01", 0.2, "pain headache muscle back fever inflammation"),
    ("Acetaminophen 500 mg", "Pain / fever", "tablet", 48, 20, "2027-12-01", 0.2, "pain headache fever"),
    ("Promethazine 25 mg", "Nausea / motion sickness", "injection", 8, 4, "2027-03-01", 0.6, "nausea vomiting motion sickness"),
    ("Ondansetron 4 mg", "Nausea", "ODT tablet", 14, 6, "2027-10-01", 0.3, "nausea vomiting"),
    ("Meclizine 25 mg", "Motion sickness / dizziness", "tablet", 18, 8, "2027-11-01", 0.3, "dizziness vertigo motion sickness"),
    ("Oral rehydration salts", "Fluids / electrolytes", "sachet", 30, 10, "2028-06-01", 0.1, "dehydration dizziness tachycardia fever diarrhea palpitations"),
    ("Zolpidem 5 mg", "Sleep", "tablet", 0, 10, "2027-09-01", 0.4, "sleep insomnia"),
    ("Melatonin 3 mg", "Sleep / circadian", "tablet", 40, 10, "2027-08-01", 0.5, "sleep insomnia circadian"),
    ("Loratadine 10 mg", "Allergy", "tablet", 22, 8, "2028-01-01", 0.2, "allergy rash congestion itch"),
    ("Pseudoephedrine 60 mg", "Congestion", "tablet", 16, 8, "2027-07-01", 0.4, "congestion sinus head pressure"),
    ("Epinephrine 0.3 mg auto-injector", "Anaphylaxis", "auto-injector", 3, 2, "2027-06-01", 0.7, "anaphylaxis allergy severe breathing"),
    ("Aspirin 325 mg", "Cardiac emergency", "chewable tablet", 12, 6, "2027-12-01", 0.3, "chest pain cardiac"),
    ("Metoprolol 25 mg", "Heart rate control (CMO only)", "tablet", 10, 6, "2027-09-15", 0.5, "tachycardia palpitations"),
    ("Amoxicillin-clavulanate 875 mg", "Antibiotic", "tablet", 20, 10, "2027-02-20", 0.8, "infection wound fever"),
    ("Ciprofloxacin 500 mg", "Antibiotic", "tablet", 14, 10, "2027-11-01", 0.4, "infection urinary diarrhea"),
    ("Loperamide 2 mg", "Diarrhea", "capsule", 24, 8, "2028-03-01", 0.2, "diarrhea"),
    ("Silver sulfadiazine 1 % cream", "Burns", "cream", 3, 2, "2027-05-01", 0.5, "burn wound"),
    ("Lidocaine 2 %", "Local anesthetic", "injection", 6, 4, "2027-08-01", 0.4, "wound cut suture pain"),
    ("Artificial tears", "Eye care (SANS / dry eye)", "drops", 9, 6, "2027-04-01", 0.4, "eye vision dry irritation blurry"),
    ("Dexamethasone 4 mg", "Steroid / swelling", "tablet", 10, 6, "2027-10-01", 0.4, "swelling allergy altitude edema"),
]

# Label dates are set for a crew dose of ~520 mSv (mission day ~432): one item expired by radiation, one expiring soon
SHIFT_DAYS = 200
_SPECIAL = {"Amoxicillin-clavulanate 875 mg": "2027-06-17", "Promethazine 25 mg": "2027-05-28"}
SEED = [r[:5] + (_SPECIAL.get(r[0]) or (date.fromisoformat(r[5]) + timedelta(days=SHIFT_DAYS)).isoformat(),) + r[6:] for r in SEED]

COLS = "id, name, category, form, qty, min_qty, expiry, radiation_factor, used_for"


def conn():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS medicine (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, form TEXT, qty INTEGER, min_qty INTEGER,
            expiry TEXT, radiation_factor REAL, used_for TEXT)""")
        if c.execute("SELECT COUNT(*) FROM medicine").fetchone()[0] == 0:
            c.executemany(f"INSERT INTO medicine ({COLS.replace('id, ', '')}) VALUES (?,?,?,?,?,?,?,?)", SEED)


def reset():
    with conn() as c:
        c.execute("DROP TABLE IF EXISTS medicine")
    init()


def enrich(row: dict, dose_msv: float, nominal_rate: float = 1.8) -> dict:
    load_days = dose_msv / nominal_rate
    label = date.fromisoformat(row["expiry"])
    eff = label - timedelta(days=round(load_days * row["radiation_factor"]))
    days_left = (eff - TODAY).days
    label_ok = label > TODAY
    if row["qty"] <= 0:
        status = "out"
    elif days_left < 0:
        status = "expired_radiation" if label_ok else "expired"
    elif days_left < 30:
        status = "expiring"
    elif row["qty"] < row["min_qty"]:
        status = "low"
    else:
        status = "ok"
    return dict(row, effective_expiry=eff.isoformat(), days_left=days_left,
                days_lost_to_radiation=(label - eff).days, label_valid=label_ok,
                low_stock=row["qty"] < row["min_qty"], status=status,
                usable=row["qty"] > 0 and days_left >= 0)


def list_all(dose_msv: float):
    with conn() as c:
        rows = [dict(r) for r in c.execute(f"SELECT {COLS} FROM medicine ORDER BY name")]
    return [enrich(r, dose_msv) for r in rows]


def get(mid: int, dose_msv: float):
    with conn() as c:
        r = c.execute(f"SELECT {COLS} FROM medicine WHERE id=?", (mid,)).fetchone()
    return enrich(dict(r), dose_msv) if r else None


def upsert(data: dict, mid: int | None = None):
    fields = ["name", "category", "form", "qty", "min_qty", "expiry", "radiation_factor", "used_for"]
    vals = [data.get(f) for f in fields]
    with conn() as c:
        if mid is None:
            cur = c.execute(f"INSERT INTO medicine ({', '.join(fields)}) VALUES ({','.join('?' * len(fields))})", vals)
            return cur.lastrowid
        c.execute(f"UPDATE medicine SET {', '.join(f + '=?' for f in fields)} WHERE id=?", vals + [mid])
        return mid


def delete(mid: int):
    with conn() as c:
        c.execute("DELETE FROM medicine WHERE id=?", (mid,))


def dispense(mid: int, n: int = 1):
    with conn() as c:
        c.execute("UPDATE medicine SET qty = MAX(0, qty - ?) WHERE id=?", (n, mid))


def find(name: str, dose_msv: float):
    """Fuzzy match a drug name the assistant suggested against what is on board."""
    q = name.lower().split()[0] if name.strip() else ""
    for m in list_all(dose_msv):
        if q and (q in m["name"].lower() or m["name"].lower().split()[0] in name.lower()):
            return m
    return None
