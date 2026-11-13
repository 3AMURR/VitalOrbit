/* VitalOrbit space visuals: dotted globe, live Earth-Mars trajectory, dotted body risk map. Canvas, theme-aware, motion-safe. */

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ORANGE = "#ff7a59";

/* Runs a draw(ctx, w, h, t) loop on a canvas that fills its parent; pauses when hidden. */
function useCanvas(draw, deps = []) {
  const ref = useRef(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current, cx = cv.getContext("2d");
    let raf, w = 0, h = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(size); ro.observe(cv); size();
    const loop = (t) => {
      if (!document.hidden && w > 0) { cx.clearRect(0, 0, w, h); drawRef.current(cx, w, h, reduceMotion() ? 0 : t); }
      raf = reduceMotion() ? setTimeout(() => loop(0), 1000) : requestAnimationFrame(loop);
    };
    loop(0);
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); ro.disconnect(); };
  }, deps);
  return ref;
}

/* ---------------- dotted globe (optionally cradled in the UnoSyn "U") ---------------- */
function DotGlobe({ n = 520, cradle = false, highlights = 7, speed = 0.00012, tilt = 0.32, height = 360 }) {
  const pts = useMemo(() => {
    const g = Math.PI * (3 - Math.sqrt(5)), out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), p = i * g;
      out.push([Math.cos(p) * r, y, Math.sin(p) * r]);
    }
    return out;
  }, [n]);
  const hi = useMemo(() => new Set(Array.from({ length: highlights }, (_, k) => Math.floor(((k * 0.6180339 + 0.13) % 1) * n))), [n, highlights]);
  const ref = useCanvas((cx, w, h, t) => {
    const acc = cssVar("--accent"), txt = cssVar("--text"), line = cssVar("--border-strong");
    const R = Math.min(w, h) * (cradle ? 0.27 : 0.44), ox = w / 2, oy = cradle ? h * 0.37 : h / 2;
    const a = t * speed, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(tilt), sb = Math.sin(tilt);
    const proj = pts.map(([x, y, z], i) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;
      return [ox + x1 * R, oy - y2 * R, z2, i];
    }).sort((p, q) => p[2] - q[2]);
    // faint orbit rings
    cx.strokeStyle = line; cx.lineWidth = 1;
    [[1.35, 0.5], [1.18, -0.8]].forEach(([k, rot]) => { cx.beginPath(); cx.ellipse(ox, oy, R * k, R * k * 0.28, rot, 0, 7); cx.stroke(); });
    for (const [x, y, z, i] of proj) {
      const d = (z + 1) / 2;
      if (hi.has(i)) {
        if (z < -0.1) continue;
        cx.fillStyle = ORANGE; cx.globalAlpha = 0.5 + 0.5 * d;
        cx.beginPath(); cx.arc(x, y, 3.2, 0, 7); cx.fill();
        const pulse = ((t / 1600 + i * 0.37) % 1);
        cx.strokeStyle = ORANGE; cx.globalAlpha = (1 - pulse) * 0.6 * d; cx.lineWidth = 1;
        cx.beginPath(); cx.arc(x, y, 4 + pulse * 14, 0, 7); cx.stroke();
      } else {
        cx.fillStyle = acc; cx.globalAlpha = 0.12 + 0.78 * d * d;
        cx.beginPath(); cx.arc(x, y, 0.7 + 1.3 * d, 0, 7); cx.fill();
      }
    }
    cx.globalAlpha = 1;
    // satellite on the outer ring
    const sat = t * 0.0004;
    const sx = ox + Math.cos(sat) * R * 1.35 * Math.cos(0.5) - Math.sin(sat) * R * 1.35 * 0.28 * Math.sin(0.5);
    const sy = oy + Math.cos(sat) * R * 1.35 * Math.sin(0.5) + Math.sin(sat) * R * 1.35 * 0.28 * Math.cos(0.5);
    cx.fillStyle = txt; cx.beginPath(); cx.arc(sx, sy, 2.4, 0, 7); cx.fill();
    if (cradle) {   // the "V" of VitalOrbit holding the planet
      const W = R * 1.5, top = oy - R * 0.6, bottom = oy + R * 2.0;   // 30 degree arms, tangent to the planet
      cx.strokeStyle = txt; cx.lineWidth = Math.max(9, R * 0.13); cx.lineCap = "round"; cx.lineJoin = "round";
      cx.beginPath(); cx.moveTo(ox - W, top); cx.lineTo(ox, bottom); cx.lineTo(ox + W, top); cx.stroke();
    }
  }, [pts, cradle]);
  return html`<canvas ref=${ref} style=${{ width: "100%", height, display: "block" }} aria-label="VitalOrbit: a dotted planet held in a V"></canvas>`;
}

/* ---------------- live Earth-Mars trajectory ---------------- */
function Trajectory({ mission, height = 300 }) {
  const parts = useRef([]);
  const ref = useCanvas((cx, w, h, t) => {
    if (!mission) return;
    const acc = cssVar("--accent"), txt = cssVar("--text"), muted = cssVar("--muted"), line = cssVar("--border-strong"), vio = cssVar("--violet");
    const ox = w * 0.5, oy = h * 0.53, S = Math.min(w * 0.4, h * 0.38) / 1.52;
    const R1 = 1.0 * S, R2 = 1.52 * S, th0 = Math.PI * 0.95;
    const day = mission.met_min / 1440, arrive = mission.arrive_mars_day;
    const P = (r, th) => [ox + r * Math.cos(th), oy - r * Math.sin(th)];
    // solar wind particles (denser and orange in a solar particle event)
    const storm = mission.solar_storm, want = storm ? 140 : 40;
    while (parts.current.length < want) parts.current.push({ a: Math.random() * 7, r: Math.random() * R2 * 1.4, v: 0.4 + Math.random() });
    parts.current.length = want;
    for (const p of parts.current) {
      p.r += p.v * (storm ? 2.2 : 0.6); if (p.r > R2 * 1.5) p.r = 8;
      const [x, y] = P(p.r, p.a);
      cx.globalAlpha = 0.5 * (1 - p.r / (R2 * 1.5)); cx.fillStyle = storm ? ORANGE : muted;
      cx.fillRect(x, y, 1.4, 1.4);
    }
    cx.globalAlpha = 1;
    // orbits
    cx.setLineDash([2, 5]); cx.strokeStyle = line; cx.lineWidth = 1;
    [R1, R2].forEach((r) => { cx.beginPath(); cx.arc(ox, oy, r, 0, 7); cx.stroke(); });
    cx.setLineDash([]);
    // transfer orbit (half ellipse, perihelion at Earth, aphelion at Mars)
    const a = (R1 + R2) / 2, e = (R2 - R1) / (R2 + R1);
    const tr = (nu) => (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    const f = Math.min(1, day / arrive);
    const path = (from, to) => { cx.beginPath(); for (let k = 0; k <= 60; k++) { const nu = from + (to - from) * (k / 60); const [x, y] = P(tr(nu), th0 + nu); k ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); };
    cx.strokeStyle = line; cx.lineWidth = 1.2; path(Math.PI * f, Math.PI);
    cx.strokeStyle = acc; cx.lineWidth = 2; path(0, Math.PI * f);
    // bodies
    const thE = th0 + (2 * Math.PI * day) / 365.25, thM = th0 + Math.PI - (2 * Math.PI * (arrive - day)) / 687;
    const [ex, ey] = P(R1, thE), [mx, my] = P(R2, thM);
    const [shx, shy] = day < arrive ? P(tr(Math.PI * f), th0 + Math.PI * f) : [mx, my];
    const glow = cx.createRadialGradient(ox, oy, 0, ox, oy, 26);
    glow.addColorStop(0, "rgba(255,190,90,.9)"); glow.addColorStop(1, "rgba(255,190,90,0)");
    cx.fillStyle = glow; cx.beginPath(); cx.arc(ox, oy, 26, 0, 7); cx.fill();
    cx.fillStyle = "#ffc35a"; cx.beginPath(); cx.arc(ox, oy, 7, 0, 7); cx.fill();
    cx.fillStyle = "#3d8bff"; cx.beginPath(); cx.arc(ex, ey, 6, 0, 7); cx.fill();
    cx.fillStyle = "#d9643a"; cx.beginPath(); cx.arc(mx, my, 5, 0, 7); cx.fill();
    // light-time signal ship -> Earth
    cx.strokeStyle = vio; cx.globalAlpha = 0.35; cx.setLineDash([3, 4]);
    cx.beginPath(); cx.moveTo(shx, shy); cx.lineTo(ex, ey); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const q = ((t / 2600) + k / 3) % 1;
      cx.fillStyle = vio; cx.globalAlpha = 1 - q * 0.6;
      cx.beginPath(); cx.arc(shx + (ex - shx) * q, shy + (ey - shy) * q, 2.4, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
    // ship
    const pulse = (t / 1400) % 1;
    cx.strokeStyle = acc; cx.globalAlpha = 1 - pulse; cx.beginPath(); cx.arc(shx, shy, 5 + pulse * 12, 0, 7); cx.stroke(); cx.globalAlpha = 1;
    cx.fillStyle = txt; cx.beginPath(); cx.arc(shx, shy, 4, 0, 7); cx.fill();
    // labels
    cx.font = '500 11px "IBM Plex Sans", sans-serif'; cx.fillStyle = muted;
    cx.fillText("Earth", ex + 9, ey + 4); cx.fillText("Sun", ox + 11, oy + 4);
    if (day < arrive) cx.fillText("Mars", mx + 8, my + 4);
    cx.fillStyle = txt; cx.font = '600 11px "IBM Plex Sans", sans-serif';
    cx.fillText(day < arrive ? "VitalOrbit" : "VitalOrbit crew · Mars", shx + 10, shy - 8);
    cx.fillStyle = vio; cx.font = '500 10.5px "IBM Plex Mono", monospace';
    cx.fillText(`${mission.light_delay_min} light-min`, (shx + ex) / 2 + 6, (shy + ey) / 2 - 6);
  }, [mission && mission.met_min, mission && mission.solar_storm]);
  return html`<canvas ref=${ref} style=${{ width: "100%", height, display: "block" }} aria-label="Live Earth to Mars trajectory"></canvas>`;
}

function MissionHero({ mission, crew }) {
  if (!mission) return html`<div className="skel" style=${{ height: 330 }}></div>`;
  const pct = Math.round((100 * mission.day) / mission.mission_end_day);
  const stat = (k, v, sub) => html`<div className="kv" style=${{ gap: 2 }}><span>${k}</span><b style=${{ fontSize: 20 }}>${v}</b>${sub && html`<small className="xs muted">${sub}</small>`}</div>`;
  return html`<div className="card enter cols-hero" style=${{ overflow: "hidden" }}>
    <div className="hero-viz" style=${{ position: "relative" }}>
      <div className="row" style=${{ position: "absolute", left: 16, top: 12, zIndex: 1 }}><span className="upper">Live trajectory</span>
        ${mission.solar_storm ? html`<span className="badge b-crit">Solar particle event</span>` : html`<span className="badge b-mute">Solar wind nominal</span>`}</div>
      <${Trajectory} mission=${mission} height=${320}/>
    </div>
    <div className="card-pad" style=${{ display: "grid", gap: 18, alignContent: "center" }}>
      <div><div className="upper">${mission.phase}</div><h2 style=${{ fontSize: 26, letterSpacing: "-0.02em", marginTop: 4 }}>Day ${mission.day} <span className="muted" style=${{ fontWeight: 400 }}>of ${mission.mission_end_day}</span></h2>
        <div className="progress" style=${{ marginTop: 10 }}><i style=${{ width: pct + "%" }}></i></div></div>
      <div className="grid g2" style=${{ gap: 16 }}>
        ${mission.days_to_mars > 0 ? stat("Mars arrival", `${mission.days_to_mars} d`, `day ${mission.arrive_mars_day}`)
          : stat("Departure", `${mission.days_to_departure} d`, `surface gravity ${mission.gravity_g} g`)}
        ${stat("Signal to Earth", `${mission.light_delay_min} min`, `round trip ${(mission.light_delay_min * 2).toFixed(1)} min`)}
        ${stat("Crew dose", `${mission.dose_msv} mSv`, `${mission.dose_rate_msv_day} mSv/day now`)}
        ${stat("Earth distance", `${mission.distance_au} AU`, mission.conjunction_day ? `solar conjunction in ${mission.conjunction_day - mission.day} d` : "")}
      </div>
    </div>
  </div>`;
}

/* ---------------- dotted body risk map ---------------- */
const BODY = [
  ["c", 50, 20, 13], ["r", 45, 32, 10, 8], ["r", 28, 40, 44, 62], ["r", 14, 44, 12, 56], ["r", 74, 44, 12, 56],
  ["c", 20, 104, 6], ["c", 80, 104, 6], ["r", 30, 100, 40, 18], ["r", 31, 116, 17, 92], ["r", 52, 116, 17, 92],
];
const SPOTS = { sans: [[44, 19], [56, 19]], behavioral: [[50, 9]], radiation: [[50, 70]], bone: [[38, 110], [62, 110]], muscle: [[39, 145], [61, 145]], heart: [[56, 58]] };
function inBody(x, y) {
  return BODY.some((s) => s[0] === "c" ? (x - s[1]) ** 2 + (y - s[2]) ** 2 <= s[3] ** 2 : x >= s[1] && x <= s[1] + s[3] && y >= s[2] && y <= s[2] + s[4]);
}
const BODY_DOTS = (() => { const out = []; for (let y = 0; y <= 210; y += 3.4) for (let x = 0; x <= 100; x += 3.4) if (inBody(x, y)) out.push([x, y]); return out; })();
const LV_COLOR = { low: "--ok", moderate: "--muted", elevated: "--warn", high: "--crit" };

function BodyMap({ risks, crew, height = 380 }) {
  const [focus, setFocus] = useState(null);
  const items = useMemo(() => {
    const out = (risks || []).filter((r) => SPOTS[r.key]).map((r) => ({ key: r.key, name: r.name, level: r.level, value: `${r.value} ${r.unit}` }));
    if (crew) out.push({ key: "heart", name: "Heart (live)", level: crew.anomaly_streak ? "high" : crew.latest.hr > crew.baseline.hr + 25 ? "elevated" : "low", value: `${Math.round(crew.latest.hr)} bpm` });
    return out;
  }, [risks, crew]);
  const ref = useCanvas((cx, w, h, t) => {
    const s = Math.min(w / 110, h / 216), ox = (w - 100 * s) / 2, oy = (h - 210 * s) / 2;
    const muted = cssVar("--border-strong"), acc = cssVar("--accent");
    const scanY = ((t / 4000) % 1) * 230 - 10;
    const col = {};
    items.forEach((it) => (col[it.key] = cssVar(LV_COLOR[it.level])));
    for (const [x, y] of BODY_DOTS) {
      let c = muted, a = 0.75, r = 1.1;
      for (const it of items) for (const [hx, hy] of SPOTS[it.key]) {
        const d = Math.hypot(x - hx, y - hy), rad = it.key === "radiation" ? 0 : focus === it.key ? 9 : 5.5;
        if (d < rad) { c = col[it.key]; a = 1; r = 1.5; }
      }
      if (Math.abs(y - scanY) < 3) { c = acc; a = 0.9; }
      cx.globalAlpha = a; cx.fillStyle = c; cx.beginPath(); cx.arc(ox + x * s, oy + y * s, r * s * 0.9, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
    items.forEach((it, k) => {
      if (it.key === "radiation") return;
      SPOTS[it.key].forEach(([hx, hy]) => {
        const p = ((t / 1800) + k * 0.23) % 1;
        cx.strokeStyle = col[it.key]; cx.globalAlpha = (1 - p) * (focus && focus !== it.key ? 0.2 : 0.8); cx.lineWidth = 1.2;
        cx.beginPath(); cx.arc(ox + hx * s, oy + hy * s, (4 + p * 10) * s * 0.6, 0, 7); cx.stroke();
      });
    });
    cx.globalAlpha = 1;
  }, [items, focus]);
  return html`<div className="cols-body">
    <canvas ref=${ref} style=${{ width: "100%", height, display: "block" }} aria-label="Body risk map"></canvas>
    <div className="gap16" style=${{ gap: 4 }}>${items.map((it) => html`<button key=${it.key} className="nav-item" style=${{ padding: "7px 8px" }}
        onMouseEnter=${() => setFocus(it.key)} onMouseLeave=${() => setFocus(null)}>
      <span className="dot" style=${{ background: `var(${LV_COLOR[it.level]})` }}></span>
      <span className="grow small" style=${{ textAlign: "left" }}>${it.name}<div className="xs muted mono">${it.value}</div></span>
      <span className="xs" style=${{ color: `var(${LV_COLOR[it.level]})`, fontWeight: 600, textTransform: "capitalize" }}>${it.level}</span></button>`)}
      <div className="xs muted" style=${{ marginTop: 6 }}>The moving line is the radiation scan: whole-body dose is tracked continuously.</div>
    </div>
  </div>`;
}

/* ---------------- EVA readiness ---------------- */
function evaReadiness(c, mission) {
  const why = [];
  if (c.health_score < 75) why.push("health score below 75");
  if (c.anomaly_streak > 0) why.push("active ML anomaly");
  if (c.latest.sleep_h < 6) why.push("sleep under 6 h");
  if (mission && mission.solar_storm) why.push("solar particle event");
  return { go: why.length === 0, why };
}
function EvaBadge({ c, mission }) {
  const r = evaReadiness(c, mission);
  return html`<span className=${"badge " + (r.go ? "b-ok" : "b-crit")} title=${r.go ? "Cleared for EVA" : "No-go: " + r.why.join(", ")}>EVA ${r.go ? "GO" : "NO-GO"}</span>`;
}

Object.assign(window, { DotGlobe, Trajectory, MissionHero, BodyMap, EvaBadge, evaReadiness });
