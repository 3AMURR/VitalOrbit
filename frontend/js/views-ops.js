/* VitalOrbit views: assistant, pharmacy, comms with Earth, scenario console, toasts, app. */

/* ---------------- assistant ---------------- */
const ENGINE = {
  claude: ["b-info", "Claude · online"],
  local: ["b-ok", "Local model · offline"],
  protocol: ["b-mute", "Onboard protocols · offline"],
};
const DRUG = {
  ok: ["b-ok", "Available"], low: ["b-warn", "Available · low stock"], expiring: ["b-warn", "Expires soon"],
  out: ["b-crit", "Out of stock"], expired_radiation: ["b-crit", "Expired by radiation"], expired: ["b-crit", "Expired"], not_on_board: ["b-crit", "Not on board"],
};
const QUICK = ["I feel dizzy and my heart is racing", "My head hurts and my vision is blurry", "I have a fever and chills", "I can't sleep", "I feel nauseous", "How is my bone density doing?", "عندي صداع ومش شايف كويس"];

function speak(text, on) {
  if (!on || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[؀-ۿ]/.test(text) ? "ar-EG" : "en-US"; u.rate = 1.02;
  speechSynthesis.speak(u);
}

function StepTimer({ s }) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (left == null || left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const f = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
  if (left == null) return html`<button className="btn sm" onClick=${(e) => { e.stopPropagation(); setLeft(s); }}><${Icon} n="clock" s=${12}/>${f(s)}</button>`;
  return html`<span className=${"badge " + (left ? "b-info" : "b-ok")}>${left ? f(left) : "Done"}</span>`;
}

function Procedure({ card, onClose, voice }) {
  const [i, setI] = useState(0);
  const step = card.steps[i];
  useEffect(() => { speak(`Step ${i + 1}. ${step.text}`, voice); }, [i]);
  return html`<div className="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}><div className="modal">
    <div className="card-head"><div><div className="upper">Guided procedure · hands-free</div><b>${card.summary}</b></div><button className="btn ghost icon" onClick=${onClose}><${Icon} n="x"/></button></div>
    <div className="card-body gap16">
      <div className="row">${card.steps.map((_, k) => html`<div key=${k} style=${{ flex: 1, height: 4, borderRadius: 4, background: k <= i ? "var(--accent)" : "var(--surface-3)", transition: "background .3s" }}></div>`)}</div>
      <div className="upper">Step ${i + 1} of ${card.steps.length}</div>
      <div className="proc-step enter" key=${i}>${step.text}</div>
      <div className="between">
        <div className="row">${step.timer_s ? html`<${StepTimer} key=${i} s=${step.timer_s}/>` : null}
          <button className="btn" onClick=${() => speak(step.text, true)}><${Icon} n="volume"/>Read aloud</button></div>
        <div className="row"><button className="btn" disabled=${i === 0} onClick=${() => setI(i - 1)}>Back</button>
          ${i < card.steps.length - 1 ? html`<button className="btn primary" onClick=${() => setI(i + 1)}>Next step</button>` : html`<button className="btn primary" onClick=${onClose}><${Icon} n="check"/>Finish</button>`}</div>
      </div>
      ${card.red_flags.length > 0 && html`<div className="badge b-crit" style=${{ whiteSpace: "normal" }}>Call the CMO now if: ${card.red_flags.join(" · ")}</div>`}
    </div>
  </div></div>`;
}

function AiMessage({ m, patient, user, voice, onAction }) {
  const [done, setDone] = useState({});
  const [note, setNote] = useState({});
  const meta = m.meta || {};
  const drugs = (m.final && m.final.drugs) || meta.drugs || [];
  const engine = (m.final && m.final.engine) || meta.engine;
  const dispense = async (d) => {
    if (!confirm(`Dispense 1 × ${d.name} to ${patient.name}? Stock is updated and logged.`)) return;
    try { await api.post(`/inventory/${d.id}/dispense`, { crew_id: patient.id, n: 1 }); setNote({ ...note, [d.name]: "Dispensed and logged" }); }
    catch (e) { setNote({ ...note, [d.name]: e.message }); }
  };
  return html`<div className="bubble-ai">
    <div dir="auto" className=${"text" + (m.streaming ? " caret" : "")}>${m.text || (m.streaming ? "" : "…")}</div>
    ${meta.card && html`<div className="proto">
      <div className="proto-head between"><div><div className="upper">Onboard protocol</div><b className="small">${meta.card.summary}</b></div>
        <span className=${"badge b-" + { high: "crit", medium: "warn", low: "ok" }[meta.card.urgency]}>${cap(meta.card.urgency)} urgency</span></div>
      ${meta.card.steps.map((s, i) => html`<div key=${i} className=${"step" + (done[i] ? " done" : "")} onClick=${() => setDone({ ...done, [i]: !done[i] })}>
        <span className="n">${done[i] ? html`<${Icon} n="check" s=${12} w=${3}/>` : i + 1}</span><span className="t small">${s.text}</span>
        ${s.timer_s ? html`<${StepTimer} s=${s.timer_s}/>` : html`<span></span>`}</div>`)}
      ${meta.card.red_flags.length > 0 && html`<div className="xs" style=${{ padding: "9px 14px", background: "var(--crit-soft)", color: "var(--crit)" }}><b>Call the CMO now if:</b> ${meta.card.red_flags.join(" · ")}</div>`}
    </div>`}
    ${drugs.length > 0 && html`<div className="gap16" style=${{ gap: 6 }}><span className="xs muted">Checked against the onboard pharmacy</span>
      <div className="row wrap">${drugs.map((d) => html`<div key=${d.name} className="drug">
        <b>${d.name}</b><span className=${"badge " + DRUG[d.status][0]}>${DRUG[d.status][1]}</span>
        ${d.qty != null && html`<span className="xs muted mono">${d.qty} left</span>`}
        ${d.alternative && html`<span className="xs" style=${{ color: "var(--ok)" }}>→ ${d.alternative.name}</span>`}
        ${note[d.name] ? html`<span className="xs" style=${{ color: "var(--ok)" }}>${note[d.name]}</span>`
          : user.role !== "surgeon" && d.available && d.valid ? html`<button className="btn sm" onClick=${() => dispense(d)}>Dispense</button>` : null}
      </div>`)}</div></div>`}
    ${!m.streaming && meta.actions && html`<div className="row wrap">${meta.actions.map((a) => html`<button key=${a.type} className=${"btn sm" + (a.type === "procedure" ? " primary" : "")}
        disabled=${m.done && m.done[a.type]} onClick=${() => onAction(a, m)}>
        <${Icon} n=${{ procedure: "play", recheck: "clock", case: "send" }[a.type]} s=${13}/>${(m.done && m.done[a.type]) || a.label}</button>`)}</div>`}
    ${!m.streaming && html`<div className="row wrap xs muted" style=${{ gap: 12 }}>
      ${engine && html`<span className=${"badge " + ENGINE[engine][0]}>${ENGINE[engine][1]}</span>`}
      ${m.final && html`<span>Answered onboard in <b className="mono t2">${(m.final.latency_ms / 1000).toFixed(1)} s</b> · Earth round trip <b className="mono t2">${meta.earth_round_trip_min} min</b></span>`}
      ${meta.knowledge && meta.knowledge.length > 0 && html`<span title=${meta.knowledge.join("\n")}><${Icon} n="book" s=${12}/> Grounded in ${meta.knowledge.length} onboard sources</span>`}
    </div>`}
  </div>`;
}

function Assistant({ user, route, crew }) {
  const qs = new URLSearchParams(route.split("?")[1] || "");
  const [pid, setPid] = useState(Number(qs.get("crew")) || user.crew_id || 1);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(store.get("vo_voice", false));
  const [listening, setListening] = useState(false);
  const [proc, setProc] = useState(null);
  const [status] = usePoll("/assistant/status", 15000);
  const end = useRef(null);
  const patient = (crew || []).find((c) => c.id === pid) || (crew || [])[0];
  useEffect(() => { end.current && end.current.scrollIntoView({ block: "end" }); }, [msgs]);
  useEffect(() => { const q = qs.get("q"); if (q && crew) send(q); }, [!!crew]);

  const update = (fn) => setMsgs((ms) => { const c = ms.slice(); c[c.length - 1] = fn({ ...c[c.length - 1] }); return c; });
  async function send(t) {
    if (!t.trim() || busy) return;
    setText(""); setBusy(true);
    setMsgs((ms) => [...ms, { me: true, text: t }, { ai: true, text: "", streaming: true }]);
    try {
      await api.stream("/chat", { message: t, crew_id: pid }, (ev) => {
        if (ev.type === "meta") update((m) => ({ ...m, meta: ev }));
        if (ev.type === "token") update((m) => ({ ...m, text: m.text + ev.text }));
        if (ev.type === "final") update((m) => { speak(m.text, voice); return { ...m, final: ev, streaming: false }; });
      });
    } catch (e) { update((m) => ({ ...m, text: "Connection to the onboard computer failed.", streaming: false })); }
    setBusy(false);
  }
  const onAction = async (a, m) => {
    const mark = (label) => setMsgs((ms) => ms.map((x) => (x === m ? { ...x, done: { ...(x.done || {}), [a.type]: label } } : x)));
    if (a.type === "procedure") setProc(m.meta.card);
    if (a.type === "recheck") { await api.post("/recheck", { minutes: a.minutes, crew_id: pid }); mark(`Recheck set for +${a.minutes} min`); }
    if (a.type === "case") { const r = await api.post("/cases", { crew_id: pid }); mark(`Sent · reaches Earth at ${fmtClock(r.arrive)}`); }
  };
  const listen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input is not supported in this browser. Try Chrome."); return; }
    const r = new SR(); r.lang = /[؀-ۿ]/.test(text) ? "ar-EG" : "en-US"; r.interimResults = true;
    r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(""); setText(t); if (e.results[e.results.length - 1].isFinal) send(t); };
    r.onend = () => setListening(false);
    setListening(true); r.start();
  };
  const eng = status ? ENGINE[status.engine] : null;
  return html`<div className="grid cols-chat">
    <div className="card chat enter">
      <div className="card-head">
        <div className="row"><${Icon} n="chat"/><h3>Medical assistant</h3>${eng && html`<span className=${"badge " + eng[0]}>${eng[1]}</span>`}</div>
        <div className="row">
          <button className=${"btn sm" + (voice ? " primary" : "")} onClick=${() => { setVoice(!voice); store.set("vo_voice", !voice); if (voice) speechSynthesis.cancel(); }}><${Icon} n="volume" s=${13}/>Voice replies</button>
          <button className="btn sm" onClick=${() => { api.post("/chat/reset"); setMsgs([]); }}><${Icon} n="refresh" s=${13}/>New case</button></div>
      </div>
      <div className="msgs">
        ${msgs.length === 0 && html`<div className="enter" style=${{ margin: "auto", textAlign: "center", maxWidth: 460 }}>
          <div style=${{ color: "var(--accent)" }}><${Icon} n="pulse" s=${28}/></div>
          <h2 style=${{ fontSize: 18, margin: "8px 0 6px" }}>How can I help${patient && user.crew_id === patient.id ? `, ${patient.name.split(" ")[0]}` : ""}?</h2>
          <p className="muted small">I see live vitals, long-term risks and the pharmacy, and I keep working with no link to Earth. Describe a symptom, ask about your health, or speak in English or Arabic.</p></div>`}
        ${msgs.map((m, i) => m.me ? html`<div key=${i} dir="auto" className="bubble-me">${m.text}</div>`
          : html`<${AiMessage} key=${i} m=${m} patient=${patient} user=${user} voice=${voice} onAction=${onAction}/>`)}
        <div ref=${end}></div>
      </div>
      <div className="composer">
        <div className="chips">${QUICK.map((q) => html`<button key=${q} className="chip" disabled=${busy} onClick=${() => send(q)}>${q}</button>`)}</div>
        <form className="row" onSubmit=${(e) => { e.preventDefault(); send(text); }}>
          <button type="button" className=${"btn icon" + (listening ? " listening" : "")} title="Speak" onClick=${listen}><${Icon} n="mic"/></button>
          <input className="input grow" placeholder=${patient ? `Describe symptoms for ${patient.name.split(" ")[0]}…` : "Ask…"} value=${text} onInput=${(e) => setText(e.target.value)} dir="auto"/>
          <button className="btn primary" disabled=${busy || !text.trim()}><${Icon} n="send"/>Send</button>
        </form>
      </div>
    </div>
    <div className="gap16">
      ${user.role !== "astronaut" && html`<div className="card enter enter-1"><div className="card-head"><h3>Patient</h3></div>
        <div className="card-body gap16" style=${{ gap: 6 }}>${(crew || []).map((c) => html`<button key=${c.id} className=${"nav-item" + (c.id === pid ? " on" : "")} onClick=${() => { setPid(c.id); setMsgs([]); }}>
          <span className=${"dot " + STATUS[c.status][0]}></span>${c.name}<span className="badge b-mute mono">${c.health_score}</span></button>`)}</div></div>`}
      ${patient && html`<div className="card enter enter-2"><div className="card-head"><h3>Live context</h3><${Ring} value=${patient.health_score} status=${patient.status} size=${36} stroke=${4}/></div>
        <div className="card-body gap16 small" style=${{ gap: 6 }}>
          <div className="between"><span className="muted">Heart rate</span><span className="mono">${Math.round(patient.latest.hr)} bpm <span className="muted">/ ${Math.round(patient.baseline.hr)}</span></span></div>
          <div className="between"><span className="muted">SpO₂</span><span className="mono">${patient.latest.spo2} %</span></div>
          <div className="between"><span className="muted">Temperature</span><span className="mono">${patient.latest.temp.toFixed(1)} °C</span></div>
          <div className="between"><span className="muted">Sleep</span><span className="mono">${patient.latest.sleep_h} h</span></div>
          <div className="between"><span className="muted">ML anomaly</span><span className=${"badge " + (patient.anomaly_streak ? "b-crit" : "b-ok")}>${patient.anomaly_streak ? patient.anomaly_streak * 5 + " min" : "None"}</span></div>
        </div></div>`}
      <div className="card enter enter-3"><div className="card-head"><h3>How it stays safe</h3><${Icon} n="shield"/></div>
        <div className="card-body xs t2 gap16" style=${{ gap: 8 }}>
          <div>Protocol steps, red flags and timers come from the onboard knowledge base, not from the model's memory.</div>
          <div>Every medicine is checked live against stock and radiation-adjusted expiry before it is shown.</div>
          <div>Dispensing needs a confirmation and is logged. Case reports go to the flight surgeon as SOAP notes.</div>
          <div className="muted">Brain: ${status ? (status.claude ? "Claude" : status.local_ready ? status.local_model + " via Ollama (offline)" : "onboard protocols (install Ollama for the local model)") : "…"}</div>
        </div></div>
    </div>
    ${proc && html`<${Procedure} card=${proc} voice=${voice} onClose=${() => setProc(null)}/>`}
  </div>`;
}

/* ---------------- pharmacy ---------------- */
function MedForm({ med, onClose }) {
  const [f, setF] = useState(med || { name: "", category: "", form: "tablet", qty: 10, min_qty: 5, expiry: "2027-12-01", radiation_factor: 0.3, used_for: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  const save = async () => { try { await (med ? api.put(`/inventory/${med.id}`, f) : api.post("/inventory", f)); onClose(); } catch (e) { setErr(e.message); } };
  return html`<div className="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}><div className="modal">
    <div className="card-head"><h3>${med ? "Edit medicine" : "Add medicine"}</h3><button className="btn ghost icon" onClick=${onClose}><${Icon} n="x"/></button></div>
    <div className="card-body grid g2">
      <label className="field" style=${{ gridColumn: "1 / -1" }}>Name<input className="input" value=${f.name} onInput=${set("name")}/></label>
      <label className="field">Category<input className="input" value=${f.category} onInput=${set("category")}/></label>
      <label className="field">Form<input className="input" value=${f.form} onInput=${set("form")}/></label>
      <label className="field">Quantity<input className="input" type="number" value=${f.qty} onInput=${set("qty")}/></label>
      <label className="field">Minimum stock<input className="input" type="number" value=${f.min_qty} onInput=${set("min_qty")}/></label>
      <label className="field">Label expiry<input className="input" type="date" value=${f.expiry} onInput=${set("expiry")}/></label>
      <label className="field">Radiation sensitivity (0–1)<input className="input" type="number" step="0.1" min="0" max="1" value=${f.radiation_factor} onInput=${set("radiation_factor")}/></label>
      <label className="field" style=${{ gridColumn: "1 / -1" }}>Used for (keywords)<input className="input" value=${f.used_for} onInput=${set("used_for")}/></label>
      ${err && html`<div className="badge b-crit">${err}</div>`}
    </div>
    <div className="card-body between" style=${{ borderTop: "1px solid var(--border)" }}>
      <div>${med && html`<button className="btn danger" onClick=${async () => { await api.del(`/inventory/${med.id}`); onClose(); }}>Delete</button>`}</div>
      <div className="row"><button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" onClick=${save}>Save</button></div>
    </div>
  </div></div>`;
}

function Pharmacy({ user, mission }) {
  const [meds, reload] = usePoll("/inventory", 4000);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const cmo = user.role === "cmo";
  if (!meds) return html`<div className="skel" style=${{ height: 400 }}></div>`;
  const bad = meds.filter((m) => ["expired_radiation", "expired"].includes(m.status));
  const order = { expired_radiation: 0, expired: 0, out: 1, expiring: 2, low: 3, ok: 4 };
  const shown = meds.filter((m) => (m.name + m.category + m.used_for).toLowerCase().includes(q.toLowerCase()))
    .filter((m) => filter === "all" || (filter === "attention" ? m.status !== "ok" : true)).sort((a, b) => order[a.status] - order[b.status]);
  const lost = meds.reduce((a, m) => a + m.days_lost_to_radiation, 0);
  const tile = (label, val, color, i) => html`<div className=${"card risk enter enter-" + i}><span className="upper">${label}</span><div className="val" style=${{ color }}><${Num} v=${val}/></div></div>`;
  return html`<div className="gap16">
    <div className="page-head enter"><div><h1>Pharmacy</h1><p>Space radiation degrades medicines faster than on Earth, so every item has an effective expiry, not just the date on the label.</p></div>
      ${cmo ? html`<button className="btn primary" onClick=${() => setEdit({})}><${Icon} n="plus"/>Add medicine</button>` : html`<span className="badge b-mute"><${Icon} n="lock" s=${12}/>Managed by the CMO</span>`}</div>
    <div className="grid g4">
      ${tile("Items on board", meds.length, null, 1)}
      ${tile("Expired by radiation", bad.length, "var(--crit)", 2)}
      ${tile("Low or out of stock", meds.filter((m) => m.qty < m.min_qty).length, "var(--warn)", 3)}
      ${tile("Shelf-life days lost", lost, null, 4)}
    </div>
    <div className="card enter enter-2">
      <div className="card-head"><div className="row grow"><input className="input" style=${{ maxWidth: 320 }} placeholder="Search medicine or use" value=${q} onInput=${(e) => setQ(e.target.value)}/>
        <div className="seg"><button className=${filter === "all" ? "on" : ""} onClick=${() => setFilter("all")}>All</button><button className=${filter === "attention" ? "on" : ""} onClick=${() => setFilter("attention")}>Needs attention</button></div></div></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Medicine</th><th>Stock</th><th>Label expiry</th><th>Effective expiry</th><th>Radiation cost</th><th>Status</th>${cmo && html`<th></th>`}</tr></thead>
        <tbody>${shown.map((m) => html`<tr key=${m.id}>
          <td><b>${m.name}</b><div className="xs muted">${m.category}</div></td>
          <td style=${{ minWidth: 130 }}><span className="mono">${m.qty}</span> <span className="xs muted">/ min ${m.min_qty}</span>
            <div className="meter" style=${{ marginTop: 6 }}><i style=${{ width: Math.min(100, (100 * m.qty) / Math.max(1, m.min_qty * 2)) + "%", background: m.qty < m.min_qty ? "var(--warn)" : "var(--ok)" }}></i></div></td>
          <td className=${"mono small" + (m.label_valid && m.days_left < 0 ? " strike" : "")}>${m.expiry}</td>
          <td className="mono small" style=${{ color: m.days_left < 0 ? "var(--crit)" : m.days_left < 30 ? "var(--warn)" : undefined }}>${m.effective_expiry}
            <div className="xs muted">${m.days_left < 0 ? `${-m.days_left} days ago` : `${m.days_left} days left`}</div></td>
          <td><span className="mono small">−${m.days_lost_to_radiation} d</span><div className="xs muted">sensitivity ${m.radiation_factor}</div></td>
          <td><span className=${"badge " + DRUG[m.status][0]}>${DRUG[m.status][1]}</span></td>
          ${cmo && html`<td><button className="btn sm" onClick=${() => setEdit(m)}>Edit</button></td>`}
        </tr>`)}</tbody></table></div>
    </div>
    <div className="card card-pad enter enter-3 small t2">
      <div className="upper" style=${{ marginBottom: 6 }}>How effective expiry is computed</div>
      <div className="mono" style=${{ color: "var(--accent)", marginBottom: 8 }}>effective_expiry = label_expiry − (crew_dose ÷ 1.8 mSv/day) × radiation_sensitivity</div>
      Crew dose so far: <b className="mono">${mission ? mission.dose_msv : "…"} mSv</b>. 1.8 mSv/day is the Mars-cruise dose measured by Curiosity's RAD (Zeitlin et al., Science 2013); a solar storm raises it, so medicines age faster.
      NASA's ISS study found several flown medicines lost potency before their label date (Du et al., AAPS J 2011). The per-drug sensitivity is our modelling assumption.
    </div>
    ${edit && html`<${MedForm} med=${edit.id ? edit : null} onClose=${() => { setEdit(null); reload(); }}/>`}
  </div>`;
}

/* ---------------- comms with Earth ---------------- */
function Comms({ user, mission, crew }) {
  const [msgs, reload] = usePoll("/comms", 1500);
  const [f, setF] = useState({ subject: "", body: "", private: false, crew_id: null });
  const [open, setOpen] = useState(null);
  const earth = user.role === "surgeon";
  const name = (id) => (crew || []).find((c) => c.id === id)?.name || "All crew";
  const sendMsg = async () => {
    if (!f.body.trim()) return;
    await api.post("/comms", { ...f, subject: f.subject || (earth ? "Flight surgeon note" : "Message from the crew") });
    setF({ subject: "", body: "", private: false, crew_id: f.crew_id }); reload();
  };
  const sel = (msgs || []).find((m) => m.id === open);
  return html`<div className="gap16">
    <div className="page-head enter"><div><h1>${earth ? "Inbox · Mission Control" : "Messages with Earth"}</h1>
      <p>Store-and-forward link. Every message travels ${mission ? mission.light_delay_min : "…"} minutes at the speed of light${mission && mission.blackout ? "; solar conjunction blackout, messages are queued" : ""}.</p></div>
      <div style=${{ width: 260 }}><div className="between xs muted"><span>${earth ? "Earth" : "Ship"}</span><span>${earth ? "Ship" : "Earth"}</span></div><div className="link"><i></i><i className="back"></i></div></div></div>
    <div className="split">
      <div className="card enter enter-1">
        ${!msgs ? html`<div className="card-body"><div className="skel" style=${{ height: 200 }}></div></div>` : msgs.length === 0 ? html`<${Empty} icon="radio">No messages yet.</${Empty}>` :
          html`<div>${msgs.map((m) => {
            const total = m.arrive ? m.arrive - m.sent : 1, prog = m.arrive && mission ? Math.min(1, (mission.met_min - m.sent) / total) : 0;
            return html`<div key=${m.id} className="alert-row" style=${{ gridTemplateColumns: "28px 1fr", cursor: "pointer", background: open === m.id ? "var(--surface-2)" : undefined }} onClick=${() => setOpen(m.id)}>
              <div style=${{ color: m.kind === "alert" ? "var(--crit)" : m.private ? "var(--violet)" : "var(--accent)" }}><${Icon} n=${{ alert: "alert", case: "file", checkin: "smile", message: m.private ? "lock" : "chat" }[m.kind] || "chat"}/></div>
              <div><div className="between"><b className="small">${m.subject}</b><span className="xs muted mono">${fmtMet(m.sent)}</span></div>
                <div className="xs t2" style=${{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>${m.body}</div>
                <div className="row xs muted" style=${{ marginTop: 4 }}>
                  ${m.outgoing ? (m.state === "in flight" ? html`<span className="badge b-info">In flight</span><div className="progress grow"><i style=${{ width: prog * 100 + "%" }}></i></div><span className="mono">arrives ${fmtClock(m.arrive)}</span>`
                    : html`<span className=${"badge " + (m.state === "delivered" ? "b-ok" : "b-warn")}>${cap(m.state)}</span>`)
                    : html`<span className="badge b-ok">Received</span><span>from ${m.sender === "vitalorbit" ? "VitalOrbit (automatic)" : m.to === "earth" ? name(m.crew_id) : "Flight surgeon"}</span>`}
                  ${m.private && html`<span className="badge b-mute"><${Icon} n="lock" s=${11}/>Private</span>`}
                </div></div></div>`; })}</div>`}
      </div>
      <div className="gap16">
        ${sel && html`<div className="card enter"><div className="card-head"><h3>${sel.subject}</h3><button className="btn ghost icon" onClick=${() => setOpen(null)}><${Icon} n="x"/></button></div>
          <div className="card-body small">
            ${sel.data ? html`<dl className="soap" style=${{ margin: 0 }}>${["S", "O", "A", "P"].map((k) => html`<${Fragment} key=${k}><dt>${{ S: "Subjective", O: "Objective", A: "Assessment", P: "Plan" }[k]}</dt><dd>${sel.data[k]}</dd></${Fragment}>`)}</dl>` : html`<div className="t2">${sel.body}</div>`}
            ${earth && sel.crew_id && html`<button className="btn sm" style=${{ marginTop: 12 }} onClick=${() => setF({ ...f, crew_id: sel.crew_id, subject: "Re: " + sel.subject, private: sel.private })}>Reply</button>`}
          </div></div>`}
        <div className="card enter enter-2"><div className="card-head"><h3>${earth ? "Uplink to the ship" : "Write to the flight surgeon"}</h3><${Icon} n="send"/></div>
          <div className="card-body gap16" style=${{ gap: 10 }}>
            ${earth && html`<select className="input" value=${f.crew_id || ""} onChange=${(e) => setF({ ...f, crew_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">All crew</option>${(crew || []).map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}</select>`}
            <input className="input" placeholder="Subject" value=${f.subject} onInput=${(e) => setF({ ...f, subject: e.target.value })}/>
            <textarea className="input" rows="4" placeholder="Message" value=${f.body} onInput=${(e) => setF({ ...f, body: e.target.value })}></textarea>
            <label className="row small t2" style=${{ cursor: "pointer" }}><input type="checkbox" checked=${f.private} onChange=${(e) => setF({ ...f, private: e.target.checked })}/>
              <${Icon} n="lock" s=${13}/>Private medical conference${!earth ? " (only you and the flight surgeon)" : ""}</label>
            <button className="btn primary" onClick=${sendMsg} disabled=${!f.body.trim()}><${Icon} n="send"/>Send · arrives in ${mission ? mission.light_delay_min : "…"} min</button>
          </div></div>
      </div>
    </div>
  </div>`;
}

/* ---------------- scenario console ---------------- */
function Demo({ crew, mission, onClose }) {
  const [t, setT] = useState((crew && crew[0] && crew[0].id) || 1);
  useEffect(() => { if (crew && !crew.find((c) => c.id === t)) setT(crew[0].id); }, [crew]);
  return html`<div className="card demo">
    <div className="card-head"><div className="row"><${Icon} n="flask"/><h3>Scenario console</h3></div><button className="btn ghost icon" onClick=${onClose}><${Icon} n="x"/></button></div>
    <div className="card-body gap16" style=${{ gap: 10 }}>
      <select className="input" value=${t} onChange=${(e) => setT(Number(e.target.value))}>${(crew || []).map((c) => html`<option key=${c.id} value=${c.id}>${c.name}${c.scenario ? " · " + c.scenario : ""}</option>`)}</select>
      <div className="row wrap">${["tachycardia", "hypoxia", "fever"].map((k) => html`<button key=${k} className="btn sm danger" onClick=${() => api.post("/demo/inject", { crew_id: t, type: k })}>${cap(k)}</button>`)}
        <button className="btn sm" onClick=${() => api.post(`/demo/resolve/${t}`)}>Resolve</button></div>
      <div className="upper">Mission events</div>
      <div className="row wrap">
        <button className="btn sm danger" onClick=${() => api.post("/demo/solar-storm")}><${Icon} n="zap" s=${13}/>Solar storm</button>
        <button className="btn sm" onClick=${() => api.post(`/demo/blackout?on=${!(mission && mission.blackout)}`)}><${Icon} n="sat" s=${13}/>${mission && mission.blackout ? "End blackout" : "Blackout"}</button>
        <button className="btn sm" onClick=${() => api.post(`/demo/speed?paused=${!(mission && mission.paused)}`)}><${Icon} n=${mission && mission.paused ? "play" : "pause"} s=${13}/>${mission && mission.paused ? "Resume" : "Pause"}</button>
        <button className="btn sm" onClick=${() => confirm("Reset mission, alerts and pharmacy?") && api.post("/demo/reset")}><${Icon} n="refresh" s=${13}/>Reset</button>
      </div>
      <div className="xs muted">1 s = 5 mission minutes. Heart rate, activity and sleep replay real Fitbit recordings; scenarios overlay simulated emergencies.</div>
    </div>
  </div>`;
}

/* ---------------- toasts ---------------- */
let actx;
function beep(critical) {
  try {
    actx = actx || new AudioContext();
    [0, 0.16].slice(0, critical ? 2 : 1).forEach((t) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = critical ? 880 : 660; o.type = "sine";
      g.gain.setValueAtTime(0.06, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.14);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.15);
    });
  } catch (e) {}
}
function Toasts({ alerts }) {
  const seen = useRef(null);
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!alerts) return;
    const max = alerts.reduce((m, a) => Math.max(m, a.id), 0);
    if (seen.current === null) { seen.current = max; return; }
    const fresh = alerts.filter((a) => a.id > seen.current);
    if (!fresh.length) return;
    seen.current = max;
    beep(fresh.some((a) => a.severity === "critical"));
    setList((l) => [...fresh, ...l].slice(0, 3));
    fresh.forEach((a) => setTimeout(() => setList((l) => l.filter((x) => x.id !== a.id)), 6500));
  }, [alerts]);
  return html`<div className="toasts">${list.map((a) => html`<div key=${a.id} className=${"toast " + a.severity}>
    <div className="row"><span className=${"dot " + (a.severity === "critical" ? "crit" : "warn")}></span><span className="upper">${a.severity}</span></div>
    <div style=${{ marginTop: 4 }}>${a.message}</div></div>`)}</div>`;
}

/* ---------------- self-running demo tour (?tour=1): drives the real app and shows captions ---------------- */
function useTour(setUser, setCaption) {
  useEffect(() => {
    if (!/[?&]tour=1/.test(location.search)) return;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const COMMON = ["/mission", "/crew", "/alerts"];
    const PRE = {
      amina: ["/ml/evaluation"],
      sara: ["/crew/1", "/crew/1/vitals?hours=24", "/crew/1/risks", "/medlog/1", "/checkins/1", "/prompts", "/assistant/status"],
      mansour: ["/comms", "/crew/1/risks", "/crew/2/risks", "/crew/3/risks", "/crew/4/risks"],
    };
    const as = async (id, pin, hash) => {
      const r = await api.post("/login", { user_id: id, pin }); api.setToken(r.token);
      await api.prefetch([...COMMON, ...(PRE[id] || [])]);   // render the next page instantly
      setUser(r.user); location.hash = hash;
    };
    document.documentElement.classList.add("touring");
    const click = (txt) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(txt)); b && b.click(); };
    const scrollTo = (sel, off = 70) => { const e = document.querySelector(sel); e && window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - off, behavior: "instant" }); };
    (async () => {
      api.setToken(null); setUser(null); location.hash = "";
      await wait(400);
      setCaption("On Mars, Earth is 19 light-minutes away. The crew must handle medical problems alone.");
      await wait(3200);
      await as("amina", "3333", "#/crew");
      await api.post("/demo/speed?seconds_per_reading=0.3");
      setCaption("VitalOrbit runs onboard. It learns each astronaut's normal from real wearable data.");
      await wait(1800);
      await api.post("/demo/inject", { crew_id: 1, type: "tachycardia" });
      await wait(900);
      scrollTo(".split");
      await wait(1100);
      setCaption("Sara's heart races at rest. Her personal ML model flags it and alerts the crew.");
      await wait(3600);
      await as("sara", "1111", "#/me");
      await api.post("/chat/reset");
      window.scrollTo(0, 0);
      setCaption("Before it becomes an emergency, VitalOrbit asks Sara how she feels.");
      await wait(3000);
      click("I don't feel well");
      setCaption("The offline assistant already knows it's her heart: protocol, timers, medicine checked in the pharmacy.");
      await wait(4000);
      click("Start guided procedure");
      await api.post("/cases", {});
      setCaption("Hands-free guided care. A case report is sent to Earth.");
      await wait(3000);
      await as("mansour", "9999", "#/comms");
      setCaption("Mission Control receives it 19 minutes later. The crew has already acted.");
      await wait(3200);
      location.hash = "#/risks";
      setCaption("Beyond emergencies: radiation, bone, muscle, vision and mind, forecast to mission end.");
      await wait(3600);
      api.setToken(null); setUser(null); location.hash = "";
      setCaption("VitalOrbit · Medicine beyond Earth's reach");
      await api.post("/demo/speed?seconds_per_reading=1").catch(() => {});
      await wait(3500);
      setCaption("");
    })();
  }, []);
}

/* ?as=<user> signs in with the demo PIN (screenshots, demo links); ?scroll=<selector> scrolls once rendered */
function useAutoLogin(setUser) {
  useEffect(() => {
    const q = new URLSearchParams(location.search), who = q.get("as");
    if (!who) return;
    api.get("/users").then((us) => {
      const u = us.find((x) => x.id === who);
      return u && api.post("/login", { user_id: u.id, pin: u.demo_pin });
    }).then((r) => { if (r) { api.setToken(r.token); setUser(r.user); } });
    const sel = q.get("scroll");
    if (sel) setTimeout(() => { const e = document.querySelector(sel); e && window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70); }, 5000);
  }, []);
}

function TourCaption({ text }) {
  if (!text) return null;
  return html`<div className="tour-cap" key=${text}>${text}</div>`;
}

/* ---------------- app ---------------- */
function App() {
  const [theme, setThemeS] = useState((location.search.match(/[?&]theme=(dark|light)/) || [])[1] || store.get("vo_theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  const setTheme = (t) => { setThemeS(t); store.set("vo_theme", t); };
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const [user, setUser] = useState(undefined);
  const [demoOpen, setDemoOpen] = useState(false);
  const [caption, setCaption] = useState("");
  useTour(setUser, setCaption);
  useAutoLogin(setUser);
  const route = useHash();
  useEffect(() => {
    if (!TOKEN) { setUser(null); return; }
    api.get("/me").then(setUser).catch(() => setUser(null));
    const out = () => { api.setToken(null); setUser(null); };
    addEventListener("vo-logout", out);
    return () => removeEventListener("vo-logout", out);
  }, []);
  const [mission] = usePoll(user ? "/mission" : null, 1000, [user && user.id]);
  const [crew] = usePoll(user ? "/crew" : null, 1000, [user && user.id]);
  const [alerts, reloadAlerts] = usePoll(user ? "/alerts" : null, 1500, [user && user.id]);

  if (user === undefined) return html`<div></div>`;
  if (!user) return html`<${Fragment}><${Login} theme=${theme} setTheme=${setTheme} onLogin=${(u) => { setUser(u); location.hash = u.role === "astronaut" ? "#/me" : "#/crew"; }}/><${TourCaption} text=${caption}/><//>`;
  const home = user.role === "astronaut" ? "#/me" : "#/crew";
  const r = route === "#/" || route === "" ? home : route;
  let page;
  if (r.startsWith("#/crew/")) page = html`<${Health} user=${user} cid=${Number(r.split("/")[2])} mission=${mission}/>`;
  else if (r.startsWith("#/crew") && user.role !== "astronaut") page = html`<${CrewOverview} user=${user} mission=${mission} crew=${crew} alerts=${alerts} refreshAlerts=${reloadAlerts}/>`;
  else if (r.startsWith("#/risks") && user.role !== "astronaut") page = html`<${RiskBoard} crew=${crew} mission=${mission}/>`;
  else if (r.startsWith("#/assistant")) page = html`<${Assistant} key=${r} user=${user} route=${r} crew=${crew}/>`;
  else if (r.startsWith("#/pharmacy") && user.role !== "surgeon") page = html`<${Pharmacy} user=${user} mission=${mission}/>`;
  else if (r.startsWith("#/comms")) page = html`<${Comms} user=${user} mission=${mission} crew=${crew}/>`;
  else if (user.crew_id) page = html`<${Health} user=${user} cid=${user.crew_id} mission=${mission}/>`;
  else page = html`<${CrewOverview} user=${user} mission=${mission} crew=${crew} alerts=${alerts} refreshAlerts=${reloadAlerts}/>`;
  return html`<${Fragment}>
    <${Shell} user=${user} route=${r} mission=${mission} alerts=${alerts} theme=${theme} setTheme=${setTheme} demoOpen=${demoOpen} setDemoOpen=${setDemoOpen}
      onLogout=${() => { api.setToken(null); setUser(null); location.hash = ""; }}>${page}</${Shell}>
    <${Toasts} alerts=${alerts}/>
    <${TourCaption} text=${caption}/>
    ${demoOpen && html`<${Demo} crew=${crew} mission=${mission} onClose=${() => setDemoOpen(false)}/>`}
  </${Fragment}>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App}/>`);
