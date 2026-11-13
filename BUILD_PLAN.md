# UnoSyn: 48-hour build plan

Rule #1: **the demo must work at hour 40.** The last 8 hours are for polish, the video and slides only.
Rule #2: build in priority tiers. Don't start a tier before the one above it is shown working end-to-end.

| Tier | Feature | Must have by |
|---|---|---|
| P0 | Simulated vitals → FastAPI → Dashboard cards + Health Score | H16 |
| P0 | Isolation Forest anomaly flags + alerts | H24 |
| P1 | MedInventory (CRUD + low-stock/expiry warnings) | H32 |
| P1 | AI Medical Assistant chat, checks inventory before suggesting a drug | H36 |
| P2 | "Inject emergency" demo button, charts, polish | H40 |

---

## Roles
The plan is written for **3 people** (the team in the photo). With 5, split as in `CLAUDE.md` (A → persons 1+2, B → 4, C → 3, person 5 = research/video from H0).

| | Person A: Frontend | Person B: Backend + LLM | Person C: ML + data + pitch |
|---|---|---|---|
| Owns | React app: Dashboard, Alerts, Inventory page, Chat | FastAPI, SQLite, endpoints, LLM integration | Vitals simulator, Isolation Forest, Health Score, slides + video |

## Shared contract (agree on this in the first hour, then don't change it)

```
GET  /crew                        → [{id, name, role, health_score, status, latest:{hr, spo2, temp, sleep_h}}]
GET  /crew/{id}/vitals?hours=24   → [{ts, hr, spo2, temp, sleep_h, anomaly:bool, anomaly_score}]
GET  /alerts                      → [{id, crew_id, severity, message, ts}]
GET  /inventory                   → [{id, name, qty, min_qty, expiry, radiation_factor, status}]
POST /inventory / PUT /inventory/{id} / DELETE /inventory/{id}
POST /chat {crew_id, message}     → {reply, suggested_drugs:[{name, available, valid}]}
POST /demo/inject {crew_id, type} → starts an anomaly scenario (tachycardia | hypoxia | fever)
```
Person A builds against **mock JSON** of exactly this shape until B's endpoints are live.

## Key design decisions (already made, don't reopen them)
- **DB:** SQLite + SQLModel. No Postgres, no Docker.
- **Simulator:** Python script writes 7 days of history per astronaut at startup, then a background task adds a new reading every 2 s (sped-up time) so the dashboard visibly moves.
- **Isolation Forest:** train on each astronaut's normal history (features: hr, spo2, temp, plus rolling 1-h mean/std of hr). `contamination=0.02`. Score each new reading.
- **Health Score (/100):** `100 − penalties`. Each vital gets a penalty by distance outside its normal range (max 20 each), plus a sleep-debt penalty (max 15) and an anomaly penalty (−15 if flagged in the last hour). Clamp to 0–100. Green ≥ 80, amber 60–79, red < 60.
- **Alerts:** rule on top of the ML flags. If the anomaly persists ≥ N consecutive readings, raise "Astronaut X: abnormal heart rate for 3 hours" (sim-time).
- **Radiation-adjusted expiry:** `effective_expiry = expiry − (days_in_mission × radiation_factor)`. Flag if `qty < min_qty` or effective expiry < 30 days away.
- **LLM:** system prompt = first-aid assistant, step-by-step, short, always ends with "consult flight surgeon when comms allow". Pass it the current vitals + **the inventory list**, so it only suggests drugs on board. Backend then double-checks each suggested drug against the DB (available + not effectively expired). Keep a hard-coded fallback reply in case there's no internet on stage.
- **"Offline" concept:** say in the pitch that onboard it would run on a local model; for the demo we use an API.

---

## Timeline

### H0–H4: Setup
- All: agree on the contract above, create the GitHub repo (`/backend`, `/frontend`, `/ml`), get LLM API keys.
- A: `npm create vite@latest` (React), layout, routing (Dashboard / Inventory / Assistant), mock JSON.
- B: FastAPI skeleton, SQLite models (Crew, Vital, Alert, Medicine), CORS, `/crew` returns seed data.
- C: vitals simulator → CSV/DB for 4 astronauts × 7 days, with the baselines in `DATASETS.md`.

### H4–H16: P0 core
- A: Crew cards (name, score ring, 4 vitals, status color) + astronaut detail page with a 24-h chart (Recharts).
- B: real `/crew`, `/crew/{id}/vitals`, background task streaming new readings.
- C: Health Score function + Isolation Forest training script; save model with `joblib`.
- **H16 checkpoint:** dashboard shows live, moving data from the backend. ✅ = minimum demo exists.

### H16–H24: Anomaly detection end-to-end
- C: scoring function plugged into the stream; anomaly scenarios for `/demo/inject`.
- B: `/alerts` + alert rule (persistence), `/demo/inject`.
- A: alerts panel/toasts, red anomaly dots on the chart, "Inject emergency" button.
- **H24 checkpoint:** press inject → within seconds the card turns red, the score drops and an alert appears. **Sleep in shifts after this.**

### H24–H32: MedInventory
- B: inventory CRUD + radiation-adjusted expiry + status.
- A: inventory table with warning badges (low stock / expiring), add/edit form.
- C: seed ~20 realistic ISS medicines (ibuprofen, acetaminophen, promethazine, epinephrine, …), start slides.

### H32–H40: AI Assistant
- B: `/chat` with LLM + inventory check + fallback replies.
- A: chat UI; show suggested drugs with ✅ available / ❌ out of stock / ⚠️ expired.
- C: write and rehearse the demo scenario (below); record screen captures for the video.
- **H40 checkpoint: FEATURE FREEZE.** Only bug fixes from here on.

### H40–H48: Ship
- A+B: bug fixes, deploy or make sure it runs locally on the demo laptop (with a backup recording).
- C: finish the video (see `VIDEO_SCRIPT.md`) and slides; submit everything before the deadline, not at it.

---

## Demo scenario (2 minutes, rehearse 3×)
1. Dashboard: 4 crew members, all green. "Mission day 142, 18 min from Earth."
2. Press **Inject tachycardia** on one astronaut → chart spikes, ML flags it, the score drops 92 → 58, alert: "abnormal heart rate for 3 hours".
3. Open the Assistant: "I feel dizzy and my heart is racing." → step-by-step guidance, suggests a drug → shown ✅ available.
4. Open Inventory: one drug marked ⚠️ "expires early due to radiation", another low stock.
5. Close: "No waiting 40 minutes for Earth: the crew is its own first responder."

## Cut list (if you're behind, drop these in order)
1. Charts on the detail page → show the last value only
2. Inventory edit form → read-only table with seeded data
3. Live LLM → canned assistant replies
4. Never cut: dashboard + anomaly flag + alert
