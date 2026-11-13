# Progress log

Newest entries at the bottom. One entry per step so the whole team can follow.

## Step 1: Challenge resources checked (2026-11-13)
- Read the challenge **Resources tab** (spaceappschallenge.org/2026/challenges/health-monitoring-software/).
- It has only 5 links, **no dataset**:
  - NASA HRP: [5 Hazards](https://www.nasa.gov/hrp/hazards/), [Risks](https://www.nasa.gov/hrp/risks/), [Ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
  - CSA: [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), [Why Do We Conduct Science Experiments in Space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
- The HRP hazards page is an overview (radiation, isolation, distance, gravity, hostile environments). No data files.
- Conclusion: we choose our own data. Matches `DATASETS.md`.

## Step 2: OSDR metadata pulled (2026-11-13)
- OSDR (osdr.nasa.gov) has **577 studies**. Raw files total about **185 TB**, so we do **not** download raw data.
- Downloaded the small ISA metadata zip for each study: **445 files, 42 MB**. About 14 studies timed out; re-run the script to fill the gaps.
- Script: `scripts/download_osdr_metadata.py`. Files are committed in `data/osdr_metadata/` (445 zips, 42 MB).
- Not yet done: confirm that the OSD IDs cited in `DATASETS.md` (569-574, 342, 396, 195, 816, 397, 334, 720, 881) exist in the downloaded set.

## Step 3: Data selection (open, to discuss)
Proposed split, nothing downloaded yet:

| Need | Proposed source |
|---|---|
| Vitals baselines and ML training | A public wearable dataset (WESAD, PMData or LifeSnaps) for realistic noise and daily rhythm, or pure simulation |
| Crew norms (sleep, HR, SpO2) | Published values (ISS sleep about 6 h, Twins Study paper): cite, no files |
| Medicine list and drug facts | NASA ISS medical kit list plus openFDA drug labels |
| Radiation factor | Published ISS and Mars-transit dose rates, Du et al. 2011. **Assumption, label it as such** |
| Assistant knowledge | NASA HRP hazard and risk pages, optionally HRP evidence reports |
| Risk grounding | The OSDR studies listed in `DATASETS.md` (cite only) |

Decision needed: which wearable dataset, or simulation only.

## Step 4: Roles and data pack (2026-11-13)
- Roles so far: Maro = pharmacy, dashboard, UI. Marcelo = chatbot. Ammar = ML.
- Gaps: backend and API, simulator, health score and alerts, pitch and demo. See `docs/DATA_PACK.md`.
- Checked live: openFDA, LifeSnaps (Zenodo), WESAD (UCI) respond. PMData and RxNorm did not respond from here.

## Step 5: Everything committed (2026-11-13)
- `data/osdr_metadata/`: the 445 OSDR metadata zips (42 MB). Missing studies: re-run the script.
- `docs/sources/nasa_hrp_hazards.html`: saved copy of the NASA HRP hazards page (overview only, no data).
