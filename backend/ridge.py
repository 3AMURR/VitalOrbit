"""Long-mission risk model, organised by NASA HRP's five spaceflight hazards (RIDGE):
Radiation, Isolation & confinement, Distance from Earth, Gravity fields, hostile/closed Environment.

Every value carries a `source`: "real" (wearable data), "simulated", or "model" (projection from published rates).
Rates and limits used (cite in the pitch; marked assumptions are ours):
- Career effective dose limit 600 mSv (NASA-STD-3001 Vol. 1, Rev. B, 2022).
- Dose 1.8 mSv/day in transit (Zeitlin 2013), 0.64 mSv/day on the Mars surface (Hassler 2014).
- Bone: ~1-1.5 %/month loss in weight-bearing bone without countermeasures (LeBlanc et al. 2000);
  exercise (ARED) largely offsets it (Smith et al. 2012). Mitigation formula and Mars-gravity factor are assumptions.
- Muscle: large losses without exercise on long flights; mitigation formula is an assumption.
- SANS: optic disc edema seen in a large share of long-duration crew (Mader et al. 2011). Exam values simulated.
"""
from __future__ import annotations

import math

import numpy as np

from .engine import (ARRIVE_MARS_DAY, DOSE_SURFACE, DOSE_TRANSIT, LEAVE_MARS_DAY, MISSION_END_DAY,
                     mission_dose_at)

CAREER_LIMIT_MSV = 600
EXERCISE_TARGET_MIN = 60       # minutes/day of moderate-to-vigorous exercise prescribed onboard (assumption)
BONE_RATE = 1.3                # %/month, unmitigated, weightlessness
MUSCLE_RATE = 1.6              # %/month, unmitigated
MARS_G_FACTOR = 0.6            # assumption: 0.38 g on Mars slows loss to 60 %
BONE_LIMIT, MUSCLE_LIMIT = 10.0, 15.0

# Simulated SANS exam history (retinal nerve fibre layer thickening, micrometres) and check-ins per astronaut
SANS_RATE = {1: 0.008, 2: 0.012, 3: 0.006, 4: 0.04}        # um/day: Kenji shows early optic disc swelling
MOOD = {1: (4.1, 2.2), 2: (3.4, 3.4), 3: (4.3, 1.9), 4: (3.9, 2.6)}   # (mood 1-5, stress 1-5) recent averages


def level(frac):
    return "low" if frac < 0.6 else "moderate" if frac < 0.85 else "elevated" if frac < 1 else "high"


def _loss(day, rate_month, compliance, mitig):
    """Cumulative % loss by mission day; slower on Mars."""
    r = rate_month / 30 * (1 - mitig * compliance)
    g = min(day, ARRIVE_MARS_DAY) + max(0, min(day, LEAVE_MARS_DAY) - ARRIVE_MARS_DAY) * MARS_G_FACTOR + max(0, day - LEAVE_MARS_DAY)
    return r * g


def _cross_day(fn, limit):
    for d in range(0, MISSION_END_DAY + 1, 2):
        if fn(d) >= limit:
            return d
    return None


def risks(a, mission) -> list[dict]:
    day = mission.day
    out = []

    # R: radiation
    shield = a.cfg["shield"]
    dose_now = mission.dose() * shield
    dose_fn = lambda d: mission_dose_at(d) * shield + mission.extra_dose * shield
    end = dose_fn(MISSION_END_DAY)
    out.append(dict(
        hazard="R", key="radiation", name="Radiation exposure", value=round(dose_now), unit="mSv",
        detail=f"{dose_now / CAREER_LIMIT_MSV * 100:.0f} % of the 600 mSv career limit",
        projection=round(end), projection_label="projected at mission end", limit=CAREER_LIMIT_MSV,
        cross_day=_cross_day(dose_fn, CAREER_LIMIT_MSV), level=level(end / CAREER_LIMIT_MSV),
        action="Use the storm shelter during solar events; plan EVA timing around the dose budget.",
        source="model", basis="Personal dosimeter model: RAD-measured dose rates x crew shielding factor"))

    # G: bone and muscle, driven by REAL exercise minutes from the wearable
    comp = min(1.0, a.active_min_day / EXERCISE_TARGET_MIN)
    bone = lambda d: _loss(d, BONE_RATE, comp, 0.85)
    musc = lambda d: _loss(d, MUSCLE_RATE, comp, 0.9)
    out.append(dict(
        hazard="G", key="bone", name="Bone density loss (hip)", value=round(bone(day), 1), unit="%",
        detail=f"Exercise {a.active_min_day:.0f} of {EXERCISE_TARGET_MIN} min/day ({comp * 100:.0f} % compliance)",
        projection=round(bone(MISSION_END_DAY), 1), projection_label="projected at mission end", limit=BONE_LIMIT,
        cross_day=_cross_day(bone, BONE_LIMIT), level=level(bone(MISSION_END_DAY) / BONE_LIMIT),
        action="Add resistance sessions on the exercise device; check vitamin D and calcium intake.",
        source="model", basis="Exercise minutes are real wearable data; loss rates from published spaceflight studies"))
    out.append(dict(
        hazard="G", key="muscle", name="Muscle mass loss (legs)", value=round(musc(day), 1), unit="%",
        detail="Countermeasure: resistive and aerobic exercise", projection=round(musc(MISSION_END_DAY), 1),
        projection_label="projected at mission end", limit=MUSCLE_LIMIT, cross_day=_cross_day(musc, MUSCLE_LIMIT),
        level=level(musc(MISSION_END_DAY) / MUSCLE_LIMIT), action="Keep heavy squats and deadlifts in the plan.",
        source="model", basis="Same real exercise data; mitigation is a model assumption"))

    # G/E: SANS (vision)
    rnfl = SANS_RATE[a.id] * day
    out.append(dict(
        hazard="G", key="sans", name="Vision (SANS)", value=round(rnfl, 1), unit="um",
        detail="Retinal nerve fibre layer thickening on weekly OCT" + (" · early optic disc swelling" if rnfl > 10 else ""),
        projection=round(SANS_RATE[a.id] * MISSION_END_DAY, 1), projection_label="projected at mission end", limit=20,
        cross_day=_cross_day(lambda d: SANS_RATE[a.id] * d, 20), level=level(SANS_RATE[a.id] * MISSION_END_DAY / 20 / 1.5),
        action="Weekly OCT and acuity check; consider thigh cuffs to reduce fluid shift; watch cabin CO2.",
        source="simulated", basis="Exam values simulated; SANS prevalence from NASA long-duration crew studies"))

    # I: behavioural health (check-ins simulated, sleep REAL)
    recent = getattr(mission, "checkins", {}).get(a.id, [])[-7:]
    mood = float(np.mean([c["mood"] for c in recent])) if recent else MOOD[a.id][0]
    stress = float(np.mean([c["stress"] for c in recent])) if recent else MOOD[a.id][1]
    sleeps = [s for s in a.nightly_sleep if s is not None]
    sleep7 = float(np.mean(sleeps[-7:])) if sleeps else 0
    bh = (5 - mood) / 4 * 0.4 + (stress - 1) / 4 * 0.4 + max(0, 7 - sleep7) / 3 * 0.2
    out.append(dict(
        hazard="I", key="behavioral", name="Behavioural health", value=round(mood, 1), unit="/5 mood",
        detail=f"Stress {stress:.1f}/5 · sleep {sleep7:.1f} h/night (7-day)", projection=None, projection_label="",
        limit=None, cross_day=None, level=level(bh / 0.45),
        action="Private conference with the flight surgeon; protect sleep window; schedule crew off-duty time.",
        source="simulated", basis="Mood and stress from daily check-ins (history before today simulated); sleep is real wearable data"))

    # E: cabin environment (ship-wide)
    co2 = mission.cabin()["co2_mmhg"]
    out.append(dict(
        hazard="E", key="co2", name="Cabin CO2", value=co2, unit="mmHg", detail="Linked to headaches and SANS risk",
        projection=None, projection_label="", limit=3.0, cross_day=None, level=level(co2 / 3.0 / 1.1),
        action="If above 3 mmHg, check the CO2 scrubber and improve ventilation in crew quarters.",
        source="simulated", basis="Cabin telemetry simulated"))
    return out


def overview(mission):
    return {a.id: risks(a, mission) for a in mission.crew.values()}
