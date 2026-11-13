/* VitalOrbit core: React + htm setup, API client, hooks, icons and shared visual components. */
const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
const html = htm.bind(React.createElement);

/* ---------------- API ---------------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
let TOKEN = store.get("vo_token", null);
const api = {
  setToken(t) { TOKEN = t; store.set("vo_token", t); },
  async req(path, method = "GET", body) {
    const r = await fetch("/api" + path, {
      method, headers: { "content-type": "application/json", ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { window.dispatchEvent(new Event("vo-logout")); throw new Error("auth"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || "Request failed");
    return d;
  },
  get(p) { return api.req(p); },
  post(p, b) { return api.req(p, "POST", b || {}); },
  put(p, b) { return api.req(p, "PUT", b); },
  del(p) { return api.req(p, "DELETE"); },
  async stream(path, body, onLine) {
    const r = await fetch("/api" + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + TOKEN }, body: JSON.stringify(body) });
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) onLine(JSON.parse(line));
      }
    }
  },
};

/* ---------------- hooks ---------------- */
function usePoll(path, ms = 1000, deps = []) {
  const [data, setData] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const load = () => api.get(path).then((d) => alive && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => { alive = false; clearInterval(t); };
  }, [path, ms, n, ...deps]);
  return [data, () => setN((x) => x + 1)];
}

function useHash() {
  const [h, setH] = useState(location.hash || "#/");
  useEffect(() => {
    const f = () => setH(location.hash || "#/");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* Smoothly tween a number when it changes */
function useTween(value, ms = 600) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (typeof value !== "number" || isNaN(value)) { setV(value); return; }
    const start = performance.now(), a = typeof from.current === "number" ? from.current : value;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return v;
}
function Num({ v, d = 0 }) {
  const t = useTween(v);
  return html`<span className="num">${typeof t === "number" ? t.toFixed(d) : "–"}</span>`;
}

/* ---------------- formatting ---------------- */
const fmtMet = (m) => `D${Math.floor(m / 1440)} ${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const fmtClock = (m) => fmtMet(m).split(" ")[1];
const initials = (n) => n.replace("Dr. ", "").split(" ").map((p) => p[0]).join("").slice(0, 2);
const STATUS = { green: ["ok", "Nominal"], amber: ["warn", "Watch"], red: ["crit", "Alert"] };
const LEVEL = { low: "ok", moderate: "mute", elevated: "warn", high: "crit" };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------- icons (hand-drawn 24px line set) ---------------- */
const ICONS = {
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"],
  pulse: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  drop: ["M12 2.7l5.7 5.6a8 8 0 1 1-11.3 0z"],
  thermo: ["M14 14.8V3.5a2.5 2.5 0 0 0-5 0v11.3a4.5 4.5 0 1 0 5 0z"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"],
  sun: ["c:12,12,4", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  users: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "c:9,7,4", "M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"],
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "c:12,7,4"],
  alert: ["M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4M12 17h.01"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  radio: ["c:12,12,2", "M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"],
  pill: ["M10.5 20.5a5 5 0 1 1-7-7l10-10a5 5 0 1 1 7 7z", "M8.5 8.5l7 7"],
  grid: ["r:3,3,7,7,1.5", "r:14,3,7,7,1.5", "r:14,14,7,7,1.5", "r:3,14,7,7,1.5"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5M21 12H9"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  mic: ["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"],
  volume: ["M11 5L6 9H2v6h4l5 4V5z", "M19.1 4.9a10 10 0 0 1 0 14.2M15.5 8.5a5 5 0 0 1 0 7"],
  check: ["M20 6L9 17l-5-5"],
  x: ["M18 6L6 18M6 6l12 12"],
  clock: ["c:12,12,10", "M12 6v6l4 2"],
  play: ["M6 4l14 8-14 8V4z"],
  pause: ["M6 4h4v16H6zM14 4h4v16h-4z"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "c:12,12,3"],
  zap: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  bone: ["M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z"],
  smile: ["c:12,12,10", "M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"],
  wind: ["M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"],
  globe: ["c:12,12,10", "M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"],
  flask: ["M9 3h6M10 3v6L4.2 19.5A1 1 0 0 0 5.1 21h13.8a1 1 0 0 0 .9-1.5L14 9V3"],
  lock: ["r:4,11,16,10,2", "M8 11V7a4 4 0 0 1 8 0v4"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M16 13H8M16 17H8M10 9H8"],
  trend: ["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"],
  chevron: ["M9 18l6-6-6-6"],
  back: ["M15 18l-6-6 6-6"],
  plus: ["M12 5v14M5 12h14"],
  refresh: ["M23 4v6h-6M1 20v-6h6", "M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"],
  cpu: ["r:4,4,16,16,2", "r:9,9,6,6,1", "M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"],
  sat: ["M13 7L9 3 5 7l4 4M17 11l4 4-4 4-4-4M8 12l4 4M16 8l-4 4", "M3 21c0-3 2-5 5-5", "M3 17a2 2 0 0 1 2-2"],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z", "M20 17v5H6.5a2.5 2.5 0 0 1 0-5"],
};
function Icon({ n, s = 16, w = 1.75, className = "" }) {
  const parts = ICONS[n] || [];
  return html`<svg className=${"ic " + className} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    ${parts.map((p, i) => {
      if (p.startsWith("c:")) { const [cx, cy, r] = p.slice(2).split(","); return html`<circle key=${i} cx=${cx} cy=${cy} r=${r}/>`; }
      if (p.startsWith("r:")) { const [x, y, w2, h, rx] = p.slice(2).split(","); return html`<rect key=${i} x=${x} y=${y} width=${w2} height=${h} rx=${rx}/>`; }
      return html`<path key=${i} d=${p}/>`;
    })}
  </svg>`;
}

/* VitalOrbit mark: a dotted planet held in a V (theme of the UnoSyn team mark), one orange crew dot */
const LOGO_DOTS = (() => {
  const n = 64, g = Math.PI * (3 - Math.sqrt(5)), t = 0.4, out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), p = i * g, x = Math.cos(p) * r, z = Math.sin(p) * r;
    const y2 = y * Math.cos(t) - z * Math.sin(t), z2 = y * Math.sin(t) + z * Math.cos(t);
    if (z2 > -0.15) out.push([16 + x * 6.4, 13.6 - y2 * 6.4, (z2 + 1) / 2]);
  }
  return out;
})();
function Logo({ s = 28 }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 32 32" aria-hidden="true" style=${{ flex: "none" }}>
    ${LOGO_DOTS.map(([x, y, d], i) => html`<circle key=${i} cx=${x.toFixed(2)} cy=${y.toFixed(2)} r=${(0.38 + 0.42 * d).toFixed(2)} fill="var(--accent)" opacity=${(0.3 + 0.7 * d).toFixed(2)}/>`)}
    <circle cx="18.9" cy="11" r="1.45" fill="#ff7a59"/>
    <path d="M4.9 9.8 L16 29 L27.1 9.8" fill="none" stroke="var(--text)" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>`;
}

/* ---------------- shared visual components ---------------- */
function Src({ k }) {
  const t = { real: "REAL", simulated: "SIM", model: "MODEL" }[k] || k;
  const tip = { real: "Real wearable data (Fitbit dataset, Zenodo 53894)", simulated: "Simulated: the wearable does not record this", model: "Projection from published spaceflight rates" }[k];
  return html`<span className=${"src " + k} title=${tip}>${t}</span>`;
}

function Ring({ value, status, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = { green: "var(--ok)", amber: "var(--warn)", red: "var(--crit)" }[status] || "var(--accent)";
  const v = useTween(value, 900);
  return html`<svg width=${size} height=${size} style=${{ flex: "none" }}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--surface-3)" strokeWidth=${stroke}/>
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${col} strokeWidth=${stroke} strokeLinecap="round"
      strokeDasharray=${c} strokeDashoffset=${c * (1 - v / 100)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} style=${{ transition: "stroke .4s" }}/>
    <text x="50%" y="51%" textAnchor="middle" dominantBaseline="middle" style=${{ fill: "var(--text)", font: `600 ${size / 3.3}px "IBM Plex Mono", monospace` }}>${Math.round(v)}</text>
  </svg>`;
}

function Spark({ data, h = 36, color = "var(--accent)" }) {
  const [ref, w] = useWidth();
  if (!data || data.length < 2) return html`<div ref=${ref} style=${{ height: h, overflow: "hidden" }}></div>`;
  const lo = Math.min(...data) - 3, hi = Math.max(...data) + 3;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - lo) / (hi - lo)) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return html`<div ref=${ref} style=${{ overflow: "hidden" }}><svg width="100%" height=${h} viewBox=${`0 0 ${w} ${h}`} preserveAspectRatio="none" style=${{ display: "block" }}>
    <path d=${d + ` L${w} ${h} L0 ${h} Z`} fill=${color} opacity="0.07"/>
    <path d=${d} fill="none" stroke=${color} strokeWidth="1.5"/>
    <circle cx=${last[0]} cy=${last[1]} r="2.5" fill=${color}/>
  </svg></div>`;
}

function LineChart({ data, k, color, base, lo, hi, h = 170, unit }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  if (!data || !data.length) return html`<div ref=${ref} className="skel" style=${{ height: h }}></div>`;
  const padL = 36, padB = 20, iw = w - padL - 8, ih = h - padB - 8;
  const vals = data.map((d) => d[k]);
  let min = Math.min(lo, ...vals), max = Math.max(hi, ...vals);
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const x = (i) => padL + (i / Math.max(1, data.length - 1)) * iw;
  const y = (v) => 8 + ih - ((v - min) / (max - min)) * ih;
  const d = data.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const xt = data.map((p, i) => [p, i]).filter(([p]) => p.ts % 360 === 0);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / iw) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };
  return html`<div ref=${ref} style=${{ position: "relative", overflow: "hidden" }}>
    <svg className="chart" width=${w} height=${h} style=${{ display: "block" }} onMouseMove=${onMove} onMouseLeave=${() => setHover(null)}>
      <rect x=${padL} y=${y(hi)} width=${iw} height=${Math.max(0, y(lo) - y(hi))} fill=${color} opacity="0.05"/>
      ${ticks.map((t, i) => html`<g key=${i}><line x1=${padL} x2=${padL + iw} y1=${y(t)} y2=${y(t)} stroke="var(--chart-grid)"/>
        <text x=${padL - 6} y=${y(t) + 3} textAnchor="end">${t.toFixed(k === "temp" ? 1 : 0)}</text></g>`)}
      ${xt.map(([p, i]) => html`<text key=${p.ts} x=${x(i)} y=${h - 5} textAnchor="middle">${fmtClock(p.ts)}</text>`)}
      ${base != null && html`<line x1=${padL} x2=${padL + iw} y1=${y(base)} y2=${y(base)} stroke=${color} strokeDasharray="3 5" opacity="0.6"/>`}
      <path d=${d} fill="none" stroke=${color} strokeWidth="1.6" strokeLinejoin="round"/>
      ${data.map((p, i) => p.anomaly && html`<circle key=${p.ts} cx=${x(i)} cy=${y(p[k])} r="3" fill="var(--crit)"/>`)}
      ${hover != null && html`<g><line x1=${x(hover)} x2=${x(hover)} y1="8" y2=${8 + ih} stroke="var(--border-strong)"/>
        <circle cx=${x(hover)} cy=${y(data[hover][k])} r="4" fill=${color} stroke="var(--surface)" strokeWidth="2"/></g>`}
    </svg>
    ${hover != null && html`<div className="card xs" style=${{ position: "absolute", top: 4, left: Math.min(x(hover) + 10, w - 150), padding: "6px 9px", pointerEvents: "none" }}>
      <b className="mono">${data[hover][k]} ${unit}</b> <span className="muted">${fmtMet(data[hover].ts)}</span>
      ${data[hover].anomaly ? html`<div style=${{ color: "var(--crit)" }}>ML anomaly</div>` : null}</div>`}
  </div>`;
}

function Meter({ value, limit, projection, level }) {
  const max = Math.max(limit || 0, projection || 0, value) * 1.1 || 1;
  const col = `var(--${LEVEL[level] === "mute" ? "text-2" : LEVEL[level]})`;
  return html`<div className="meter">
    ${projection != null && html`<u style=${{ width: (100 * projection) / max + "%", background: col }}></u>`}
    <i style=${{ width: (100 * value) / max + "%", background: col }}></i>
    ${limit != null && html`<b style=${{ left: (100 * limit) / max + "%" }} title="limit"></b>`}
  </div>`;
}

function Empty({ icon = "check", children }) {
  return html`<div className="empty"><div style=${{ marginBottom: 6, opacity: 0.6 }}><${Icon} n=${icon} s=${20}/></div>${children}</div>`;
}

Object.assign(window, { html, api, store, usePoll, useHash, useWidth, useTween, Num, fmtMet, fmtClock, initials, STATUS, LEVEL, cap,
  Icon, Logo, Src, Ring, Spark, LineChart, Meter, Empty, useState, useEffect, useRef, useMemo, useCallback, Fragment });
