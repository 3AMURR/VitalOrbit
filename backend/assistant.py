"""VitalOrbit AI medical assistant: a real chatbot with retrieval, live context and safe actions.

Brains, in order of preference (all free except Claude):
1. Claude (only if ANTHROPIC_API_KEY is set) - best quality, needs a link to Earth's internet.
2. Local model through Ollama (default qwen2.5:1.5b) - runs fully offline on the ship's computer.
3. Onboard protocols - deterministic first-aid cards, always available.

Whatever the brain says, safety stays in code: the protocol card, red flags, timers and drug checks come from
the onboard knowledge base and the pharmacy database, never from the language model's memory.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from . import pharmacy
from .protocols import FACTS, GENERIC, PROTOCOLS

CLAUDE_MODEL = "claude-opus-5-5"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("VITALORBIT_MODEL", "qwen2.5:1.5b")

# Arabic (Egyptian) symptom words -> English keywords, so protocols also trigger in Arabic
AR = {"قلب": "heart racing", "نبض": "palpitation", "دوخ": "dizzy", "دايخ": "dizzy", "حرار": "fever", "سخون": "fever",
      "صداع": "headache", "نظر": "vision", "عين": "eye", "نوم": "sleep", "أرق": "insomnia", "غثيان": "nausea",
      "ترجيع": "vomit", "نفس": "breath", "حرق": "burn", "جرح": "cut bleed", "نزيف": "bleed", "ضهر": "back pain",
      "ألم": "pain", "وجع": "pain", "صدر": "chest pain"}

DOCS = ([(f"Protocol: {p['summary']}", p["summary"] + " " + " ".join(p["steps"]) + " " + p["keys"].replace("|", " "))
         for p in PROTOCOLS] + [(f"Fact: {t}", f"{t}. {x}") for t, x in FACTS])
_vec = TfidfVectorizer(stop_words="english").fit([d[1] for d in DOCS])
_mat = _vec.transform([d[1] for d in DOCS])

HISTORY: dict[str, list[dict]] = {}        # (user, patient) -> conversation
_status = {"t": 0, "local": False}


def normalize(msg: str) -> str:
    extra = [en for ar, en in AR.items() if ar in msg]
    return (msg + " " + " ".join(extra)).lower()


def retrieve(query: str, k: int = 3):
    sims = cosine_similarity(_vec.transform([query]), _mat)[0]
    idx = sims.argsort()[::-1][:k]
    return [(DOCS[i][0], DOCS[i][1], float(sims[i])) for i in idx if sims[i] > 0.05]


def match_protocol(q: str):
    return next((p for p in PROTOCOLS if re.search(p["keys"], q)), None)


def timers(step: str):
    m = re.search(r"(\d+)\s*(second|minute)", step)
    return int(m.group(1)) * (1 if m.group(2) == "second" else 60) if m else None


# ---------- questions about one's own long-term health (answered from the risk model, no LLM needed) ----------
RISK_WORDS = {
    "bone": r"bone|density|osteo|عظم",
    "muscle": r"muscle|strength|عضل",
    "radiation": r"radiation|dose|msv|إشعاع|اشعاع",
    "sans": r"vision|eyes?|sans|sight|نظر|عين",
    "behavioral": r"mood|stress|anxi|lonely|mental|isolation|مزاج|توتر|قلق|نفسي",
    "co2": r"co2|cabin air|air quality|هوا",
}
QUESTION = r"how (is|are|am|'s)|what('s| is| are)|status|doing|level|risk|projection|كام|عامل|عاملة|ازاي|إزاي|ايه|إيه|\?|؟"
SYMPTOM = r"hurt|pain|ache|blur|can't see|cannot see|dizz|بيوجع|وجع|مش شايف"
AR_NAME = {"radiation": "التعرض للإشعاع", "bone": "فقدان كثافة العظم (الحوض)", "muscle": "فقدان كتلة العضلات (الرجلين)",
           "sans": "النظر (متلازمة SANS)", "behavioral": "الصحة النفسية", "co2": "ثاني أكسيد الكربون في الكابينة"}
AR_LEVEL = {"low": "منخفض", "moderate": "متوسط", "elevated": "مرتفع", "high": "عالي"}
AR_ACTION = {"radiation": "استخدم ملجأ العواصف الشمسية، وخطط مواعيد السير في الفضاء حسب ميزانية الجرعة.",
             "bone": "زوّد تمارين المقاومة على جهاز التمرين، وراجع فيتامين د والكالسيوم.",
             "muscle": "خلّي تمارين السكوات والرفعات التقيلة في الجدول.",
             "sans": "فحص OCT والنظر أسبوعياً، وراقب نسبة CO2 في الكابينة.",
             "behavioral": "اطلب محادثة خاصة مع الجراح على الأرض، واحمي وقت نومك.",
             "co2": "لو عدّى 3 mmHg افحص جهاز إزالة الـ CO2 والتهوية."}


def is_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def risk_question(q: str):
    if re.search(SYMPTOM, q) or not re.search(QUESTION, q):
        return []
    keys = [k for k, rx in RISK_WORDS.items() if re.search(rx, q)]
    if not keys and re.search(r"health|overall|صحتي|حالتي", q):
        keys = ["radiation", "bone", "muscle", "sans", "behavioral"]
    return keys


def risk_answer(keys, crew, risks, ar):
    lines = []
    for r in risks:
        if r["key"] not in keys:
            continue
        proj = (f" Projected {r['projection']} {r['unit']} at mission end" + (f", crossing the limit around day {r['cross_day']}" if r["cross_day"] else "") + "."
                if r["projection"] is not None else "")
        if ar:
            proj_ar = (f" المتوقع {r['projection']} {r['unit']} في نهاية المهمة" + (f"، وهيعدّي الحد تقريباً يوم {r['cross_day']}" if r["cross_day"] else "") + "."
                       if r["projection"] is not None else "")
            lines.append(f"• {AR_NAME[r['key']]}: {r['value']} {r['unit']} دلوقتي (المستوى {AR_LEVEL[r['level']]}).{proj_ar} {AR_ACTION[r['key']]}")
        else:
            lines.append(f"• {r['name']}: {r['value']} {r['unit']} now ({r['level']}). {r['detail']}.{proj} {r['action']}")
    who = crew["name"].split(" ")[0] if crew else ""
    if ar:
        return f"ده ملخص حالتك على المدى الطويل يا {who}، محسوب من بياناتك الحقيقية ونموذج المخاطر:\n" + "\n".join(lines)
    return f"Here is your long-term picture, {who}, from your own data and the mission risk model:\n" + "\n".join(lines)


AR_SUMMARY = {
    "Medical emergency": "طوارئ طبية: زميل فاقد الوعي. ابدأ الإنعاش القلبي الرئوي المعدّل لانعدام الجاذبية.",
    "Possible cardiac event": "احتمال أزمة قلبية: اتعامل معاها كحالة طوارئ.",
    "Fast heart rate": "نبض سريع وانت مرتاح مع دوخة: غالباً تسارع في ضربات القلب، ممكن من الجفاف أو انتقال السوائل.",
    "Low blood oxygen": "أكسجين الدم قليل أو ضيق نفس: افحص هوا الكابينة الأول، وبعدين الشخص.",
    "Fever": "سخونية: غالباً عدوى، والمناعة بتضعف في الفضاء.",
    "Headache or vision": "صداع أو تغيّر في النظر: في الفضاء فكّر في متلازمة SANS (انتقال السوائل للراس).",
    "Nausea": "غثيان، شائع في أول أيام انعدام الجاذبية أو بعد تغيير المواعيد.",
    "Poor sleep": "نوم قليل: طواقم المحطة بتنام حوالي 6 ساعات، وقلة النوم بتأثر على القرارات.",
    "Burn injury": "حرق.",
    "Cut or bleeding": "جرح أو نزيف.",
    "Musculoskeletal pain": "ألم في العضلات أو الضهر، غالباً من تمدد العمود الفقري في انعدام الجاذبية.",
}


def local_ready() -> bool:
    if time.time() - _status["t"] > 20:
        _status["t"] = time.time()
        try:
            with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=1.5) as r:
                names = [m["name"] for m in json.load(r).get("models", [])]
            _status["local"] = any(n.startswith(OLLAMA_MODEL.split(":")[0]) for n in names)
        except Exception:
            _status["local"] = False
    return _status["local"]


def engine_name():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "claude"
    return "local" if local_ready() else "protocol"


def status():
    return dict(engine=engine_name(), local_model=OLLAMA_MODEL, local_ready=local_ready(),
                claude=bool(os.environ.get("ANTHROPIC_API_KEY")))


# ---------------- context ----------------
def _system(crew, risks, meds, knowledge, mission, user):
    usable = ", ".join(m["name"] for m in meds if m["usable"])
    unusable = ", ".join(f"{m['name']} ({m['status'].replace('_', ' ')})" for m in meds if not m["usable"])
    lines = [
        "You are VitalOrbit, the onboard medical assistant of a crewed spacecraft travelling to Mars.",
        f"Earth is {mission['light_delay_min']} light-minutes away, so the crew must act before the flight surgeon can answer.",
        "Speak like a calm, experienced flight surgeon. Be warm and brief: at most 120 words.",
        "When giving instructions use short numbered steps. Ask one follow-up question if something important is unknown.",
        "Only recommend medicines from the USABLE list. Never invent medicines or doses beyond common adult doses.",
        "You are not a diagnosis. For red-flag symptoms tell them to call the Crew Medical Officer, Amina Okafor, now.",
        "Reply in the same language the user writes in.",
        f"User: {user['name']} ({user['title']}).",
    ]
    if crew:
        l, b = crew["latest"], crew["baseline"]
        lines.append(f"Patient: {crew['name']}, {crew['role']}. Live: heart rate {l['hr']:.0f} bpm (personal resting {b['hr']:.0f}), "
                     f"SpO2 {l['spo2']} %, temperature {l['temp']:.1f} C, last sleep {l['sleep_h']} h, activity {crew['activity_label']}, "
                     f"health score {crew['health_score']}/100, ML anomaly {'YES' if l['anomaly'] else 'no'}.")
    if risks:
        top = risks if user.get("_all_risks") else [r for r in risks if r["level"] in ("elevated", "high")]
        if top:
            lines.append("Long-term risks: " + "; ".join(f"{r['name']} {r['value']} {r['unit']} ({r['level']})" for r in top))
    lines.append(f"USABLE medicines: {usable}.")
    if unusable:
        lines.append(f"NOT usable: {unusable}.")
    if knowledge:
        lines.append("Onboard knowledge:\n" + "\n".join(f"- {k[1][:420]}" for k in knowledge))
    return "\n".join(lines)


# ---------------- brains (streaming) ----------------
def _claude_stream(system, messages):
    import anthropic
    client = anthropic.Anthropic(timeout=30.0, max_retries=1)
    with client.beta.messages.stream(model=CLAUDE_MODEL, max_tokens=1200, system=system, messages=messages,
                                     output_config={"effort": "low"},
                                     betas=["server-side-fallback-2026-07-01"], fallbacks="default") as s:
        for text in s.text_stream:
            yield text


def _local_stream(system, messages):
    body = json.dumps(dict(model=OLLAMA_MODEL, stream=True, keep_alive="30m",
                           options=dict(temperature=0.3, num_predict=280, num_ctx=2048),
                           messages=[{"role": "system", "content": system}] + messages)).encode()
    req = urllib.request.Request(OLLAMA_URL + "/api/chat", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        for line in r:
            if line.strip():
                d = json.loads(line)
                if d.get("message", {}).get("content"):
                    yield d["message"]["content"]
                if d.get("done"):
                    break


def _protocol_text(proto, crew, ar=False):
    if ar:
        if proto is GENERIC:
            return "مقدرتش أربط ده ببروتوكول عندي. قولّي بيوجعك فين، من إمتى، وقوته من 0 لـ 10. ولو حاسس إنك مش في أمان كلّم الضابط الطبي فوراً."
        lead = ""
        if crew:
            l, b = crew["latest"], crew["baseline"]
            notes = []
            if l["hr"] > b["hr"] + 25:
                notes.append(f"نبضك {l['hr']:.0f} في الدقيقة، أعلى من الطبيعي بتاعك بحوالي {l['hr'] - b['hr']:.0f}")
            if l["spo2"] < 94:
                notes.append(f"نسبة الأكسجين {l['spo2']} %")
            if l["temp"] > 37.8:
                notes.append(f"حرارتك {l['temp']:.1f} درجة")
            if notes:
                lead = "أنا شايف إن " + " و".join(notes) + ". "
        summ = next((v for k, v in AR_SUMMARY.items() if proto["summary"].startswith(k)), proto["summary"])
        return lead + summ + " اتبع الخطوات في الكارت تحت، وأنا هفضل متابع علاماتك الحيوية."
    if proto is GENERIC:
        return ("I could not match that to an onboard protocol. Tell me where it hurts or what you feel, since when, "
                "and how strong it is from 0 to 10. If you feel unsafe, call the Crew Medical Officer now.")
    lead = ""
    if crew:
        l, b = crew["latest"], crew["baseline"]
        notes = []
        if l["hr"] > b["hr"] + 25:
            notes.append(f"your heart rate is {l['hr']:.0f} bpm, about {l['hr'] - b['hr']:.0f} above your normal")
        if l["spo2"] < 94:
            notes.append(f"your blood oxygen is {l['spo2']} %")
        if l["temp"] > 37.8:
            notes.append(f"your temperature is {l['temp']:.1f} °C")
        if notes:
            lead = "I can see " + " and ".join(notes) + ". "
    return lead + proto["summary"] + " Follow the steps on the card below; I will keep watching your vitals."


# ---------------- drug checks ----------------
def check_drugs(names, dose_msv):
    out, seen = [], set()
    meds = pharmacy.list_all(dose_msv)
    for name in names:
        m = pharmacy.find(name, dose_msv)
        key = m["name"] if m else name
        if key in seen:
            continue
        seen.add(key)
        if m is None:
            out.append(dict(name=name, available=False, valid=False, status="not_on_board"))
            continue
        d = dict(id=m["id"], name=m["name"], available=m["qty"] > 0, valid=m["days_left"] >= 0, status=m["status"],
                 qty=m["qty"], effective_expiry=m["effective_expiry"], days_lost_to_radiation=m["days_lost_to_radiation"])
        if not m["usable"]:
            alt = next((x for x in meds if x["usable"] and x["id"] != m["id"]
                        and set(x["used_for"].split()) & set(m["used_for"].split())), None)
            if alt:
                d["alternative"] = dict(id=alt["id"], name=alt["name"])
        out.append(d)
    return out


def drugs_in_text(text, dose_msv):
    t = text.lower()
    out = []
    for m in pharmacy.list_all(dose_msv):
        w = m["name"].lower().split()[0].split("-")[0]
        if (w if w not in ("oral", "artificial", "silver") else m["name"].lower().split(" 1")[0]) in t:
            out.append(m["name"])
    return out


# ---------------- main entry ----------------
def chat_stream(user, crew, risks, mission, message, dose_msv):
    """Yields NDJSON lines: meta (card, drugs, actions), token..., drugs (final check), done."""
    t0 = time.time()
    key = f"{user['id']}:{crew['id'] if crew else 0}"
    hist = HISTORY.setdefault(key, [])
    q = normalize(message)
    ar = is_arabic(message)
    rkeys = risk_question(q)
    proto = None if rkeys else match_protocol(q)
    # vague complaint ("I don't feel well") during a live anomaly: use what the sensors already see
    if proto is None and not rkeys and crew and crew.get("anomaly_vital"):
        hint = {"hr": "heart racing", "spo2": "short of breath", "temp": "fever"}[crew["anomaly_vital"]]
        proto = match_protocol(hint)
    # follow-ups ("it's getting worse") keep the last protocol
    if proto is None and hist and not rkeys:
        proto = next((p for p in PROTOCOLS if p["summary"] == hist[-1].get("protocol")), None)
    knowledge = retrieve(q + " " + (proto["summary"] if proto else ""))
    meds = pharmacy.list_all(dose_msv)

    card = None
    if proto:
        card = dict(summary=proto["summary"], urgency=proto["urgency"], red_flags=proto["red"],
                    steps=[dict(text=s, timer_s=timers(s)) for s in proto["steps"]])
    actions = []
    if proto:
        actions.append(dict(type="procedure", label="Start guided procedure"))
        actions.append(dict(type="recheck", label="Check on me in 15 min", minutes=15))
    actions.append(dict(type="case", label="Send case report to Earth"))
    drugs = check_drugs(proto["drugs"], dose_msv) if proto else []

    engine = engine_name()
    yield json.dumps(dict(type="meta", engine=engine, card=card, drugs=drugs, actions=actions,
                          knowledge=[k[0] for k in knowledge], earth_round_trip_min=round(2 * mission["light_delay_min"], 1))) + "\n"

    system = _system(crew, risks, meds, knowledge, mission, dict(user, _all_risks=bool(rkeys)))
    msgs = [{"role": h["role"], "content": h["content"]} for h in hist[-6:]] + [{"role": "user", "content": message}]
    text = ""
    brains = {"claude": [_claude_stream, _local_stream], "local": [_local_stream], "protocol": []}[engine]
    for brain in brains:
        try:
            for tok in brain(system, msgs):
                text += tok
                yield json.dumps(dict(type="token", text=tok)) + "\n"
            engine = "claude" if brain is _claude_stream else "local"
            break
        except Exception as e:   # link down or model missing: the ship keeps working
            print("assistant: brain failed, falling back:", repr(e))
            if text:
                break
    if not text:
        engine = "protocol"
        text = risk_answer(rkeys, crew, risks, ar) if rkeys and crew else _protocol_text(proto or GENERIC, crew, ar)
        yield json.dumps(dict(type="token", text=text)) + "\n"

    mentioned = drugs_in_text(text, dose_msv)
    if mentioned:
        drugs = check_drugs([d["name"] for d in drugs] + mentioned, dose_msv)
    hist += [dict(role="user", content=message, protocol=proto["summary"] if proto else None),
             dict(role="assistant", content=text, protocol=proto["summary"] if proto else None)]
    yield json.dumps(dict(type="final", engine=engine, drugs=drugs, latency_ms=int((time.time() - t0) * 1000))) + "\n"


def case_report(user, crew, mission, risks):
    """SOAP note for the flight surgeon, built from the conversation and live data."""
    hist = HISTORY.get(f"{user['id']}:{crew['id']}", [])
    said = [h["content"] for h in hist if h["role"] == "user"][-4:]
    proto = next((h["protocol"] for h in reversed(hist) if h.get("protocol")), None)
    l, b = crew["latest"], crew["baseline"]
    high = [f"{r['name']}: {r['value']} {r['unit']} ({r['level']})" for r in risks if r["level"] in ("elevated", "high")]
    return dict(
        S=" / ".join(said) or "No symptoms reported in chat.",
        O=(f"HR {l['hr']:.0f} bpm (resting baseline {b['hr']:.0f}), SpO2 {l['spo2']} %, T {l['temp']:.1f} C, "
           f"sleep {l['sleep_h']} h, health score {crew['health_score']}/100, ML anomaly streak {crew['anomaly_streak'] * 5} min. "
           + ("Long-term: " + "; ".join(high) if high else "")),
        A=proto or "Undifferentiated complaint; onboard assistant guidance only, not a diagnosis.",
        P="Onboard protocol followed; vitals monitored every 5 min; CMO informed. Requesting flight surgeon review.",
    )
