# VitalOrbit: Onboard Crew Health System

**NASA Space Apps Cairo 2026**
**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions
**Team:** UnoSyn, CS students from the Egyptian Chinese University (ECU)

> *"On Mars, help can't be twenty minutes away."*

---

## 1. One-line pitch
VitalOrbit is an onboard health system that lets astronauts on deep-space missions monitor, detect and respond
to medical problems themselves, without waiting for doctors on Earth.

## 2. The problem

### Communication delay
- On a Mars mission, a message to Earth takes **up to ~20 minutes one way**, so a question and its answer
  can take **40 minutes or more**. During solar conjunction, contact can be lost for about **two weeks**.
- In a medical emergency, that delay can decide the outcome.

### The health risks of long missions
| Risk | What happens |
|---|---|
| **Bone loss** | Without gravity, astronauts lose bone mass, about 1–1.5 % per month in weight-bearing bones |
| **Muscle atrophy** | Muscles weaken fast without load |
| **Vision damage (SANS)** | Spaceflight-Associated Neuro-ocular Syndrome: fluid shifts toward the head and changes the eye |
| **Radiation** | Higher cancer and heart risk, and it degrades medicines faster |
| **Poor sleep** | ISS crews average about 6 hours a night, which hurts focus and decisions |
| **Isolation and stress** | Months in a small, closed crew |

### The gap
Today's spaceflight medicine depends heavily on **flight surgeons on the ground** watching data in real time.
That works for the ISS (seconds of delay) but **not for Mars**. The crew needs to become its own first line of care.

## 3. The solution
UnoSyn is **software that runs onboard the spacecraft**. It watches the crew's health continuously,
catches problems early, guides the crew through treatment and makes sure the right medicine is available.

### The five modules

#### ① Crew Dashboard
- One card per astronaut: name, role, **Health Score (0–100)** and the latest vitals.
- Vitals tracked: **heart rate, blood oxygen (SpO2), body temperature, sleep hours**.
- Color status: 🟢 ≥ 80 · 🟡 60–79 · 🔴 < 60.
- Detail page per astronaut with 24-hour charts.

#### ② Anomaly Detection (Machine Learning)
- Uses an **Isolation Forest** (unsupervised ML, scikit-learn).
- Learns **each astronaut's own normal pattern** instead of using one generic threshold for everyone.
- Features: heart rate, SpO2, temperature, plus the rolling 1-hour mean and variation of heart rate.
- Flags unusual readings **early**, before they become emergencies.
- Why Isolation Forest: needs no labeled medical emergencies (which are rare), is fast and light enough
  for onboard hardware, and is easy to explain.

#### ③ Smart Alerts
- Rules on top of the ML flags so the crew isn't flooded with false alarms:
  an alert fires only if the anomaly **persists**.
- Example: *"Astronaut Sara: abnormal heart rate for 3 hours."*
- Severity levels: info, warning, critical.

#### ④ AI Medical Assistant
- A chat where an astronaut describes symptoms ("I feel dizzy and my heart is racing").
- Gives **step-by-step first-aid guidance** in short, clear steps.
- Knows the astronaut's **current vitals** and the **onboard pharmacy** contents.
- Only suggests medicines that are **actually on board**; each suggestion is shown as
  ✅ available · ❌ out of stock · ⚠️ expired.
- Always ends by recommending contact with the flight surgeon when communication allows.
- **Concept:** onboard it would run on a **local, offline language model**. For the hackathon demo we use an LLM API,
  with pre-written fallback answers in case there's no internet.

#### ⑤ MedInventory (Smart Pharmacy)
- Tracks every medicine: name, quantity, minimum quantity, expiry date.
- Warns on **low stock** and **near expiry**.
- **Radiation-adjusted expiry:** space radiation degrades drugs faster than on Earth (NASA ISS medication
  stability studies), so UnoSyn estimates an earlier "effective expiry":
  `effective_expiry = expiry − (days_in_mission × radiation_factor)`
- Linked to the AI assistant: any suggested drug is checked here first.

## 4. How it works (data flow)

```
 Wearable sensors (simulated)
            │  heart rate, SpO2, temperature, sleep
            ▼
 ┌──────────────────────┐     ┌──────────────────────────┐
 │  FastAPI backend     │────▶│  ML: Isolation Forest     │
 │  + SQLite database   │◀────│  + Health Score           │
 └──────────────────────┘     └──────────────────────────┘
       │        │        │
       ▼        ▼        ▼
  Dashboard   Alerts   AI Assistant ◀──▶ MedInventory
        (React web app on the spacecraft's local network)
```

## 5. Health Score (0–100)
Starts at 100 and subtracts penalties:

| Component | Max penalty | Logic |
|---|---|---|
| Heart rate | 20 | Distance outside 60–100 bpm |
| SpO2 | 20 | Below 95 % |
| Temperature | 20 | Outside 36.1–37.5 °C |
| Sleep | 15 | Sleep debt below about 7 h/night |
| ML anomaly | 15 | Flagged in the last hour |

The result is clamped to 0–100. It is simple and explainable: the crew can see **why** the score dropped.

## 6. Tech stack
| Layer | Technology |
|---|---|
| Frontend | React (Vite), Recharts for charts |
| Backend | Python, FastAPI |
| Database | SQLite (SQLModel) |
| Machine Learning | scikit-learn (Isolation Forest), joblib |
| AI Assistant | LLM API (demo); a local offline model in the real concept |
| Data | Simulated vitals plus NASA open science data for grounding |

## 7. NASA data: how we use it (honestly)
- We checked NASA's **Open Science Data Repository (OSDR)**: it has **no public astronaut vital-sign time series**.
  It is mostly biological (omics) data.
- So the **live vitals are simulated** with realistic, physiologically based baselines.
- **NASA data grounds the risks and thresholds:**
  - **Inspiration4** (OSD-569 to OSD-574): physiological changes in civilian astronauts after just 3 days in space
  - **Bone and muscle studies** (e.g. OSD-342, OSD-396, OSD-195 bedrest)
  - **SANS / vision** (OSD-816, OSD-397)
  - **Radiation and heart** (OSD-334, OSD-720, OSD-881)
  - **NASA Twins Study**: published findings (*Science*, 2019)
  - **ISS medication stability studies** (Du et al., *AAPS Journal*, 2011) for radiation-shortened drug shelf life
- Full details are in `DATASETS.md`.

## 8. Demo scenario (about 2 minutes)
1. **Dashboard:** 4 crew members, all green. *"Mission day 142, 18 minutes from Earth."*
2. Press **"Inject emergency"** (tachycardia) on one astronaut. The chart spikes, the ML flags it,
   the score drops 92 → 58, and an alert appears: *"abnormal heart rate for 3 hours."*
3. **Assistant:** *"I feel dizzy and my heart is racing."* It gives step-by-step guidance and suggests a drug,
   shown as ✅ available.
4. **Inventory:** one drug ⚠️ "expires early due to radiation", another low on stock.
5. **Close:** *"No waiting forty minutes for Earth: the crew is its own first responder."*

## 9. What makes UnoSyn different
- **Built for autonomy:** designed for deep space, where ground support is too slow.
- **Personal baselines:** the ML learns each astronaut's own normal, not population averages.
- **Closed loop:** detect → alert → guide → check medicine, all in one system.
- **Radiation-aware pharmacy:** a space-specific problem that most health apps ignore.
- **Explainable:** a simple score and clear alerts that crews can trust.

## 10. Impact beyond space
The same system fits **places far from a doctor on Earth**: Antarctic stations, submarines, offshore rigs,
remote villages and field hospitals. That makes the idea useful beyond NASA missions.

## 11. Future work
- Real wearable integration (e.g. Bio-Monitor, Astroskin-style smart shirts)
- More signals: blood pressure, ECG, bone density, eye scans for SANS, mood and stress check-ins
- Fully offline medical LLM on spacecraft hardware
- Delayed sync to Earth: send summaries to flight surgeons when the link is available
- Prediction (not just detection): forecast health decline days in advance

## 12. Scope for the 48-hour hackathon
| Priority | Feature |
|---|---|
| **Must have** | Dashboard + Health Score + anomaly detection + alerts |
| Should have | MedInventory + AI Assistant linked to it |
| Nice to have | "Inject emergency" demo button, charts, polish |

Full timeline, API contract and roles are in `BUILD_PLAN.md`.

## 13. Registration description (579 chars)
> On Mars missions, messages to Earth take up to 20 minutes each way, so crews must handle medical issues alone. UnoSyn is an onboard crew health system: a dashboard with a health score per astronaut, ML anomaly detection that flags abnormal vital signs early, an AI medical assistant for step-by-step first aid, and a smart pharmacy that warns of low stock and radiation-shortened drug expiry. We'll build a web app with FastAPI, scikit-learn and React, using simulated vitals with thresholds grounded in NASA OSDR spaceflight data (Inspiration4, bone, vision, radiation studies).

## 14. Related files
- `BUILD_PLAN.md`: 48-hour build plan
- `DATASETS.md`: dataset verification
- `VIDEO_SCRIPT.md`: 90-second video script (English + Arabic)
