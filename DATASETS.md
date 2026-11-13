# Dataset verification (checked 2026-11-06)

Checked against the live OSDR search API (`osdr.nasa.gov/osdr/data/search`) and public NASA pages.

## Bottom line
**OSDR has no public astronaut vital-sign time series (HR, SpO2, temperature, sleep).**
Almost everything there is omics data (RNA-seq, proteomics, microbiome), mostly from mice and cells.
So the **vitals feeding the dashboard and Isolation Forest must be simulated**. NASA data is used to
**ground the simulation and the risk story**, not as live input. Say this honestly in the pitch: judges respect it.

## What actually exists

| Source | Status | What it gives us | How we use it |
|---|---|---|---|
| **Inspiration4 on OSDR** (OSD-569 to OSD-574, OSD-630, OSD-687) | ✅ Public (processed data; raw human data is controlled-access) | Blood, plasma, immune, microbiome changes in 4 civilian crew after 3 days in space | Cite as evidence that spaceflight shifts human physiology within days. One slide. |
| **OSD-903 / OSD-943**: longitudinal astronaut transcriptomics | ✅ Public | Immune response changes in astronauts across a mission | Supports "immune/stress" risk in the pitch |
| **Bone/muscle studies** (e.g. OSD-342 myostatin, OSD-396 fracture repair, OSD-195 21-day bedrest) | ✅ Public | Bone and muscle loss in spaceflight and analogs | Backs the bone-loss / atrophy risks |
| **SANS**: OSD-816 (human eye model), OSD-397 (mouse retina) | ✅ Public | Vision damage mechanism | Backs the SANS risk |
| **Radiation**: OSD-334, OSD-720, OSD-881 (heart tissue under space radiation) | ✅ Public | Cardiac effects of radiation | Backs radiation → heart-risk link |
| **NASA Twins Study** | ⚠️ Not a browsable OSDR study. Only OSD-689 references it. Raw data is controlled-access (needs a formal request and committee approval: weeks, not 48 h) | Published findings (Garrett-Bakelman et al., *Science* 2019) | Cite the **paper's findings** only. Do not claim we used the raw data. |
| **Life Sciences Data Archive (LSDA)** | ⚠️ Portal is up, but individual crew medical data needs a formal request; medical data is limited to US crew, and requests usually need funded research | Historical heart-rate/EKG data exists | Cite only. Not usable in 48 h. |

## Simulation plan (what to build instead)
Generate per-astronaut time series (e.g. 1 reading / 5 min over 7 days) with realistic baselines:

| Vital | Normal baseline | Injected anomaly for demo |
|---|---|---|
| Heart rate | 60–80 bpm, daily rhythm (lower at night) | Sustained 115+ bpm for 3 h (tachycardia) |
| SpO2 | 96–99 % | Gradual drop to 91–93 % |
| Body temp | 36.5–37.2 °C | 38.3 °C fever spike |
| Sleep | 6–7.5 h/night (ISS crews average about 6 h) | 3 nights of < 4.5 h |

Note on drug shelf life (MedInventory): the claim that radiation shortens drug shelf life comes from NASA
studies of medicines flown on the ISS (Du et al., *AAPS Journal* 2011), not from OSDR. Cite that paper.

## Pitch wording (safe)
> "Live vitals are simulated with physiologically realistic baselines. The health risks we model and our
> thresholds are grounded in NASA OSDR spaceflight studies (Inspiration4, bone, SANS and radiation datasets)
> and published NASA Twins Study findings."

## Links
- OSDR: https://osdr.nasa.gov/bio/repo/
- Inspiration4 example: https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
- OSDR controlled-access guide: https://www.nasa.gov/reference/osdr-tutorials-requesting-controlled-access-datasets/
- LSDA: https://lsda.jsc.nasa.gov/

## Update (2026-11-13): real wearable data in the app
- Heart rate, activity and sleep of the 4 astronauts are **real**: 5-minute streams from 4 participants of the
  "Crowd-sourced Fitbit datasets 03.12.2016-05.12.2016" (Furberg et al., Zenodo record 53894, CC-BY 4.0).
- Built by `scripts/prepare_fitbit.py` into `data/fitbit/crew_wearable.csv.gz` (148 KB). The raw 25 MB zip is not committed.
- SpO2, temperature, cabin environment, SANS exams and check-in history remain simulated and are tagged SIM in the UI.
