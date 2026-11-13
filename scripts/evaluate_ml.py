"""Measure VitalOrbit's anomaly detection on the real wearable streams.

1. False alarms: run 3 normal mission days for all 4 astronauts (real Fitbit heart rate, activity, sleep) and count alerts.
2. Detection: for every astronaut x scenario (tachycardia, hypoxia, fever), inject it, measure the mission minutes until the
   first alert, whether the right vital was named, and whether the 3-hour critical alert fired.

Usage: .venv/bin/python -m scripts.evaluate_ml      (writes data/ml_evaluation.json, about 1 minute)
"""
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.engine import PER_HOUR, SLOTS_PER_DAY, STEP_MIN, Mission  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "ml_evaluation.json"
EXPECTED = {"tachycardia": "hr", "hypoxia": "spo2", "fever": "temp"}


def main():
    t0 = time.time()
    m = Mission(seed=11)
    crew = list(m.crew)

    # 1) false alarms on normal real data
    days = 3
    start = len(m.alerts)
    for _ in range(days * SLOTS_PER_DAY):
        m.tick()
    normal = m.alerts[start:]
    warnings = [a for a in normal if a["severity"] == "warning"]
    critical = [a for a in normal if a["severity"] == "critical"]
    readings = days * SLOTS_PER_DAY * len(crew)

    # 2) detection of injected emergencies
    results = []
    for kind, vital in EXPECTED.items():
        for cid in crew:
            m.crew[cid].streak = 0
            m.crew[cid].alerted.clear()
            m.crew[cid].flags.clear()
            n0, t_inject = len(m.alerts), m.met
            m.inject(cid, kind)
            first = crit = None
            for _ in range(48):                       # up to 4 mission hours
                m.tick()
                mine = [a for a in m.alerts[n0:] if a["crew_id"] == cid]
                if mine and first is None:
                    first = mine[0]
                if any(a["severity"] == "critical" for a in mine):
                    crit = True
                    break
            m.resolve(cid)
            for _ in range(PER_HOUR * 3):             # let the astronaut recover
                m.tick()
            results.append(dict(astronaut=m.crew[cid].cfg["name"], scenario=kind,
                                detected=first is not None,
                                minutes_to_first_alert=(first["ts"] - t_inject) if first else None,
                                correct_vital=bool(first and first["vital"] == vital),
                                critical_by_3h=bool(crit)))

    det = [r for r in results if r["detected"]]
    report = dict(
        data="Real Fitbit heart rate, activity and sleep (Zenodo 53894) for 4 people; SpO2/temperature simulated",
        normal_days=days, crew=len(crew), readings_scored=readings,
        false_warnings=len(warnings), false_critical=len(critical),
        false_warnings_per_crew_day=round(len(warnings) / (days * len(crew)), 2),
        scenarios_tested=len(results), detected=len(det),
        detection_rate=round(len(det) / len(results), 3),
        correct_vital_rate=round(sum(r["correct_vital"] for r in results) / len(results), 3),
        median_minutes_to_alert=statistics.median(r["minutes_to_first_alert"] for r in det) if det else None,
        critical_by_3h_rate=round(sum(r["critical_by_3h"] for r in results) / len(results), 3),
        step_minutes=STEP_MIN, runtime_s=round(time.time() - t0, 1), results=results,
    )
    OUT.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "results"}, indent=2))


if __name__ == "__main__":
    main()
