"""Turn the public Fitbit dataset into 5-minute real wearable streams for the 4 VitalOrbit astronauts.

Source: Furberg, Brinton, Keating, Ortiz. "Crowd-sourced Fitbit datasets 03.12.2016-05.12.2016", Zenodo record 53894,
CC-BY 4.0. https://zenodo.org/records/53894  (file mturkfitbit_export_4.12.16-5.12.16.zip)

Usage: .venv/bin/python -I scripts/prepare_fitbit.py data/fitbit/raw data/fitbit/crew_wearable.csv.gz
Picks the 4 participants with the most complete heart-rate + sleep data and writes, per 5-minute slot:
participant, slot, hr (mean bpm), intensity (0 sedentary .. 3 very active), asleep (fraction of minutes asleep).
"""
import sys
from pathlib import Path

import pandas as pd

raw, out = Path(sys.argv[1]), Path(sys.argv[2])
FMT = "%m/%d/%Y %I:%M:%S %p"

hr = pd.read_csv(raw / "heartrate_seconds_merged.csv")
hr["t"] = pd.to_datetime(hr["Time"], format=FMT).dt.floor("5min")
hr = hr.groupby(["Id", "t"])["Value"].mean().rename("hr")

inten = pd.read_csv(raw / "minuteIntensitiesNarrow_merged.csv")
inten["t"] = pd.to_datetime(inten["ActivityMinute"], format=FMT).dt.floor("5min")
inten = inten.groupby(["Id", "t"])["Intensity"].mean().rename("intensity")

sl = pd.read_csv(raw / "minuteSleep_merged.csv")
sl["t"] = pd.to_datetime(sl["date"], format=FMT).dt.floor("5min")
sl["asleep"] = (sl["value"] == 1).astype(float)
sl = sl.groupby(["Id", "t"])["asleep"].mean()

df = pd.concat([hr, inten, sl], axis=1).reset_index()
df["asleep"] = df["asleep"].fillna(0.0)

# rank people by heart-rate coverage and number of nights with sleep logged
cov = df.groupby("Id").agg(hr_slots=("hr", "count"), nights=("asleep", lambda s: (s > 0).sum() / 60))
cov = cov[cov["nights"] > 3].sort_values("hr_slots", ascending=False)
print(cov.head(8))
chosen = list(cov.index[:4])

rows = []
for k, pid in enumerate(chosen):
    d = df[df["Id"] == pid].set_index("t").sort_index()
    full = pd.date_range(d.index.min().normalize(), d.index.max().normalize() + pd.Timedelta("1D"), freq="5min", inclusive="left")
    d = d.reindex(full)
    d["gap"] = d["hr"].isna()
    d["intensity"] = d["intensity"].fillna(0.0)
    d["asleep"] = d["asleep"].fillna(0.0)
    # keep the longest run of days where HR coverage is good
    day_cov = d["hr"].notna().groupby(d.index.date).mean()
    good = [day for day, c in day_cov.items() if c > 0.8]
    d = d[pd.Index(d.index.date).isin(good)].copy()
    d["imputed"] = d["gap"].astype(int)            # sensor gap: filled for display, never scored by the ML
    d["hr"] = d["hr"].interpolate().bfill().ffill()
    print(f"astronaut {k + 1} <- participant {pid}: {len(good)} good days, HR mean {d['hr'].mean():.1f}")
    rows.append(pd.DataFrame({"astronaut": k + 1, "participant": pid, "minute_of_day": d.index.hour * 60 + d.index.minute,
                              "day": pd.factorize(pd.Index(d.index.date))[0], "hr": d["hr"].round(1),
                              "intensity": d["intensity"].round(2), "asleep": d["asleep"].round(2),
                              "imputed": d["imputed"]}))

out.parent.mkdir(parents=True, exist_ok=True)
pd.concat(rows).to_csv(out, index=False, compression="gzip")
print("wrote", out)
