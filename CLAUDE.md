# UnoSyn — NASA Space Apps Cairo 2026

## Context
Team of CS students from Egyptian Chinese University (ECU) competing in NASA Space Apps Cairo 2026.
Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**.
Hackathon: ~48 hours. Judges value a working demo over a huge unfinished idea.

## Problem
On long missions (Mars), messages to Earth take up to ~20 min each way, so the crew must handle
medical issues alone. Key health risks: bone loss, muscle atrophy, vision damage (SANS), radiation,
poor sleep, isolation/stress. NASA's current solutions mostly depend on ground support.

## Product: UnoSyn — onboard crew health system (software only)
1. **Crew Dashboard** — card per astronaut with a Health Score (/100) and vital signs (HR, SpO2, temp, sleep).
2. **Anomaly Detection** — Isolation Forest (scikit-learn) on vital signs; flags unusual patterns early.
3. **Smart Alerts** — e.g. "Astronaut X: abnormal heart rate for 3 hours".
4. **AI Medical Assistant** — chat that walks the astronaut step by step through first aid (offline concept).
5. **MedInventory** — medicines, quantities, expiry; warns on low stock / near expiry
   (radiation shortens drug shelf life). Linked to the assistant: a suggested drug is checked for availability and validity.

## Stack
- Backend: Python, FastAPI
- ML: scikit-learn (Isolation Forest)
- Frontend: React
- AI: any LLM API for the assistant
- Data: simulated vitals + NASA Open Science Data Repository (OSDR/GeneLab), Life Sciences Data Archive, Twins Study

## Team split
| Person | Responsibility |
|---|---|
| 1 | Frontend: dashboard and cards |
| 2 | Frontend: MedInventory page and chat |
| 3 | ML: anomaly detection and Health Score |
| 4 | Backend: FastAPI, database, LLM |
| 5 | Research, presentation, video |

If fewer than 5 people: MedInventory = simple CRUD page. Minimum viable demo = Dashboard + Anomaly Detection.

## Registration description (579 chars / 91 words; limit 600 chars / 100 words)
On Mars missions, messages to Earth take up to 20 minutes each way, so crews must handle medical issues alone. UnoSyn is an onboard crew health system: a dashboard with a health score per astronaut, ML anomaly detection that flags abnormal vital signs early, an AI medical assistant for step-by-step first aid, and a smart pharmacy that warns of low stock and radiation-shortened drug expiry. We'll build a web app with FastAPI, scikit-learn and React, using simulated vitals with thresholds grounded in NASA OSDR spaceflight data (Inspiration4, bone, vision, radiation studies).

## Docs
- `DATASETS.md`: dataset verification. OSDR has no astronaut vital-sign time series, so vitals are simulated; NASA data grounds the risks and thresholds only.
- `BUILD_PLAN.md`: 48-hour plan, API contract, design decisions, demo scenario.
- `VIDEO_SCRIPT.md`: 90-second registration video script.
