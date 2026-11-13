# VitalOrbit: autonomous crew health for deep space

**NASA Space Apps Cairo 2026 · Challenge: Create Health Monitoring Software for Astronauts on Space Missions · Team UnoSyn (ECU)**

On a Mars mission Earth is up to ~20 light-minutes away, so the crew must handle medical problems alone.
VitalOrbit runs onboard. It learns each astronaut's own normal from **real wearable data**, raises explainable alerts,
forecasts the slow long-mission risks (NASA's RIDGE hazards), guides first aid with an **offline AI assistant**,
keeps a radiation-aware pharmacy, and syncs with the flight surgeon on Earth through a light-time-delayed link.

## Run it

```bash
./run.sh
```

Open http://localhost:8000. First start installs Python dependencies into `.venv` (Python 3.10+).

**Optional local AI model (free, offline):** install [Ollama](https://ollama.com), then

```bash
ollama pull qwen2.5:1.5b
```

VitalOrbit detects it automatically. If `ANTHROPIC_API_KEY` is set it uses Claude instead. With neither, the assistant
answers from built-in onboard protocols, so it always works.

## Logins (demo PINs, shown on the sign-in screen)

| User | Role | Sees |
|---|---|---|
| Sara Haddad (1111), Lucas Meyer (2222), Kenji Watanabe (4444) | Astronaut | Only their own health, check-in, assistant, private line to the flight surgeon |
| Amina Okafor (3333) | Crew Medical Officer | Whole crew, alerts, long-term risks, pharmacy management, model cards |
| Dr. Layla Mansour (9999) | Flight Surgeon, Mission Control (Earth) | Everything, but **18 minutes late**: telemetry, alerts and messages arrive after the light-time delay |

Medical privacy is enforced in the API, not only the UI: an astronaut gets HTTP 403 on another crew member's data.
Private medical conferences are visible only to the astronaut and the flight surgeon (not the CMO), as on the ISS.

## What it does

| Module | Details |
|---|---|
| **Real wearable data** | Heart rate, activity and sleep are real 5-minute streams from 4 people in the public Fitbit dataset (Furberg et al., Zenodo 53894, CC-BY 4.0), replayed as the 4 astronauts. SpO2, temperature, cabin data and emergencies are simulated. Every number carries a `REAL`, `SIM` or `MODEL` tag |
| **Personal anomaly detection** | One Isolation Forest per astronaut, trained on 14 days of their own data. Features are deviations from their own rhythm for the same hour and activity level, so exercise is normal but a racing heart at rest is not |
| **Smart alerts + proactive check-in** | Alerts need persistence (30 min → 90 min → 3 h critical). At 30 min VitalOrbit asks the astronaut "How do you feel?". "I'm fine, I was exercising" labels the alert as a false positive (feedback for the model); "I don't feel well" opens the assistant on the right protocol |
| **Explainable Health Score** | 100 minus visible penalties (heart rate, SpO2, temperature, sleep debt, ML anomaly) |
| **Long-mission risks (RIDGE)** | Radiation dose vs the 600 mSv career limit, bone and muscle loss projected from each person's real exercise minutes, vision (SANS), behavioural health from daily check-ins and real sleep, cabin CO2. Each risk shows the projection at mission end and the day it crosses its limit |
| **AI medical assistant** | Real chatbot (Claude, or a local model via Ollama, or onboard protocols), streaming replies, English and Arabic, retrieval from an onboard knowledge base, live vitals and risks as context. Safety stays in code: protocol steps, timers and red flags come from the knowledge base; drugs are checked against the pharmacy; dispensing needs confirmation and is logged |
| **Guided procedure mode** | Hands-free, one step at a time, step timers, read aloud (text-to-speech), voice input |
| **Case reports to Earth** | One click builds a SOAP note (Subjective, Objective, Assessment, Plan) and downlinks it to the flight surgeon |
| **Store-and-forward comms** | Messages travel at light speed with live progress; solar conjunction blackout queues them |
| **Radiation-aware pharmacy** | `effective_expiry = label_expiry − (crew_dose ÷ 1.8 mSv/day) × sensitivity`; CRUD for the CMO, low stock, expiry, substitutes |
| **Mission context** | Live trajectory computed from orbital geometry: the light delay (19 min on day 432), Earth distance and the next solar conjunction all come from the same model; solar wind particles turn into a storm during a solar particle event |
| **Body risk map + EVA readiness** | Dotted body with pulsing hotspots for each long-mission risk; EVA GO / NO-GO per astronaut with reasons |
| **Medical emergency** | One tap alerts all crew and Earth and opens CPR adapted to weightlessness (Evetts-Russomano / handstand) as a guided procedure |

1 real second = 5 mission minutes, so a 3-hour anomaly appears in about 36 seconds.

## Demo script (about 2 minutes)
1. Sign in as **Amina (CMO)**: live Earth–Mars trajectory (mission day 432, crew on the Mars surface, Earth 19 light-minutes away, solar conjunction blackout ahead), crew status with EVA GO / NO-GO, real Fitbit data tags.
2. Scenario console → Sara → **Tachycardia**. Her card turns amber then red; alerts escalate.
3. Sign in as **Sara**: VitalOrbit asks "How do you feel?" → **I don't feel well** → the assistant already knows it is her heart, gives the protocol with timers, checks the drug ✅, **Start guided procedure**, **Send case report to Earth**.
4. Sign in as **Dr. Mansour (Earth)**: banner "telemetry is 19 minutes old", the SOAP case report and the alert arrive 19 minutes late. Open **Long-term risks**: Kenji's vision (SANS) and the radiation projection exceeding 600 mSv.
5. **Pharmacy**: Amoxicillin-clavulanate is still valid by label but expired by radiation.
6. Close: "On Mars, help can't be twenty minutes away."

## Architecture

```
frontend/   React 18 (UMD + htm, no build step), hand-drawn icon set, light and dark themes
  js/core.js          API client, hooks, icons, charts, shared components
  js/views-health.js  login, shell, crew overview, astronaut health, long-term risk board
  js/views-ops.js     assistant, pharmacy, comms, scenario console, app routing
backend/    FastAPI
  engine.py      real-data replay, simulation, per-astronaut Isolation Forest, score, alerts, comms queue
  ridge.py       long-mission risk models (RIDGE)
  assistant.py   chatbot: retrieval, Claude / Ollama / protocols, drug checks, SOAP reports
  protocols.py   onboard first-aid protocols and space-medicine facts
  pharmacy.py    SQLite inventory with radiation-adjusted expiry
  auth.py        demo identities, roles, privacy checks
scripts/prepare_fitbit.py   builds data/fitbit/crew_wearable.csv.gz from the public dataset
```

## Data and honesty
- NASA OSDR has no public astronaut vital-sign time series. We use **real civilian wearable data** for heart rate, activity and sleep, and simulate what Fitbit does not measure. See `DATASETS.md`.
- Sources: Fitbit dataset (Zenodo 53894, CC-BY 4.0); RAD dose rates (Zeitlin et al., Science 2013; Hassler et al., Science 2014); NASA-STD-3001 career dose limit 600 mSv; bone loss (LeBlanc et al. 2000), exercise countermeasures (Smith et al. 2012); drug stability in flight (Du et al., AAPS J 2011); NASA HRP hazards.
- **Our assumptions** (labelled in the app): per-drug radiation sensitivity, exercise mitigation and Mars-gravity factors, simulated SANS exams and check-in history.
- The assistant gives first-aid guidance, not a diagnosis, and always escalates to the CMO and flight surgeon.
- AI use: built with help from Claude (Anthropic).
