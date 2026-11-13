"""Builds the 7-slide VitalOrbit deck: HTML slides -> PNG (Firefox headless) -> PDF (Pillow).

Usage: python3 submission/build_slides.py     (app screenshots are read from submission/shots/*.png if present)
"""
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "slides"
SHOTS = HERE / "shots"
W, H = 1920, 1080


def logo_svg(size=56):
    big = size > 200
    n, g, t, dots = (420 if big else 90), math.pi * (3 - math.sqrt(5)), 0.4, []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        x, z = math.cos(i * g) * r, math.sin(i * g) * r
        y2, z2 = y * math.cos(t) - z * math.sin(t), y * math.sin(t) + z * math.cos(t)
        if z2 > -0.15:
            d = (z2 + 1) / 2
            dots.append(f'<circle cx="{16 + x * 6.4:.2f}" cy="{13.6 - y2 * 6.4:.2f}" r="{(0.12 + 0.2 * d) if big else (0.38 + 0.42 * d):.2f}" fill="#4aa8ff" opacity="{0.3 + 0.7 * d:.2f}"/>')
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 32 32">{"".join(dots)}'
            '<circle cx="18.9" cy="11" r="1.45" fill="#ff7a59"/>'
            '<path d="M4.9 9.8 L16 29 L27.1 9.8" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></svg>')


CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=block');
* { box-sizing: border-box; margin: 0; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0b0d10; color: #e7eaee; font-family: 'IBM Plex Sans', 'Ubuntu Sans', sans-serif; }
.s { position: relative; width: 1920px; height: 1080px; padding: 90px 110px; }
.top { position: absolute; left: 110px; top: 54px; display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 22px; }
.top small { color: #7c8693; font-weight: 400; font-size: 18px; margin-left: 8px; }
.foot { position: absolute; left: 110px; right: 110px; bottom: 44px; display: flex; justify-content: space-between; color: #5f6873; font-size: 18px; }
.k { color: #7c8693; text-transform: uppercase; letter-spacing: .12em; font-size: 20px; font-weight: 600; }
h1 { font-size: 84px; line-height: 1.04; letter-spacing: -0.03em; font-weight: 700; }
h2 { font-size: 60px; line-height: 1.08; letter-spacing: -0.025em; font-weight: 700; margin-top: 14px; }
p.lead { font-size: 30px; line-height: 1.45; color: #b4bcc7; margin-top: 22px; max-width: 1200px; }
.acc { color: #4aa8ff; } .org { color: #ff7a59; } .ok { color: #34c77b; } .warn { color: #f0a92e; } .crit { color: #f0545c; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.grid { display: grid; gap: 22px; }
.card { background: #111418; border: 1px solid #242a32; border-radius: 18px; padding: 26px 28px; }
.card b { display: block; font-size: 27px; margin-bottom: 8px; }
.card span { font-size: 21px; color: #9aa4b0; line-height: 1.45; }
.big { font-family: 'IBM Plex Mono', monospace; font-size: 64px; font-weight: 600; letter-spacing: -0.02em; }
.shot { border-radius: 16px; border: 1px solid #2a313b; box-shadow: 0 30px 80px rgba(0,0,0,.55); width: 100%; display: block; }
.ph { border-radius: 16px; border: 1px dashed #323a45; background: #111418; display: grid; place-items: center; color: #5f6873; font-size: 22px; }
.tag { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600; letter-spacing: .08em; padding: 3px 9px; border-radius: 6px; border: 1px solid; }
.flow { display: flex; align-items: stretch; gap: 16px; }
.flow .card { flex: 1; }
.arrow { align-self: center; color: #4aa8ff; font-size: 40px; }
"""


def shot(name, h=520):
    p = SHOTS / f"{name}.png"
    if p.exists():
        return f'<img class="shot" src="{p.as_uri()}" style="height:{h}px;object-fit:cover;object-position:top left">'
    return f'<div class="ph" style="height:{h}px">screenshot: {name}</div>'


def frame(i, body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="s">
<div class="top">{logo_svg(40)}VitalOrbit<small>Medicine beyond Earth's reach</small></div>
{body}
<div class="foot"><span>NASA Space Apps Cairo 2026 · Create Health Monitoring Software for Astronauts on Space Missions</span><span class="mono">{i} / 7</span></div>
</div></body></html>"""


SLIDES = []

# 1 Title
SLIDES.append(f"""
<div style="position:absolute;left:110px;top:250px;width:980px">
  <div class="k">Team UnoSyn · Egyptian Chinese University</div>
  <h1 style="font-size:120px;margin-top:22px">VitalOrbit</h1>
  <p class="lead" style="font-size:38px">An autonomous onboard health system for deep-space crews.</p>
  <p class="lead">When Earth is <b class="acc">19 light-minutes</b> away, the crew is its own first responder.</p>
</div>
<div style="position:absolute;right:120px;top:200px">{logo_svg(620)}</div>
""")

# 2 Problem
SLIDES.append(f"""
<div style="margin-top:80px" class="k">The problem</div>
<h2>On Mars, help can't be 40 minutes away.</h2>
<p class="lead">Today, astronaut health depends on flight surgeons on the ground. On a Mars mission that link breaks down.</p>
<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:56px">
  <div class="card"><div class="big acc">4–24 min</div><b style="margin-top:10px">one-way signal delay</b><span>A question and its answer take up to 48 minutes; in our mission model Earth is 19.1 light-minutes away on day 432.</span></div>
  <div class="card"><div class="big warn">~2 weeks</div><b style="margin-top:10px">solar conjunction blackout</b><span>When the Sun sits between Mars and Earth, there is no link at all.</span></div>
  <div class="card"><div class="big crit">5 hazards</div><b style="margin-top:10px">NASA's RIDGE risks</b><span>Radiation, Isolation, Distance, Gravity (bone, muscle, vision), hostile Environment: slow damage that no one on Earth sees in time.</span></div>
</div>
""")

# 3 Solution
SLIDES.append(f"""
<div class="grid" style="grid-template-columns:780px 1fr;gap:60px;margin-top:70px;align-items:start">
  <div>
    <div class="k">The solution</div>
    <h2>One system that detects, guides and remembers.</h2>
    <div class="grid" style="margin-top:36px;gap:16px">
      <div class="card"><b><i style="color:#4aa8ff;font-style:normal">●</i> Personal anomaly detection</b><span>An ML model per astronaut, trained on their own real wearable data, plus clinical safety limits.</span></div>
      <div class="card"><b><i style="color:#ff7a59;font-style:normal">●</i> Long-mission risk forecasting</b><span>Radiation vs career limit, bone and muscle loss, vision (SANS), mood: projected to mission end.</span></div>
      <div class="card"><b><i style="color:#34c77b;font-style:normal">●</i> Offline medical assistant + smart pharmacy</b><span>Guided first aid with timers, voice and Arabic; every drug checked for stock and radiation-shortened expiry.</span></div>
    </div>
  </div>
  <div style="padding-top:30px">{shot("crew", 760)}</div>
</div>
""")

# 4 How it works
SLIDES.append(f"""
<div style="margin-top:70px" class="k">How it works</div>
<h2>From a heartbeat to a decision, onboard.</h2>
<div class="flow" style="margin-top:48px">
  <div class="card"><span class="tag ok" style="color:#34c77b">REAL</span> <span class="tag" style="color:#7c8693">SIM</span><b style="margin-top:14px">Vitals</b><span>Fitbit heart rate, activity, sleep (public dataset); simulated SpO₂ and temperature.</span></div>
  <div class="arrow">→</div>
  <div class="card"><b>Personal ML</b><span>Isolation Forest on deviations from each person's own rhythm; alert after 30 min of persistence.</span></div>
  <div class="arrow">→</div>
  <div class="card"><b>Check-in</b><span>"How do you feel?" The answer labels the alert and opens the right protocol.</span></div>
  <div class="arrow">→</div>
  <div class="card"><b>Assistant + pharmacy</b><span>Steps, timers, red flags; medicine checked live. Dispensing is logged.</span></div>
  <div class="arrow">→</div>
  <div class="card"><b>Earth, delayed</b><span>SOAP case report and alerts arrive 19 min later; private line to the flight surgeon.</span></div>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:40px;gap:30px">{shot("assistant", 330)}{shot("earth", 330)}</div>
""")

# 5 Validity
SLIDES.append(f"""
<div class="grid" style="grid-template-columns:1fr 820px;gap:70px;margin-top:70px">
  <div>
    <div class="k">Does it work?</div>
    <h2>Measured on real wearable data.</h2>
    <p class="lead">3,456 real readings from 4 people, plus 12 injected emergencies (tachycardia, low oxygen, fever).</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:40px">
      <div class="card"><div class="big ok">12 / 12</div><span>emergencies detected, correct vital named every time</span></div>
      <div class="card"><div class="big">45 min</div><span>median time to the first alert, critical within 3 h in 100 %</span></div>
      <div class="card"><div class="big">0.08</div><span>false warnings per crew-day (1 in 12 crew-days)</span></div>
      <div class="card"><div class="big">0</div><span>false critical alerts</span></div>
    </div>
  </div>
  <div style="padding-top:20px">
    <div class="card" style="padding:30px 34px">
      <b>Honest by design</b>
      <span style="display:block;margin-top:8px">Every number in the app is tagged <span class="tag" style="color:#34c77b">REAL</span>, <span class="tag" style="color:#7c8693">SIM</span> or <span class="tag" style="color:#4aa8ff">MODEL</span>.</span>
      <ul style="margin-top:22px;padding-left:24px;font-size:21px;line-height:1.7;color:#9aa4b0">
        <li>Fitbit dataset, Zenodo 53894 (CC-BY 4.0)</li>
        <li>Radiation: Curiosity RAD, 1.8 mSv/day cruise, 0.64 on Mars</li>
        <li>Career limit 600 mSv (NASA-STD-3001)</li>
        <li>Bone loss and countermeasures: LeBlanc 2000, Smith 2012</li>
        <li>Drug potency in flight: Du et al. 2011</li>
        <li>Light delay and conjunction from an orbital model</li>
      </ul>
    </div>
  </div>
</div>
""")

# 6 Impact
SLIDES.append(f"""
<div class="grid" style="grid-template-columns:1fr 820px;gap:70px;margin-top:70px;align-items:start">
  <div>
    <div class="k">Impact</div>
    <h2>Built for Mars. Useful wherever the doctor is far away.</h2>
    <div class="grid" style="margin-top:40px;gap:16px">
      <div class="card"><b>For crews</b><span>Earlier warnings, guided care in minutes instead of a 40-minute round trip, privacy for each astronaut.</span></div>
      <div class="card"><b>For flight surgeons</b><span>Structured SOAP reports and long-term risk trends, ready when the link returns.</span></div>
      <div class="card"><b>On Earth</b><span>Antarctic stations, submarines, offshore rigs, remote villages and field hospitals.</span></div>
    </div>
  </div>
  <div style="padding-top:20px">{shot("risks", 700)}</div>
</div>
""")

# 7 End
SLIDES.append(f"""
<div style="position:absolute;left:110px;top:250px;width:1000px">
  <div class="k">Thank you</div>
  <h1 style="margin-top:20px">Medicine beyond<br>Earth's reach.</h1>
  <p class="lead" style="margin-top:40px">Code and run instructions<br><span class="mono acc" style="font-size:32px">github.com/3AMURR/VitalOrbit</span></p>
  <p class="lead">Run it: <span class="mono">./run.sh</span> · self-running demo: <span class="mono">localhost:8000/?tour=1</span></p>
  <p class="lead" style="font-size:24px;color:#7c8693;margin-top:40px">Team UnoSyn · Egyptian Chinese University · Built with help from Claude (Anthropic)</p>
</div>
<div style="position:absolute;right:140px;top:230px">{logo_svg(560)}</div>
""")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pngs = []
    prof = tempfile.mkdtemp(prefix="vo-ff-")
    for i, body in enumerate(SLIDES, 1):
        html = OUT / f"slide_{i}.html"
        html.write_text(frame(i, body))
        png = OUT / f"slide_{i}.png"
        subprocess.run(["firefox", "--headless", "--no-remote", "--profile", prof, "--window-size", f"{W},{H}",
                        "--screenshot", str(png), html.as_uri()], check=True, capture_output=True, timeout=120)
        pngs.append(png)
        print("rendered", png.name)
    shutil.rmtree(prof, ignore_errors=True)
    from PIL import Image
    imgs = [Image.open(p).convert("RGB") for p in pngs]
    pdf = HERE / "VitalOrbit_slides.pdf"
    imgs[0].save(pdf, save_all=True, append_images=imgs[1:], resolution=144)
    print("wrote", pdf)


if __name__ == "__main__":
    main()
