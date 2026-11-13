"""VitalOrbit core: crew vitals, per-astronaut Isolation Forest, Health Score, Smart Alerts, comms with Earth.

Data provenance
- Heart rate, activity and sleep are REAL: 5-minute streams from 4 people in the public Fitbit dataset
  (Furberg et al., Zenodo 53894, CC-BY 4.0), replayed day by day as the 4 astronauts. See scripts/prepare_fitbit.py.
- SpO2, skin temperature, cabin environment and the emergency scenarios are SIMULATED (Fitbit does not record them).

Time model: one reading every 5 mission minutes; the live loop emits one per real second (1 s = 5 min).
"""
from __future__ import annotations

import math
import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

STEP_MIN = 5
PER_HOUR = 60 // STEP_MIN
SLOTS_PER_DAY = 1440 // STEP_MIN
HISTORY_DAYS = 14                          # each astronaut's model trains on 14 days of their own data
START_MET_MIN = 432 * 1440 + 6 * 60        # live stream starts at mission day 432 (Mars surface), 06:00
WEARABLE = Path(__file__).parent.parent / "data" / "fitbit" / "crew_wearable.csv.gz"

# Mission profile (conjunction-class Mars mission)
ARRIVE_MARS_DAY, LEAVE_MARS_DAY, MISSION_END_DAY = 210, 710, 920
DOSE_TRANSIT = 1.8    # mSv/day, Curiosity RAD in cruise (Zeitlin et al., Science 2013)
DOSE_SURFACE = 0.64   # mSv/day, RAD on the Mars surface (Hassler et al., Science 2014)

FEATURES = ["hr_res", "spo2_res", "temp_res", "hr_res_1h"]
VITAL_LABEL = {"hr": "heart rate", "spo2": "blood oxygen", "temp": "body temperature"}

CREW = [
    dict(id=1, name="Sara Haddad", role="Commander", origin="Egypt", spo2=97.8, temp=36.7, shield=1.00),
    dict(id=2, name="Lucas Meyer", role="Flight Engineer", origin="Germany", spo2=97.4, temp=36.8, shield=1.06),
    dict(id=3, name="Amina Okafor", role="Crew Medical Officer", origin="Nigeria", spo2=98.1, temp=36.6, shield=0.97),
    dict(id=4, name="Kenji Watanabe", role="Mission Specialist", origin="Japan", spo2=97.6, temp=36.7, shield=1.03),
]

SCENARIOS = {
    "tachycardia": "Sustained resting tachycardia",
    "hypoxia": "Slow drop in blood oxygen",
    "fever": "Fever with raised heart rate",
}


def mission_dose_at(day: float) -> float:
    """Cumulative nominal dose (mSv) at a mission day, following the mission profile."""
    t1 = min(day, ARRIVE_MARS_DAY)
    t2 = min(max(day - ARRIVE_MARS_DAY, 0), LEAVE_MARS_DAY - ARRIVE_MARS_DAY)
    t3 = max(day - LEAVE_MARS_DAY, 0)
    return t1 * DOSE_TRANSIT + t2 * DOSE_SURFACE + t3 * DOSE_TRANSIT


# Simple coplanar circular-orbit model (AU), shared with the frontend trajectory view.
TH0, R_EARTH, R_MARS = math.pi * 0.95, 1.0, 1.52
AU_LIGHT_MIN = 8.317


def positions(day: float):
    """Heliocentric (x, y) in AU of Earth, Mars and the ship on a given mission day."""
    a, e = (R_EARTH + R_MARS) / 2, (R_MARS - R_EARTH) / (R_MARS + R_EARTH)
    th_e = TH0 + 2 * math.pi * day / 365.25
    th_m = TH0 + math.pi - 2 * math.pi * (ARRIVE_MARS_DAY - day) / 687
    earth = (math.cos(th_e), math.sin(th_e))
    mars = (R_MARS * math.cos(th_m), R_MARS * math.sin(th_m))
    if day < ARRIVE_MARS_DAY:
        nu = math.pi * day / ARRIVE_MARS_DAY
        r = a * (1 - e * e) / (1 + e * math.cos(nu))
        ship = (r * math.cos(TH0 + nu), r * math.sin(TH0 + nu))
    elif day < LEAVE_MARS_DAY:
        ship = mars
    else:   # return leg: straight-line approximation back toward Earth's arrival point
        k = (day - LEAVE_MARS_DAY) / (MISSION_END_DAY - LEAVE_MARS_DAY)
        end = (math.cos(TH0 + 2 * math.pi * MISSION_END_DAY / 365.25), math.sin(TH0 + 2 * math.pi * MISSION_END_DAY / 365.25))
        lm = (R_MARS * math.cos(TH0 + math.pi - 2 * math.pi * (ARRIVE_MARS_DAY - LEAVE_MARS_DAY) / 687),
              R_MARS * math.sin(TH0 + math.pi - 2 * math.pi * (ARRIVE_MARS_DAY - LEAVE_MARS_DAY) / 687))
        ship = (lm[0] + (end[0] - lm[0]) * k, lm[1] + (end[1] - lm[1]) * k)
    return earth, mars, ship


def light_delay(day: float) -> float:
    (ex, ey), _, (sx, sy) = positions(day)
    return math.hypot(sx - ex, sy - ey) * AU_LIGHT_MIN


def sun_angle_deg(day: float) -> float:
    """Sun-Earth-ship angle seen from Earth; below ~3 degrees the Sun blocks the radio link (solar conjunction)."""
    (ex, ey), _, (sx, sy) = positions(day)
    v1, v2 = (-ex, -ey), (sx - ex, sy - ey)
    c = (v1[0] * v2[0] + v1[1] * v2[1]) / (math.hypot(*v1) * math.hypot(*v2) + 1e-9)
    return math.degrees(math.acos(max(-1, min(1, c))))


def next_conjunction(day: float):
    for d in range(int(day), MISSION_END_DAY):
        if sun_angle_deg(d) < 3:
            return d
    return None


def phase_of(day: float) -> str:
    return "Transit to Mars" if day < ARRIVE_MARS_DAY else "Mars surface" if day < LEAVE_MARS_DAY else "Return to Earth"


def bucket(activity: float) -> str:
    return "sleep" if activity == 0 else "rest" if activity < 0.5 else "light" if activity < 1.5 else "active"


@dataclass
class Astronaut:
    cfg: dict
    days: list                # real wearable days: arrays of shape (288, 4) -> hr, intensity, asleep, imputed
    nightly_sleep: list       # hours slept per real day (None when the device was not worn)
    participant: int
    rng: np.random.Generator
    readings: deque = field(default_factory=lambda: deque(maxlen=HISTORY_DAYS * SLOTS_PER_DAY + 600))
    model: IsolationForest | None = None
    threshold: float = 0.0
    expected: dict = field(default_factory=dict)
    res_std: dict = field(default_factory=dict)
    base_mean: dict = field(default_factory=dict)
    recent_res: deque = field(default_factory=lambda: deque(maxlen=PER_HOUR))
    scenario: dict | None = None
    streak: int = 0
    streak_vital: str = "hr"
    alerted: set = field(default_factory=set)
    flags: deque = field(default_factory=lambda: deque(maxlen=6))   # last 30 minutes of anomaly flags
    train_stats: dict = field(default_factory=dict)

    @property
    def id(self):
        return self.cfg["id"]

    def real(self, met_min: int):
        d = self.days[int(met_min // 1440) % len(self.days)]
        i = int(met_min % 1440) // STEP_MIN
        hr, inten, asleep, imputed = d[i]
        recent = max([inten] + [d[j][1] for j in (i - 1, i - 2) if j >= 0])   # include 15 min of post-exercise recovery
        return hr, recent, asleep, imputed

    def sleep_for(self, met_min: int) -> float:
        s = self.nightly_sleep[int(met_min // 1440) % len(self.days)]
        return s if s is not None else float(np.mean([x for x in self.nightly_sleep if x is not None]))

    def generate(self, met_min: int) -> dict:
        c, r = self.cfg, self.rng
        hr, inten, asleep, imputed = self.real(met_min)
        hour = (met_min % 1440) / 60
        activity = float(min(inten, 3.0)) if inten >= 1.5 else 0.0 if asleep >= 0.5 else float(inten)
        circ = math.sin(2 * math.pi * (hour - 10) / 24)
        spo2 = c["spo2"] + r.normal(0, 0.4) - (0.6 if activity == 0 else 0) - 0.3 * max(0, activity - 1.5)
        temp = c["temp"] + 0.25 * circ + r.normal(0, 0.07) + 0.15 * max(0, activity - 1)

        sc = self.scenario
        if sc:
            ramp = min(1.0, (met_min - sc["start"]) / STEP_MIN / 6)
            activity = 0.3
            rest = self.base_mean.get("hr", 70)
            if sc["type"] == "tachycardia":
                hr = rest + 58 * ramp + r.normal(0, 3.5)
            elif sc["type"] == "hypoxia":
                spo2 = c["spo2"] - 6.2 * ramp + r.normal(0, 0.35)
                hr = rest + 14 * ramp + r.normal(0, 2)
            elif sc["type"] == "fever":
                temp = c["temp"] + 1.7 * ramp + r.normal(0, 0.08)
                hr = rest + 20 * ramp + r.normal(0, 2)

        if sc:
            imputed = 0
        return dict(ts=met_min, hour=int(hour), imputed=bool(imputed), hr=round(float(hr), 1), spo2=round(float(min(spo2, 100)), 1),
                    temp=round(float(temp), 2), activity=round(activity, 2), sleep_h=round(self.sleep_for(met_min), 1))

    # ---------- personal model ----------
    def featurize(self, x: dict):
        b = bucket(x["activity"])
        e = (self.expected.get(("active", "all")) if b == "active" else None) or self.expected.get((b, x["hour"])) or self.expected[("any", x["hour"])]
        x["hr_res"], x["spo2_res"], x["temp_res"] = x["hr"] - e[0], x["spo2"] - e[1], x["temp"] - e[2]
        self.recent_res.append(x["hr_res"])
        x["hr_res_1h"] = float(np.mean(self.recent_res))
        return [x[f] for f in FEATURES]

    def train(self):
        rows = list(self.readings)
        groups = {}
        for x in rows:
            for key in ((bucket(x["activity"]), x["hour"]), ("any", x["hour"])) + ((("active", "all"),) if bucket(x["activity"]) == "active" else ()):
                groups.setdefault(key, []).append((x["hr"], x["spo2"], x["temp"]))
        self.expected = {k: tuple(np.mean(v, axis=0)) for k, v in groups.items() if len(v) >= 6 or k[0] == "any"}
        self.recent_res.clear()
        X = np.array([self.featurize(x) for x in rows])
        self.model = IsolationForest(n_estimators=200, random_state=self.id).fit(X)
        scores = -self.model.decision_function(X)
        self.threshold = float(np.quantile(scores, 0.995))
        for x, s in zip(rows, scores):
            x["anomaly_score"], x["anomaly"] = round(float(s), 4), bool(s > self.threshold)
        rest = [x for x in rows if bucket(x["activity"]) == "rest"]
        for v in ("hr", "spo2", "temp"):
            self.base_mean[v] = float(np.mean([x[v] for x in rest]))
            self.res_std[v] = float(np.std([x[v + "_res"] for x in rows]) + 1e-6)
        self.train_stats = dict(samples=len(rows), days=HISTORY_DAYS, features=FEATURES, trees=200,
                                flag_rate=round(float(np.mean(scores > self.threshold)) * 100, 2))

    def score_reading(self, x: dict):
        """Hybrid detection: the personal Isolation Forest finds subtle deviations; clinical limits are a safety net."""
        s = -float(self.model.decision_function([self.featurize(x)])[0])
        ml = s > self.threshold and not x["imputed"]          # never judge a sensor gap
        limit = x["spo2"] < 92.5 or x["temp"] >= 38.0 or (x["hr"] > 120 and x["activity"] < 1.5 and not x["imputed"])
        x["anomaly_score"], x["anomaly"] = round(s, 4), bool(ml or limit)
        x["flag_source"] = "ml+limit" if ml and limit else "ml" if ml else "limit" if limit else None

    def dominant_vital(self, recent: list[dict]) -> str:
        z = {v: float(np.mean([abs(x[v + "_res"]) for x in recent])) / self.res_std[v] for v in ("hr", "spo2", "temp")}
        return max(z, key=z.get)


def _penalty(value, lo, hi, scale, cap):
    d = lo - value if value < lo else value - hi if value > hi else 0
    return min(cap, d * scale)


def health_score(latest: dict, last_hour: list[dict]) -> tuple[int, list[dict]]:
    """100 minus explainable penalties."""
    hr_hi = 100 if latest["activity"] < 1.5 else 170
    flagged = sum(1 for x in last_hour if x.get("anomaly"))
    parts = [
        dict(key="hr", label="Heart rate", max=20, penalty=_penalty(latest["hr"], 45, hr_hi, 0.8, 20)),
        dict(key="spo2", label="Blood oxygen", max=20, penalty=_penalty(latest["spo2"], 95, 100, 4.0, 20)),
        dict(key="temp", label="Temperature", max=20, penalty=_penalty(latest["temp"], 36.1, 37.5, 16.0, 20)),
        dict(key="sleep", label="Sleep debt", max=15, penalty=_penalty(latest["sleep_h"], 7.0, 24, 5.0, 15)),
        dict(key="ml", label="ML anomaly", max=15, penalty=min(15.0, flagged * 2.5)),
    ]
    for p in parts:
        p["penalty"] = round(p["penalty"], 1)
    return max(0, min(100, round(100 - sum(p["penalty"] for p in parts)))), parts


def load_wearable():
    df = pd.read_csv(WEARABLE)
    out = {}
    for aid, g in df.groupby("astronaut"):
        days, sleep = [], []
        for _, d in g.groupby("day"):
            if len(d) != SLOTS_PER_DAY:
                continue
            days.append(d[["hr", "intensity", "asleep", "imputed"]].to_numpy(dtype=float))
            h = d["asleep"].sum() * STEP_MIN / 60
            sleep.append(round(float(h), 1) if h >= 2 else None)
        active = [float((dd[:, 1] >= 1.5).sum() * STEP_MIN) for dd in days]
        out[int(aid)] = (int(g["participant"].iloc[0]), days, sleep, float(np.mean(active)))
    return out


class Mission:
    def __init__(self, seed: int = 7):
        self.lock = threading.RLock()
        self.met = START_MET_MIN - HISTORY_DAYS * 1440
        wear = load_wearable()
        self.crew = {}
        for c in CREW:
            pid, days, sleep, active = wear[c["id"]]
            a = Astronaut(c, days, sleep, pid, np.random.default_rng(seed + c["id"]))
            a.active_min_day = active
            self.crew[c["id"]] = a
        self.alerts: list[dict] = []
        self.messages: list[dict] = []
        self.prompts: list[dict] = []
        self.seq = 0
        self.storm_until = None
        self.extra_dose = 0.0
        self.blackout = False
        while self.met < START_MET_MIN:
            self._step(score=False)
        for a in self.crew.values():
            a.train()

    def _id(self):
        self.seq += 1
        return self.seq

    # ---------- time / environment ----------
    @property
    def day(self):
        return self.met / 1440

    def light_delay_min(self):
        return round(light_delay(self.day), 1)

    def storm(self):
        return self.storm_until is not None and self.met < self.storm_until

    def base_rate(self):
        return DOSE_SURFACE if phase_of(self.day) == "Mars surface" else DOSE_TRANSIT

    def dose_rate(self):
        return self.base_rate() * (40 if self.storm() else 1)

    def dose(self):
        return round(mission_dose_at(self.day) + self.extra_dose, 1)

    def cabin(self):
        h = (self.met % 1440) / 60
        co2 = 2.4 + 0.35 * math.sin(2 * math.pi * (h - 14) / 24) + (0.6 if self.storm() else 0)  # crowded shelter
        return dict(co2_mmhg=round(co2, 2), temp_c=round(22.4 + 0.6 * math.sin(2 * math.pi * (h - 15) / 24), 1),
                    humidity=round(45 + 4 * math.sin(2 * math.pi * h / 24)), o2_kpa=21.1, pressure_kpa=101.3)

    def _step(self, score=True):
        self.met += STEP_MIN
        if self.storm():
            self.extra_dose += (self.dose_rate() - self.base_rate()) * STEP_MIN / 1440
        for a in self.crew.values():
            x = a.generate(self.met)
            if score:
                a.score_reading(x)
                self._alert_rule(a, x)
                if a.scenario and (self.met - a.scenario["start"]) > 8 * 60:
                    a.scenario = None
            a.readings.append(x)

    def tick(self):
        with self.lock:
            self._step()

    # ---------- alerts ----------
    def _alert_rule(self, a: Astronaut, x: dict):
        # persistence: an episode starts when 5 of the last 6 readings (30 min) are abnormal,
        # and continues while at least 3 of the last 6 still are
        a.flags.append(bool(x["anomaly"]))
        n = sum(a.flags)
        if a.streak == 0 and n >= 5:
            a.streak = len(a.flags)
        elif a.streak > 0 and n >= 3:
            a.streak += 1
        elif a.streak > 0:
            a.streak = 0
            a.alerted.clear()
        if a.streak and x["anomaly"]:
            a.streak_vital = a.dominant_vital(list(a.readings)[-5:] + [x])
        vital = VITAL_LABEL[a.streak_vital]
        for need, sev, dur in ((6, "warning", "30 min"), (18, "warning", "90 min"), (36, "critical", "3 hours")):
            if a.streak >= need and need not in a.alerted:
                a.alerted.add(need)
                al = self._raise(a, sev, f"{a.cfg['name']}: abnormal {vital} for {dur}", a.streak_vital, x)
                if need == 6:
                    self.prompts.append(dict(
                        id=self._id(), crew_id=a.id, alert_id=al["id"], ts=self.met, open=True, vital=a.streak_vital,
                        text=f"Your {vital} has been unusual for 30 minutes (now {x[a.streak_vital]}, "
                             f"your normal is about {a.base_mean[a.streak_vital]:.1f}). How do you feel?"))

    def _raise(self, a, severity, message, vital, x):
        al = dict(id=self._id(), crew_id=a.id if a else None, severity=severity, message=message, vital=vital,
                  value=x.get(vital) if x else None, baseline=round(a.base_mean.get(vital, 0), 1) if a else None,
                  ts=self.met, acknowledged=False, crew_feedback=None)
        self.alerts.append(al)
        self.downlink("vitalorbit", "alert", message, f"Automatic {severity} alert from onboard monitoring.",
                      crew_id=al["crew_id"], ref=al["id"])
        return al

    def respond_prompt(self, pid: int, feeling: str, note: str = ""):
        with self.lock:
            for p in self.prompts:
                if p["id"] == pid:
                    p["open"], p["answer"] = False, feeling
                    for al in self.alerts:
                        if al["id"] == p["alert_id"]:
                            al["crew_feedback"] = f"{feeling}{': ' + note if note else ''}"
                    return p

    # ---------- comms (store and forward, light-time delayed) ----------
    def downlink(self, sender, kind, subject, body, crew_id=None, private=False, ref=None, data=None):
        return self._send(sender, "earth", kind, subject, body, crew_id, private, ref, data)

    def uplink(self, sender, kind, subject, body, crew_id=None, private=False, ref=None):
        return self._send(sender, "ship", kind, subject, body, crew_id, private, ref, None)

    def _send(self, sender, to, kind, subject, body, crew_id, private, ref, data):
        with self.lock:
            m = dict(id=self._id(), sender=sender, to=to, kind=kind, subject=subject, body=body, crew_id=crew_id,
                     private=private, ref=ref, data=data, sent=self.met,
                     arrive=None if self.blackout else self.met + self.light_delay_min())
            self.messages.append(m)
            return m

    def set_blackout(self, on: bool):
        with self.lock:
            self.blackout = on
            if not on:
                for m in self.messages:
                    if m["arrive"] is None:
                        m["arrive"] = self.met + self.light_delay_min()

    # ---------- views ----------
    def crew_view(self, a: Astronaut, delay_min: float = 0) -> dict:
        upto = self.met - delay_min
        rs = [x for x in list(a.readings)[-PER_HOUR * 3:] if x["ts"] <= upto]
        latest, last_hour = rs[-1], rs[-PER_HOUR:]
        score, parts = health_score(latest, last_hour)
        status = "green" if score >= 80 else "amber" if score >= 60 else "red"
        if any(al["severity"] == "critical" and al["crew_id"] == a.id and al["ts"] <= upto and upto - al["ts"] < 6 * 60
               and not al["acknowledged"] for al in self.alerts):
            status = "red"
        spark = [x["hr"] for x in rs][-36:]
        return dict(
            id=a.id, name=a.cfg["name"], role=a.cfg["role"], origin=a.cfg["origin"],
            health_score=score, status=status, breakdown=parts, as_of=latest["ts"],
            latest={k: latest[k] for k in ("hr", "spo2", "temp", "sleep_h", "activity", "anomaly", "anomaly_score")},
            activity_label=bucket(latest["activity"]),
            baseline={k: round(v, 1) for k, v in a.base_mean.items()},
            scenario=a.scenario["type"] if a.scenario else None, anomaly_streak=a.streak, spark=spark,
            anomaly_vital=a.streak_vital if a.streak else None,
        )

    def all_crew(self, delay_min: float = 0):
        with self.lock:
            return [self.crew_view(a, delay_min) for a in self.crew.values()]

    def one(self, cid: int, delay_min: float = 0):
        with self.lock:
            return self.crew_view(self.crew[cid], delay_min)

    def vitals(self, crew_id: int, hours: int = 24, delay_min: float = 0):
        with self.lock:
            a = self.crew[crew_id]
            keep = ("ts", "hr", "spo2", "temp", "sleep_h", "activity", "anomaly", "anomaly_score")
            rows = [x for x in list(a.readings)[-hours * PER_HOUR - 12:] if x["ts"] <= self.met - delay_min]
            return [{k: x[k] for k in keep} for x in rows[-hours * PER_HOUR:]]

    def model_card(self, crew_id: int):
        a = self.crew[crew_id]
        return dict(a.train_stats, threshold=round(a.threshold, 4), participant=a.participant,
                    real_days=len(a.days), personal_rest_hr=round(a.base_mean["hr"], 1),
                    feedback=[al for al in self.alerts if al["crew_id"] == crew_id and al["crew_feedback"]][-5:])

    def mission_view(self):
        with self.lock:
            return dict(
                met_min=self.met, day=int(self.day), phase=phase_of(self.day),
                days_to_mars=max(0, ARRIVE_MARS_DAY - int(self.day)), mission_end_day=MISSION_END_DAY,
                days_to_departure=max(0, LEAVE_MARS_DAY - int(self.day)), gravity_g=0.38 if phase_of(self.day) == "Mars surface" else 0,
                conjunction_day=next_conjunction(self.day), sun_angle_deg=round(sun_angle_deg(self.day), 1),
                distance_au=round(light_delay(self.day) / AU_LIGHT_MIN, 2),
                arrive_mars_day=ARRIVE_MARS_DAY, leave_mars_day=LEAVE_MARS_DAY,
                light_delay_min=self.light_delay_min(), dose_msv=self.dose(), dose_rate_msv_day=round(self.dose_rate(), 2),
                solar_storm=self.storm(), storm_remaining_min=(self.storm_until - self.met) if self.storm() else 0,
                blackout=self.blackout, cabin=self.cabin(),
            )

    # ---------- demo controls ----------
    def inject(self, crew_id: int, kind: str):
        with self.lock:
            self.crew[crew_id].scenario = dict(type=kind, start=self.met)

    def resolve(self, crew_id: int):
        with self.lock:
            self.crew[crew_id].scenario = None

    def solar_storm(self, hours: int = 6):
        with self.lock:
            self.storm_until = self.met + hours * 60
            self._raise(None, "critical", "Solar particle event: all crew to the storm shelter", "radiation", None)

    def ack(self, alert_id: int):
        with self.lock:
            for al in self.alerts:
                if al["id"] == alert_id:
                    al["acknowledged"] = True
