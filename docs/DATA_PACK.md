# Data pack: what we argue about and pick

Status: proposal for the team to decide. Endpoints marked checked responded on 2026-11-13. Anything marked **verify** was not opened yet.

## Roles and gaps
| Owner | Has | 
|---|---|
| Maro | Smart pharmacy (MedInventory), dashboard, all UI |
| Marcelo | Chatbot (AI assistant) |
| Ammar | Machine learning (anomaly detection) |

**Unowned, needs an owner:**
1. Backend: FastAPI, SQLite, the API contract between UI, ML and chatbot (everyone depends on it).
2. Vitals simulator: generates the 4 astronauts' data and the "inject emergency" button.
3. Health Score and Smart Alerts (rules on top of ML flags). Natural fit: Ammar.
4. Pitch, video, slides, final demo script and integration testing.

## A. Vitals and ML (Ammar)
| Option | Use | Status |
|---|---|---|
| **LifeSnaps** (Zenodo 7229547, `rais_anonymized.zip`, 615 MB) | 4 months of Fitbit data: heart rate, sleep, steps. Best fit for personal baselines and sleep | Checked, downloadable |
| **WESAD** (UCI dataset 465) | Wrist wearable, stress and affect labels. Good for stress anomalies | Page checked; files are large, verify size |
| **PMData** (Simula) | Fitbit HR and sleep for 16 people | Site did not respond from here: verify |
| Pure simulation | Baselines in `DATASETS.md` | Needed anyway for SpO2 and temperature, which wearables rarely give |

Recommendation: train the Isolation Forest on LifeSnaps heart rate and sleep, simulate SpO2 and temperature, then run the simulated astronauts through it. Argue: real data for training or simulation only.

## B. Pharmacy (Maro)
| Need | Source | Status |
|---|---|---|
| Drug facts, warnings, dosing text | **openFDA drug labels** `api.fda.gov/drug/label.json` | Checked, works, no key needed for light use |
| Drug name normalisation | RxNorm (`rxnav.nlm.nih.gov`) | Did not respond from here: verify |
| Which medicines are on board | NASA ISS medical kit list | Not found yet: verify. Fallback: build our own list of about 20 common space medicines (pain, allergy, sleep, nausea, antibiotics) and label it as such |
| Radiation shortening of shelf life | Du et al., AAPS Journal 2011 | Paper only. `effective_expiry = expiry - days_in_mission x radiation_factor`: the factor is **our assumption**, label it |
| Dose rates for the factor | Published ISS and Mars-transit dose figures | verify exact numbers before quoting |

## C. Chatbot (Marcelo)
| Need | Source |
|---|---|
| First-aid and risk knowledge | NASA HRP pages: hazards, risks, ongoing research (links in `PROGRESS.md`) |
| Medicine answers | The pharmacy table above, via the backend, never from memory |
| Safety | Always end with "contact the flight surgeon". Not a diagnosis. Fixed fallback answers for no internet |

## D. Pitch grounding (research)
OSDR studies in `DATASETS.md` (Inspiration4, bone, SANS, radiation) are cite-only. 445 study metadata files are downloaded locally, about 14 timed out. Their IDs are not yet confirmed against that set.

## Decisions to make
1. Wearable data for ML (LifeSnaps) or pure simulation?
2. Who owns backend and simulator?
3. Radiation factor: pick a value, write the source, label it an assumption.
4. Medicine list: NASA kit list if we can find it, otherwise our own.
