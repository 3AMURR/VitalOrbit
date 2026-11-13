/* VitalOrbit views: login, shell, crew overview, astronaut health, long-term risks. */

/* ---------------- login ---------------- */
function Orbits() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, cx = cv.getContext("2d");
    let raf, W, H;
    const size = () => { W = cv.width = cv.offsetWidth * devicePixelRatio; H = cv.height = cv.offsetHeight * devicePixelRatio; };
    size(); addEventListener("resize", size);
    const css = getComputedStyle(document.documentElement);
    const draw = (t) => {
      const line = css.getPropertyValue("--border-strong").trim(), acc = css.getPropertyValue("--accent").trim();
      cx.clearRect(0, 0, W, H);
      const ox = W * 0.72, oy = H * 0.58, s = devicePixelRatio;
      cx.lineWidth = 1 * s;
      [140, 230, 330].forEach((r, i) => {
        cx.strokeStyle = line; cx.beginPath(); cx.ellipse(ox, oy, r * s, r * 0.42 * s, -0.35, 0, 7); cx.stroke();
        const a = t / (9000 + i * 5000) + i * 2;
        const px = ox + Math.cos(a) * r * s * Math.cos(-0.35) - Math.sin(a) * r * 0.42 * s * Math.sin(-0.35);
        const py = oy + Math.cos(a) * r * s * Math.sin(-0.35) + Math.sin(a) * r * 0.42 * s * Math.cos(-0.35);
        cx.fillStyle = i === 1 ? acc : line; cx.beginPath(); cx.arc(px, py, (i === 1 ? 4 : 3) * s, 0, 7); cx.fill();
      });
      cx.fillStyle = acc; cx.beginPath(); cx.arc(ox, oy, 9 * s, 0, 7); cx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }, []);
  return html`<canvas ref=${ref}></canvas>`;
}

function Login({ onLogin, theme, setTheme }) {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState("sara");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api.get("/users").then(setUsers).catch(() => {}); }, []);
  const u = users.find((x) => x.id === sel);
  const go = async (e) => {
    e && e.preventDefault();
    try { const r = await api.post("/login", { user_id: sel, pin }); api.setToken(r.token); onLogin(r.user); }
    catch (x) { setErr(x.message); }
  };
  const roleTxt = { astronaut: "Crew", cmo: "Crew · Medical Officer", surgeon: "Mission Control · Earth" };
  return html`<div className="login">
    <div className="login-art">
      <div className="row"><${Logo} s=${34}/><div><b style=${{ fontSize: 18 }}>VitalOrbit</b><div className="muted small">Medicine beyond Earth’s reach</div></div></div>
      <div style=${{ maxWidth: 520, width: "100%", alignSelf: "center" }}><${DotGlobe} cradle=${true} height=${320}/></div>
      <div style=${{ maxWidth: 460 }}>
        <div className="upper" style=${{ marginBottom: 10 }}>Mars surface operations · Mission day 432</div>
        <h1 style=${{ fontSize: 34, lineHeight: 1.15, letterSpacing: "-0.02em" }}>When Earth is 19 light-minutes away, the crew is its own first responder.</h1>
        <p className="t2" style=${{ marginTop: 14 }}>Personal anomaly detection on real wearable data, long-mission risk forecasting, an offline medical assistant and a radiation-aware pharmacy, in one onboard system.</p>
      </div>
      <div className="xs muted">NASA Space Apps Cairo 2026 · Team UnoSyn, Egyptian Chinese University</div>
    </div>
    <div className="login-form">
      <form onSubmit=${go} style=${{ width: "min(400px, 100%)" }} className="gap16 enter">
        <div className="between"><h2 style=${{ fontSize: 20 }}>Sign in</h2>
          <button type="button" className="btn ghost icon" onClick=${() => setTheme(theme === "dark" ? "light" : "dark")} title="Theme"><${Icon} n=${theme === "dark" ? "sun" : "moon"}/></button></div>
        <div className="roster">${users.map((x) => html`<button type="button" key=${x.id} className=${x.id === sel ? "on" : ""} onClick=${() => { setSel(x.id); setPin(""); setErr(""); }}>
          <div className="avatar">${initials(x.name)}</div>
          <div className="grow"><b>${x.name}</b><div className="muted small">${x.title}</div></div>
          <span className=${"badge " + (x.role === "surgeon" ? "b-info" : x.role === "cmo" ? "b-warn" : "b-mute")}>${roleTxt[x.role]}</span>
        </button>`)}</div>
        <label className="field">PIN
          <input className="input pin" type="password" inputMode="numeric" maxLength="4" value=${pin} autoFocus onInput=${(e) => setPin(e.target.value)}/></label>
        ${err && html`<div className="badge b-crit">${err}</div>`}
        <button className="btn primary" style=${{ justifyContent: "center", padding: 10 }}>Sign in${u ? " as " + u.name.split(" ")[0] : ""}</button>
        <div className="xs muted" style=${{ textAlign: "center" }}>Demo PINs: crew 1111 / 2222 / 3333 / 4444 · flight surgeon 9999${u ? html` · <a href="#" onClick=${(e) => { e.preventDefault(); setPin(u.demo_pin); }}>fill</a>` : null}</div>
      </form>
    </div>
  </div>`;
}

/* ---------------- shell ---------------- */
const NAV = {
  astronaut: [["#/me", "My health", "heart"], ["#/assistant", "Assistant", "chat"], ["#/comms", "Messages", "radio"], ["#/pharmacy", "Pharmacy", "pill"]],
  cmo: [["#/crew", "Crew", "users"], ["#/risks", "Long-term risks", "trend"], ["#/assistant", "Assistant", "chat"], ["#/pharmacy", "Pharmacy", "pill"], ["#/comms", "Messages", "radio"], ["#/me", "My health", "heart"]],
  surgeon: [["#/crew", "Crew telemetry", "users"], ["#/risks", "Long-term risks", "trend"], ["#/comms", "Inbox", "radio"], ["#/assistant", "Assistant", "chat"]],
};

function TopBar({ mission, user }) {
  if (!mission) return html`<div className="topbar"><div className="topbar-in"><div className="skel" style=${{ height: 30, width: 400 }}></div></div></div>`;
  const c = mission.cabin;
  return html`<div className="topbar"><div className="topbar-in">
    <div className="kv"><span>Mission time</span><b>${fmtMet(mission.met_min)}</b></div>
    <div className="kv"><span>Phase</span><b style=${{ fontFamily: "inherit" }}>${mission.phase} · ${mission.days_to_mars > 0 ? mission.days_to_mars + " d to Mars" : mission.days_to_departure + " d to departure"}</b></div>
    <div className="kv"><span>Light delay</span><b>${mission.light_delay_min} min</b></div>
    <div className="kv"><span>Mission dose</span><b style=${{ color: mission.solar_storm ? "var(--crit)" : undefined }}>${mission.dose_msv} mSv</b></div>
    <div className="kv"><span>Cabin CO₂</span><b>${c.co2_mmhg} mmHg</b></div>
    <div className="row" style=${{ marginLeft: "auto" }}>
      <span className=${"dot " + (mission.blackout ? "crit" : "ok")}></span>
      <span className="small t2">${mission.blackout ? "Comms blackout" : user.role === "surgeon" ? "Downlink active" : "Link to Earth"}</span>
    </div>
  </div>
  ${user.role === "surgeon" && html`<div className="banner"><${Icon} n="clock"/>You are on Earth. All crew telemetry is ${mission.light_delay_min} minutes old: you see the ship as it was at ${fmtMet(mission.met_min - mission.light_delay_min)}.</div>`}
  ${mission.solar_storm && html`<div className="banner crit"><${Icon} n="zap"/>Solar particle event in progress: crew to storm shelter. Dose rate ${mission.dose_rate_msv_day} mSv/day.</div>`}
  ${mission.blackout && html`<div className="banner warn"><${Icon} n="sat"/>Solar conjunction blackout: messages to and from Earth are queued.</div>`}
  </div>`;
}

function Shell({ user, route, mission, children, onLogout, theme, setTheme, alerts, demoOpen, setDemoOpen }) {
  const crit = (alerts || []).filter((a) => !a.acknowledged && a.severity === "critical").length;
  return html`<div className="shell">
    <aside className="side">
      <div className="brand"><${Logo}/><div><b>VitalOrbit</b><small>${user.role === "surgeon" ? "Mission Control · Earth" : "Medicine beyond Earth’s reach"}</small></div></div>
      ${NAV[user.role].map(([href, label, ic]) => html`<a key=${href} href=${href} className=${"nav-item" + (route.startsWith(href) || (href === "#/crew" && route.startsWith("#/crew")) ? " on" : "")}>
        <${Icon} n=${ic}/>${label}${href === "#/crew" && crit ? html`<span className="badge b-crit">${crit}</span>` : null}</a>`)}
      <div className="side-foot">
        ${user.role !== "surgeon" && html`<button className="btn danger" style=${{ justifyContent: "center", marginBottom: 4 }} onClick=${async () => {
          if (!confirm("Declare a MEDICAL EMERGENCY? All crew and the flight surgeon are alerted.")) return;
          await api.post("/emergency", {});
          location.hash = "#/assistant?q=" + encodeURIComponent("Medical emergency: crew member unresponsive");
        }}><${Icon} n="alert"/>Medical emergency</button>`}
        <button className="nav-item" onClick=${() => setDemoOpen(!demoOpen)}><${Icon} n="flask"/>Scenario console</button>
        <button className="nav-item" onClick=${() => setTheme(theme === "dark" ? "light" : "dark")}><${Icon} n=${theme === "dark" ? "sun" : "moon"}/>${theme === "dark" ? "Light" : "Dark"} theme</button>
        <div className="me-card"><div className="avatar">${initials(user.name)}</div><div className="grow" style=${{ minWidth: 0 }}><b className="small">${user.name}</b><div className="xs muted">${user.title}</div></div>
          <button className="btn ghost icon" title="Sign out" onClick=${onLogout}><${Icon} n="logout"/></button></div>
      </div>
    </aside>
    <div className="main">
      <${TopBar} mission=${mission} user=${user}/>
      <div className="content" key=${route.split("?")[0]}>${children}</div>
    </div>
  </div>`;
}

/* ---------------- mission timeline ---------------- */
function MissionTimeline({ mission }) {
  if (!mission) return null;
  const E = mission.mission_end_day, a = mission.arrive_mars_day, l = mission.leave_mars_day;
  const pct = (d) => (100 * d) / E + "%";
  return html`<div className="card card-pad enter">
    <div className="between" style=${{ marginBottom: 4 }}><span className="upper">Mission profile</span>
      <span className="small muted">Day ${mission.day} of ${E} · ${Math.round((100 * mission.day) / E)} % complete</span></div>
    <div className="timeline">
      <div className="tl-track">
        <div style=${{ width: pct(a), background: "color-mix(in srgb, var(--accent) 55%, transparent)" }}></div>
        <div style=${{ width: pct(l - a), background: "color-mix(in srgb, var(--warn) 45%, transparent)" }}></div>
        <div style=${{ width: pct(E - l), background: "color-mix(in srgb, var(--violet) 50%, transparent)" }}></div>
      </div>
      <div className="tl-now" style=${{ left: pct(mission.day) }}></div>
      <div className="tl-labels"><span style=${{ left: 0 }}>Launch</span><span style=${{ left: pct(a) }}>Mars arrival · D${a}</span><span style=${{ left: pct(l) }}>Departure · D${l}</span><span style=${{ left: "100%" }}>Earth · D${E}</span></div>
    </div>
  </div>`;
}

/* ---------------- crew overview ---------------- */
function Metric({ icon, label, value, unit, d = 0, bad, sub, src, beat }) {
  return html`<div className=${"metric" + (bad ? " bad" : "")}>
    <div className="lbl">${beat ? html`<span className="heartbeat" style=${{ "--beat": beat }}><${Icon} n=${icon} s=${13}/></span>` : html`<${Icon} n=${icon} s=${13}/>`}${label}${src && html`<span style=${{ marginLeft: "auto" }}><${Src} k=${src}/></span>`}</div>
    <div className="val"><${Num} v=${value} d=${d}/><small>${unit}</small></div>
    ${sub && html`<div className="sub">${sub}</div>`}
  </div>`;
}

function Vitals({ c }) {
  const l = c.latest;
  return html`<div className="metrics">
    <${Metric} icon="heart" label="HR" value=${l.hr} unit="bpm" bad=${l.activity < 1.5 && l.hr > 100} sub=${"rest ~" + Math.round(c.baseline.hr)} src="real" beat=${(60 / Math.max(40, l.hr)).toFixed(2) + "s"}/>
    <${Metric} icon="drop" label="SpO₂" value=${l.spo2} d=${1} unit="%" bad=${l.spo2 < 94} sub=${"base " + c.baseline.spo2} src="simulated"/>
    <${Metric} icon="thermo" label="Temp" value=${l.temp} d=${1} unit="°C" bad=${l.temp > 37.8} sub=${"base " + c.baseline.temp} src="simulated"/>
    <${Metric} icon="moon" label="Sleep" value=${l.sleep_h} d=${1} unit="h" bad=${l.sleep_h < 5.5} sub="last night" src="real"/>
  </div>`;
}

function ActivityBadge({ c }) {
  const a = c.activity_label;
  const t = { sleep: "Asleep", rest: "Resting", light: "Light activity", active: "Exercising" }[a];
  return html`<span className="badge b-mute">${t}</span>`;
}

function CrewTile({ c, i, mission }) {
  const [cls, label] = STATUS[c.status];
  return html`<div className=${`card crew-tile enter enter-${i} s-${c.status}`} onClick=${() => (location.hash = "#/crew/" + c.id)}>
    <div className="card-pad" style=${{ paddingBottom: 12 }}>
      <div className="row" style=${{ gap: 12 }}>
        <div className="avatar">${initials(c.name)}</div>
        <div className="grow" style=${{ minWidth: 0 }}><b>${c.name}</b><div className="small muted">${c.role} · ${c.origin}</div></div>
        <${Ring} value=${c.health_score} status=${c.status} size=${54} stroke=${5}/>
      </div>
      <div className="row" style=${{ marginTop: 10 }}><span className=${"badge b-" + cls}><span className=${"dot " + cls}></span>${label}</span><${ActivityBadge} c=${c}/><${EvaBadge} c=${c} mission=${mission}/>
        ${c.anomaly_streak > 0 ? html`<span className="badge b-crit">ML anomaly · ${c.anomaly_streak * 5} min</span>` : html`<span className="badge b-mute">ML: within personal norm</span>`}</div>
      <div style=${{ marginTop: 10 }}><${Spark} data=${c.spark} color=${c.status === "red" ? "var(--crit)" : c.status === "amber" ? "var(--warn)" : "var(--accent)"}/></div>
    </div>
    <${Vitals} c=${c}/>
  </div>`;
}

function AlertList({ alerts, crew, canAck, refresh }) {
  const name = (id) => (crew || []).find((c) => c.id === id)?.name;
  if (!alerts) return html`<div className="card-body"><div className="skel" style=${{ height: 80 }}></div></div>`;
  if (!alerts.length) return html`<${Empty}>No alerts. Every crew member is within their personal normal range.</${Empty}>`;
  return html`<div>${alerts.map((a) => html`<div key=${a.id} className=${"alert-row " + a.severity + (a.acknowledged ? " ack" : "")}>
    <div className="bar"></div>
    <div>
      <div className="between"><b className="small">${a.message}</b><span className="xs muted mono">${fmtClock(a.ts)}</span></div>
      ${a.value != null && html`<div className="xs t2">Now <span className="mono">${a.value}</span> · personal baseline <span className="mono">${a.baseline}</span></div>`}
      ${a.crew_feedback && html`<div className="xs" style=${{ color: "var(--accent)" }}>Crew feedback: ${a.crew_feedback}</div>`}
      <div className="between" style=${{ marginTop: 4 }}><span className="xs muted">Downlinked to Earth</span>
        ${canAck && !a.acknowledged && html`<button className="btn sm" onClick=${(e) => { e.stopPropagation(); api.post(`/alerts/${a.id}/ack`).then(refresh); }}>Acknowledge</button>`}</div>
    </div>
  </div>`)}</div>`;
}

function CrewOverview({ user, mission, crew, alerts, refreshAlerts }) {
  const n = (crew || []).filter((c) => c.status === "green").length;
  return html`<div className="gap16">
    <div className="page-head enter"><div><h1>${user.role === "surgeon" ? "Crew telemetry" : "Crew status"}</h1>
      <p>${crew ? `${n} of ${crew.length} nominal` : "Loading"} · each astronaut is compared with their own learned normal, not a population average.</p></div>
      <div className="legend"><span><${Src} k="real"/> Fitbit wearable data</span><span><${Src} k="simulated"/> simulated</span><span><${Src} k="model"/> projection</span></div></div>
    <${MissionHero} mission=${mission} crew=${crew}/>
    <${MissionTimeline} mission=${mission}/>
    <div className="split">
      <div className="grid g2">${crew ? crew.map((c, i) => html`<${CrewTile} key=${c.id} c=${c} mission=${mission} i=${(i % 4) + 1}/>`) : [1, 2, 3, 4].map((i) => html`<div key=${i} className="skel" style=${{ height: 230 }}></div>`)}</div>
      <div className="card enter enter-2"><div className="card-head"><h3>Smart alerts</h3><span className="xs muted">persistence-filtered ML flags</span></div>
        <div style=${{ maxHeight: 620, overflowY: "auto" }}><${AlertList} alerts=${alerts} crew=${crew} canAck=${user.role !== "astronaut"} refresh=${refreshAlerts}/></div></div>
    </div>
  </div>`;
}

/* ---------------- astronaut health page (self or selected) ---------------- */
function PromptBanner({ refresh }) {
  const [prompts, reload] = usePoll("/prompts", 2000);
  const [why, setWhy] = useState(null);
  const p = (prompts || [])[0];
  if (!p) return null;
  const answer = async (feeling, note = "") => { await api.post(`/prompts/${p.id}`, { feeling, note }); setWhy(null); reload(); refresh && refresh(); };
  return html`<div className="prompt">
    <div className="row" style=${{ alignItems: "flex-start", gap: 12 }}>
      <div style=${{ color: "var(--accent)", marginTop: 2 }}><${Icon} n="pulse" s=${20}/></div>
      <div className="grow">
        <div className="upper" style=${{ color: "var(--accent)" }}>VitalOrbit check-in</div>
        <div style=${{ marginTop: 2 }}>${p.text}</div>
        ${why ? html`<div className="chips" style=${{ marginTop: 10 }}>
            ${["I was exercising", "Caffeine", "Stress / workload", "Sensor was loose"].map((r) => html`<button key=${r} className="chip" onClick=${() => answer("false alarm", r)}>${r}</button>`)}</div>`
          : html`<div className="row wrap" style=${{ marginTop: 10 }}>
            <button className="btn" onClick=${() => setWhy(true)}><${Icon} n="check"/>I feel fine</button>
            <button className="btn primary" onClick=${() => { answer("unwell"); location.hash = "#/assistant?q=" + encodeURIComponent("I don't feel well"); }}>I don't feel well</button></div>`}
        <div className="xs muted" style=${{ marginTop: 8 }}>Your answer labels the alert, so the model learns what is normal for you.</div>
      </div>
    </div>
  </div>`;
}

function RiskCard({ r, i }) {
  const icon = { radiation: "zap", bone: "bone", muscle: "pulse", sans: "eye", behavioral: "smile", co2: "wind" }[r.key];
  return html`<div className=${"card risk enter enter-" + ((i % 4) + 1)}>
    <div className="between"><div className="row"><span className="badge b-mute mono">${r.hazard}</span><${Icon} n=${icon}/><b className="small">${r.name}</b></div><${Src} k=${r.source}/></div>
    <div className="between" style=${{ alignItems: "baseline" }}><div className="val">${r.value}<span className="small muted"> ${r.unit}</span></div>
      <span className=${"badge b-" + LEVEL[r.level]}>${cap(r.level)}</span></div>
    ${r.limit != null && html`<${Meter} value=${r.value} limit=${r.limit} projection=${r.projection} level=${r.level}/>`}
    <div className="xs t2">${r.detail}</div>
    ${r.projection != null && html`<div className="xs muted">${cap(r.projection_label)}: <b className="mono t2">${r.projection} ${r.unit}</b>${r.cross_day ? html` · crosses limit on <b style=${{ color: "var(--crit)" }}>day ${r.cross_day}</b>` : null}</div>`}
    <div className="xs" style=${{ borderTop: "1px solid var(--border)", paddingTop: 8, color: "var(--text-2)" }}><b>Action:</b> ${r.action}</div>
  </div>`;
}

function CheckIn({ cid, own }) {
  const [hist, reload] = usePoll(`/checkins/${cid}`, 15000, [cid]);
  const [f, setF] = useState({ mood: 4, stress: 2, sleep_quality: 4, symptoms: [], note: "" });
  const [saved, setSaved] = useState(false);
  const SYM = ["Headache", "Blurry vision", "Back pain", "Nausea", "Congestion", "Fatigue"];
  const today = hist && hist.length && hist[hist.length - 1].source === "crew";
  const scale = (k, label) => html`<div className="between"><span className="small t2">${label}</span>
    <div className="seg">${[1, 2, 3, 4, 5].map((v) => html`<button key=${v} type="button" className=${f[k] === v ? "on" : ""} onClick=${() => setF({ ...f, [k]: v })}>${v}</button>`)}</div></div>`;
  const submit = async () => { await api.post("/checkins", f); setSaved(true); reload(); };
  return html`<div className="card enter enter-3">
    <div className="card-head"><h3>Daily check-in</h3><span className="xs muted">mood and stress feed the behavioural-health risk</span></div>
    <div className="card-body gap16">
      ${own && !saved && !today ? html`<div className="gap16" style=${{ gap: 10 }}>
        ${scale("mood", "Mood (1 low, 5 great)")}${scale("stress", "Stress (1 calm, 5 high)")}${scale("sleep_quality", "Sleep quality")}
        <div className="chips">${SYM.map((s) => html`<button key=${s} type="button" className=${"chip" + (f.symptoms.includes(s) ? " on" : "")}
          onClick=${() => setF({ ...f, symptoms: f.symptoms.includes(s) ? f.symptoms.filter((x) => x !== s) : [...f.symptoms, s] })}>${s}</button>`)}</div>
        <input className="input" placeholder="Anything else? (optional)" value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })}/>
        <button className="btn primary" onClick=${submit}>Submit check-in</button>
      </div>` : own ? html`<div className="row"><${Icon} n="check" s=${18} className="ok"/><span>Today's check-in is saved. Low mood or high stress is shared privately with the flight surgeon.</span></div>` : null}
      <div>
        <div className="upper" style=${{ marginBottom: 6 }}>Last 14 days · mood <span style=${{ color: "var(--accent)" }}>■</span> stress <span style=${{ color: "var(--warn)" }}>■</span></div>
        <div className="row" style=${{ alignItems: "flex-end", gap: 4, height: 54 }}>${(hist || []).map((h, i) => html`<div key=${i} title=${`Day ${h.day}: mood ${h.mood}, stress ${h.stress}`} style=${{ display: "flex", gap: 1, alignItems: "flex-end", flex: 1 }}>
          <div style=${{ flex: 1, height: h.mood * 10, background: "var(--accent)", borderRadius: 2, opacity: h.source === "crew" ? 1 : 0.55 }}></div>
          <div style=${{ flex: 1, height: h.stress * 10, background: "var(--warn)", borderRadius: 2, opacity: h.source === "crew" ? 1 : 0.55 }}></div></div>`)}</div>
        <div className="xs muted" style=${{ marginTop: 4 }}>Faded bars are simulated history; solid bars are entered by the crew.</div>
      </div>
    </div>
  </div>`;
}

function ModelCard({ cid }) {
  const [m] = usePoll(`/crew/${cid}/model`, 10000, [cid]);
  const [ev] = usePoll("/ml/evaluation", 60000);
  if (!m) return null;
  return html`<div className="card enter enter-4"><div className="card-head"><h3>Personal anomaly model</h3><${Icon} n="cpu"/></div>
    <div className="card-body small gap16" style=${{ gap: 8 }}>
      <div className="between"><span className="muted">Algorithm</span><span>Isolation Forest · ${m.trees} trees</span></div>
      <div className="between"><span className="muted">Trained on</span><span className="mono">${m.samples} readings · ${m.days} days</span></div>
      <div className="between"><span className="muted">Data source</span><span>Fitbit participant <span className="mono">…${String(m.participant).slice(-4)}</span> <${Src} k="real"/></span></div>
      <div className="between"><span className="muted">Features</span><span className="mono xs">${m.features.join(", ")}</span></div>
      <div className="between"><span className="muted">Personal resting HR</span><span className="mono">${m.personal_rest_hr} bpm</span></div>
      <div className="between"><span className="muted">Flag rate on own data</span><span className="mono">${m.flag_rate} %</span></div>
      <div className="xs muted">Hybrid detection: the personal model scores deviations from this person's own rhythm (same hour and activity, so exercise and recovery are normal); clinical limits act as a safety net; sensor gaps are never scored. An alert needs 5 of 6 abnormal readings (30 min).</div>
      ${ev && ev.scenarios_tested ? html`<div style=${{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
        <div className="upper" style=${{ marginBottom: 8 }}>Validation on real wearable data</div>
        <div className="grid g3" style=${{ gap: 8 }}>
          <div><div className="mono" style=${{ fontSize: 18, color: "var(--ok)" }}>${ev.detected}/${ev.scenarios_tested}</div><div className="xs muted">emergencies detected</div></div>
          <div><div className="mono" style=${{ fontSize: 18 }}>${ev.median_minutes_to_alert} min</div><div className="xs muted">median time to alert</div></div>
          <div><div className="mono" style=${{ fontSize: 18 }}>${ev.false_warnings_per_crew_day}</div><div className="xs muted">false warnings / crew-day</div></div>
        </div>
        <div className="xs muted" style=${{ marginTop: 6 }}>${ev.readings_scored} real readings over ${ev.normal_days} days × ${ev.crew} crew: ${ev.false_critical} false critical alerts. Right vital named in ${Math.round(ev.correct_vital_rate * 100)} % of cases.</div>
      </div>` : null}
      ${m.feedback.length > 0 && html`<div className="xs"><b>Crew feedback labels:</b> ${m.feedback.map((f) => f.crew_feedback).join(" · ")}</div>`}
    </div></div>`;
}

function Health({ user, cid, mission }) {
  const own = user.crew_id === cid;
  const [c, reloadC] = usePoll(`/crew/${cid}`, 1000, [cid]);
  const [vitals] = usePoll(`/crew/${cid}/vitals?hours=24`, 3000, [cid]);
  const [risks] = usePoll(`/crew/${cid}/risks`, 5000, [cid]);
  const [meds] = usePoll(`/medlog/${cid}`, 5000, [cid]);
  if (!c) return html`<div className="grid g2"><div className="skel" style=${{ height: 220 }}></div><div className="skel" style=${{ height: 220 }}></div></div>`;
  const [cls, label] = STATUS[c.status];
  const hour = mission ? Math.floor((mission.met_min % 1440) / 60) : 9;
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return html`<div className="gap16">
    ${own && html`<${PromptBanner} refresh=${reloadC}/>`}
    <div className="page-head enter">
      <div className="row" style=${{ gap: 14 }}>
        ${!own && html`<a className="btn icon" href=${user.role === "astronaut" ? "#/me" : "#/crew"}><${Icon} n="back"/></a>`}
        <div className="avatar lg">${initials(c.name)}</div>
        <div><h1>${own ? `${greet}, ${c.name.split(" ")[0]}` : c.name}</h1><p>${c.role} · ${c.origin} · ${own ? "your data is private to you, the CMO and the flight surgeon" : "medical record"}</p></div>
      </div>
      <div className="row"><a className="btn" href=${"#/assistant?crew=" + c.id}><${Icon} n="chat"/>${own ? "Talk to the assistant" : "Consult assistant"}</a></div>
    </div>
    <div className="grid cols-health">
      <div className="card card-pad enter enter-1" style=${{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
        <span className="upper">Health score</span>
        <${Ring} value=${c.health_score} status=${c.status} size=${150} stroke=${10}/>
        <div className="row"><span className=${"badge b-" + cls}><span className=${"dot " + cls}></span>${label}</span><${ActivityBadge} c=${c}/></div>
        <div style=${{ width: "100%", display: "grid", gap: 7, textAlign: "left" }}>
          ${c.breakdown.map((p) => html`<div key=${p.key} className="row small"><span style=${{ width: 92 }} className="t2">${p.label}</span>
            <div className="meter grow"><i style=${{ width: (100 * p.penalty) / p.max + "%", background: p.penalty > p.max / 2 ? "var(--crit)" : "var(--warn)" }}></i></div>
            <span className="mono xs" style=${{ width: 34, textAlign: "right" }}>−${p.penalty}</span></div>`)}
        </div>
        <div className="xs muted">100 minus penalties: you always see why the score moved.</div>
      </div>
      <div className="card enter enter-2" style=${{ overflow: "hidden" }}>
        <div className="card-head"><h3>Live vitals</h3><span className="xs muted">updated every 5 mission minutes${user.role === "surgeon" ? " · delayed by light-time" : ""}</span></div>
        <${Vitals} c=${c}/>
        <div className="card-body" style=${{ borderTop: "1px solid var(--border)" }}>
          <div className="between" style=${{ marginBottom: 6 }}><span className="small t2">Heart rate · 24 h</span>
            <div className="legend"><span><i style=${{ background: "var(--crit)", height: 6, width: 6, borderRadius: 6 }}></i>ML anomaly</span><span><i style=${{ borderTop: "2px dashed var(--accent)", background: "none" }}></i>personal baseline</span><span><i style=${{ background: "var(--accent)", opacity: 0.25, height: 8 }}></i>safe range</span></div></div>
          <${LineChart} data=${vitals} k="hr" color="var(--accent)" base=${c.baseline.hr} lo=${45} hi=${100} unit="bpm"/>
        </div>
      </div>
    </div>
    <div className="grid g2">
      <div className="card enter enter-2"><div className="card-head"><h3>Blood oxygen · 24 h</h3><${Src} k="simulated"/></div><div className="card-body"><${LineChart} data=${vitals} k="spo2" color="var(--violet)" base=${c.baseline.spo2} lo=${95} hi=${100} h=${130} unit="%"/></div></div>
      <div className="card enter enter-3"><div className="card-head"><h3>Temperature · 24 h</h3><${Src} k="simulated"/></div><div className="card-body"><${LineChart} data=${vitals} k="temp" color="var(--warn)" base=${c.baseline.temp} lo=${36.1} hi=${37.5} h=${130} unit="°C"/></div></div>
    </div>
    <div className="between enter" style=${{ marginTop: 8 }}><div><h2 style=${{ fontSize: 17 }}>Long-mission risks</h2><div className="small muted">NASA's five spaceflight hazards (RIDGE), projected to the end of the mission</div></div></div>
    <div className="grid cols-risk">
      <div className="card enter"><div className="card-head"><h3>Body risk map</h3><div className="row"><${EvaBadge} c=${c} mission=${mission}/></div></div>
        <div className="card-body"><${BodyMap} risks=${risks} crew=${c}/></div></div>
      <div className="grid g2">${(risks || []).map((r, i) => html`<${RiskCard} key=${r.key} r=${r} i=${i}/>`)}</div>
    </div>
    <div className="grid g2">
      <${CheckIn} cid=${cid} own=${own}/>
      <div className="gap16">
        ${user.role !== "astronaut" && html`<${ModelCard} cid=${cid}/>`}
        <div className="card enter enter-4"><div className="card-head"><h3>Medication log</h3><${Icon} n="pill"/></div>
          ${meds && meds.length ? html`<table className="table"><tbody>${meds.slice(0, 6).map((m, i) => html`<tr key=${i}><td>${m.med}</td><td className="mono small">×${m.n}</td><td className="small muted">${m.by}</td><td className="mono xs muted">${fmtMet(m.ts)}</td></tr>`)}</tbody></table>`
            : html`<${Empty} icon="pill">No medicine dispensed this mission week.</${Empty}>`}</div>
      </div>
    </div>
  </div>`;
}

/* ---------------- long-term risk board ---------------- */
function RiskBoard({ crew, mission }) {
  const [all, setAll] = useState(() => Object.fromEntries([1, 2, 3, 4].map((i) => [i, CACHE[`/crew/${i}/risks`]]).filter((x) => x[1])));
  useEffect(() => {
    if (!crew) return;
    let alive = true;
    const load = () => Promise.all(crew.map((c) => api.get(`/crew/${c.id}/risks`).then((r) => [c.id, r]))).then((x) => alive && setAll(Object.fromEntries(x)));
    load(); const t = setInterval(load, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [crew && crew.length]);
  const cols = [["radiation", "R · Radiation"], ["behavioral", "I · Behavioural"], ["bone", "G · Bone"], ["muscle", "G · Muscle"], ["sans", "G · Vision (SANS)"], ["co2", "E · Cabin CO₂"]];
  return html`<div className="gap16">
    <div className="page-head enter"><div><h1>Long-term risks</h1><p>The slow threats of a 920-day mission, organised by NASA's RIDGE hazards and projected forward with each astronaut's own data.</p></div></div>
    <div className="grid g4">
      <div className="card risk enter enter-1"><span className="upper">D · Distance from Earth</span><div className="val">${mission ? mission.light_delay_min : "–"}<span className="small muted"> min one way</span></div><div className="xs t2">Round trip ${mission ? (mission.light_delay_min * 2).toFixed(1) : "–"} min at ${mission ? mission.distance_au : "–"} AU.${mission && mission.conjunction_day ? ` Solar conjunction blackout in ${mission.conjunction_day - mission.day} days.` : ""}</div></div>
      <div className="card risk enter enter-2"><span className="upper">Mission dose</span><div className="val">${mission ? mission.dose_msv : "–"}<span className="small muted"> mSv</span></div><div className="xs t2">Career limit 600 mSv (NASA-STD-3001). A full Mars mission is projected to exceed it: waiver and shelter planning needed.</div></div>
      <div className="card risk enter enter-3"><span className="upper">Highest priority</span>${(() => {
        const flat = Object.entries(all).flatMap(([id, rs]) => rs.filter((r) => r.key !== "radiation" && r.key !== "co2").map((r) => ({ ...r, who: crew.find((c) => c.id == id)?.name })));
        const top = flat.sort((a, b) => ["low", "moderate", "elevated", "high"].indexOf(b.level) - ["low", "moderate", "elevated", "high"].indexOf(a.level))[0];
        return top ? html`<div><b>${top.who}</b><div className="small t2">${top.name}: ${top.value} ${top.unit}${top.cross_day ? ` · limit on day ${top.cross_day}` : ""}</div></div>` : html`<div className="skel" style=${{ height: 30 }}></div>`;
      })()}</div>
      <div className="card risk enter enter-4"><span className="upper">Data</span><div className="xs t2">Exercise minutes and sleep: <${Src} k="real"/> Fitbit. Rates: <${Src} k="model"/> published spaceflight studies. Exams and check-ins: <${Src} k="simulated"/>.</div></div>
    </div>
    <div className="card enter enter-2"><div className="table-wrap"><table className="matrix">
      <thead><tr><th>Crew member</th>${cols.map(([k, l]) => html`<th key=${k}>${l}</th>`)}</tr></thead>
      <tbody>${(crew || []).map((c) => html`<tr key=${c.id}>
        <td><a href=${"#/crew/" + c.id} className="row" style=${{ color: "var(--text)" }}><div className="avatar">${initials(c.name)}</div><div><b>${c.name}</b><div className="xs muted">${c.role}</div></div></a></td>
        ${cols.map(([k]) => { const r = (all[c.id] || []).find((x) => x.key === k); return html`<td key=${k}>${r ? html`<div className=${"cell lv-" + r.level} title=${r.detail}>
          <span className="mono">${r.value} <span className="xs muted">${r.unit}</span></span>
          <span className="lvl">${r.level}</span>
          ${r.projection != null && html`<span className="xs muted">→ ${r.projection}${r.cross_day ? ` · D${r.cross_day}` : ""}</span>`}</div>` : html`<div className="skel" style=${{ height: 52 }}></div>`}</td>`; })}
      </tr>`)}</tbody></table></div></div>
    <div className="xs muted">Bone and muscle projections use each person's real daily exercise minutes against a 60 min/day prescription; loss rates from LeBlanc 2000 and Smith 2012; mitigation and Mars-gravity factors are our assumptions. Radiation: RAD dose rates (Zeitlin 2013, Hassler 2014).</div>
  </div>`;
}

Object.assign(window, { Login, Shell, CrewOverview, Health, RiskBoard, AlertList, MissionTimeline });
