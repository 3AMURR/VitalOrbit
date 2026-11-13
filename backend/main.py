"""VitalOrbit API. Run: ./run.sh  then open http://localhost:8000"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import assistant, auth, pharmacy, ridge
from .engine import SCENARIOS, Mission

mission: Mission | None = None
SPEED = {"seconds_per_reading": 1.0, "paused": False}
User = Depends(auth.current)


def _seed(m: Mission):
    """Check-in history before today (simulated) and empty medication log."""
    rng = np.random.default_rng(3)
    m.checkins = {}
    for a in m.crew.values():
        mood, stress = ridge.MOOD[a.id]
        m.checkins[a.id] = [dict(day=int(m.day) - 14 + i, mood=int(np.clip(round(rng.normal(mood, 0.6)), 1, 5)),
                                 stress=int(np.clip(round(rng.normal(stress, 0.6)), 1, 5)),
                                 sleep_quality=int(np.clip(round(rng.normal(3.6, 0.7)), 1, 5)), symptoms=[], note="",
                                 source="simulated") for i in range(14)]
    m.medlog = []


async def _loop():
    while True:
        await asyncio.sleep(SPEED["seconds_per_reading"])
        if not SPEED["paused"]:
            await asyncio.to_thread(mission.tick)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mission
    pharmacy.init()
    mission = await asyncio.to_thread(Mission)
    _seed(mission)
    task = asyncio.create_task(_loop())
    yield
    task.cancel()


app = FastAPI(title="VitalOrbit", lifespan=lifespan)


@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def delay_for(u):
    return mission.light_delay_min() if u["role"] == "surgeon" else 0


def visible_ids(u):
    return [c for c in mission.crew] if u["role"] in ("cmo", "surgeon") else [u["crew_id"]]


# ---------------- auth ----------------
class Login(BaseModel):
    user_id: str
    pin: str


@app.get("/api/users")
def users():
    """Login screen roster (demo PINs are shown on purpose)."""
    return [dict(auth.public(u), demo_pin=u["pin"]) for u in auth.USERS.values()]


@app.post("/api/login")
def login(body: Login):
    return auth.login(body.user_id, body.pin)


@app.get("/api/me")
def me(u=User):
    return auth.public(u)


# ---------------- mission + crew ----------------
@app.get("/api/mission")
def get_mission(u=User):
    return dict(mission.mission_view(), paused=SPEED["paused"], viewer_delay_min=delay_for(u))


@app.get("/api/crew")
def get_crew(u=User):
    return [c for c in mission.all_crew(delay_for(u)) if c["id"] in visible_ids(u)]


@app.get("/api/crew/{cid}")
def get_one(cid: int, u=User):
    auth.require_crew(u, cid)
    return mission.one(cid, delay_for(u))


@app.get("/api/crew/{cid}/vitals")
def get_vitals(cid: int, hours: int = 24, u=User):
    auth.require_crew(u, cid)
    return mission.vitals(cid, min(hours, 24 * 7), delay_for(u))


@app.get("/api/crew/{cid}/risks")
def get_risks(cid: int, u=User):
    auth.require_crew(u, cid)
    return ridge.risks(mission.crew[cid], mission)


@app.get("/api/crew/{cid}/model")
def get_model(cid: int, u=User):
    auth.require_crew(u, cid)
    return mission.model_card(cid)


@app.get("/api/_wait")
async def _wait(ms: int = 6000):
    """Screenshot helper: an image that loads slowly, so headless browsers capture after the app has rendered data."""
    from fastapi.responses import Response
    await asyncio.sleep(min(ms, 20000) / 1000)
    gif = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
    return Response(gif, media_type="image/gif")


@app.get("/api/ml/evaluation")
def ml_evaluation(u=User):
    """Results of scripts/evaluate_ml.py on the real wearable streams."""
    f = Path(__file__).parent.parent / "data" / "ml_evaluation.json"
    return __import__("json").loads(f.read_text()) if f.exists() else {}


@app.get("/api/alerts")
def get_alerts(u=User, limit: int = 40):
    ids, out = visible_ids(u), []
    for al in reversed(mission.alerts):
        if al["crew_id"] is not None and al["crew_id"] not in ids:
            continue
        if u["role"] == "surgeon" and al["ts"] + mission.light_delay_min() > mission.met:
            continue
        out.append(al)
    return out[:limit]


@app.post("/api/alerts/{aid}/ack")
def ack(aid: int, u=User):
    mission.ack(aid)
    return {"ok": True}


# ---------------- proactive prompts + check-ins ----------------
@app.get("/api/prompts")
def prompts(u=User):
    return [p for p in mission.prompts if p["open"] and p["ts"] <= mission.met and p["crew_id"] == u["crew_id"]]


class PromptAnswer(BaseModel):
    feeling: str
    note: str = ""


@app.post("/api/prompts/{pid}")
def answer_prompt(pid: int, body: PromptAnswer, u=User):
    return mission.respond_prompt(pid, body.feeling, body.note)


class CheckIn(BaseModel):
    mood: int
    stress: int
    sleep_quality: int
    symptoms: list[str] = []
    note: str = ""


@app.get("/api/checkins/{cid}")
def get_checkins(cid: int, u=User):
    auth.require_crew(u, cid)
    return mission.checkins[cid][-14:]


@app.post("/api/checkins")
def post_checkin(body: CheckIn, u=User):
    if not u["crew_id"]:
        raise HTTPException(400, "Only crew members check in")
    entry = dict(body.model_dump(), day=int(mission.day), source="crew")
    log = mission.checkins[u["crew_id"]]
    log[:] = [c for c in log if c["day"] != entry["day"]] + [entry]
    if body.mood <= 2 or body.stress >= 4:
        mission.downlink(u["id"], "checkin", f"{u['name']}: low mood or high stress in daily check-in",
                         f"Mood {body.mood}/5, stress {body.stress}/5.", crew_id=u["crew_id"], private=True)
    return entry


# ---------------- pharmacy ----------------
class Med(BaseModel):
    name: str
    category: str = ""
    form: str = ""
    qty: int = 0
    min_qty: int = 0
    expiry: str
    radiation_factor: float = 0.3
    used_for: str = ""


def _cmo(u):
    if u["role"] != "cmo":
        raise HTTPException(403, "Only the Crew Medical Officer manages the pharmacy")


@app.get("/api/inventory")
def inventory(u=User):
    return pharmacy.list_all(mission.dose())


@app.post("/api/inventory")
def add_med(m: Med, u=User):
    _cmo(u)
    return pharmacy.get(pharmacy.upsert(m.model_dump()), mission.dose())


@app.put("/api/inventory/{mid}")
def edit_med(mid: int, m: Med, u=User):
    _cmo(u)
    return pharmacy.get(pharmacy.upsert(m.model_dump(), mid), mission.dose())


@app.delete("/api/inventory/{mid}")
def del_med(mid: int, u=User):
    _cmo(u)
    pharmacy.delete(mid)
    return {"ok": True}


class Dispense(BaseModel):
    crew_id: int
    n: int = 1


@app.post("/api/inventory/{mid}/dispense")
def dispense(mid: int, body: Dispense, u=User):
    auth.require_crew(u, body.crew_id)
    if u["role"] == "surgeon":
        raise HTTPException(403, "Earth cannot dispense onboard medicine")
    m = pharmacy.get(mid, mission.dose())
    if not m or not m["usable"]:
        raise HTTPException(400, "This medicine is not usable (out of stock or expired)")
    pharmacy.dispense(mid, body.n)
    mission.medlog.append(dict(crew_id=body.crew_id, med=m["name"], n=body.n, ts=mission.met, by=u["name"]))
    return pharmacy.get(mid, mission.dose())


@app.get("/api/medlog/{cid}")
def medlog(cid: int, u=User):
    auth.require_crew(u, cid)
    return [x for x in reversed(mission.medlog) if x["crew_id"] == cid]


# ---------------- assistant ----------------
class Chat(BaseModel):
    message: str
    crew_id: int | None = None


@app.get("/api/assistant/status")
def assistant_status(u=User):
    return assistant.status()


@app.post("/api/chat")
def chat(body: Chat, u=User):
    cid = body.crew_id if u["role"] in ("cmo", "surgeon") and body.crew_id else u["crew_id"]
    crew = mission.one(cid, delay_for(u)) if cid else None
    risks = ridge.risks(mission.crew[cid], mission) if cid else []
    gen = assistant.chat_stream(u, crew, risks, mission.mission_view(), body.message, mission.dose())
    return StreamingResponse(gen, media_type="application/x-ndjson")


@app.post("/api/chat/reset")
def chat_reset(u=User):
    for k in [k for k in assistant.HISTORY if k.startswith(u["id"] + ":")]:
        del assistant.HISTORY[k]
    return {"ok": True}


class Recheck(BaseModel):
    minutes: int = 15
    crew_id: int | None = None


@app.post("/api/recheck")
def recheck(body: Recheck, u=User):
    cid = body.crew_id or u["crew_id"]
    auth.require_crew(u, cid)
    mission.prompts.append(dict(id=mission._id(), crew_id=cid, alert_id=None, ts=mission.met + body.minutes, open=True,
                                text=f"Recheck after {body.minutes} minutes: how do you feel now?"))
    return {"ok": True, "due": mission.met + body.minutes}


class Case(BaseModel):
    crew_id: int | None = None
    private: bool = False


@app.post("/api/cases")
def send_case(body: Case, u=User):
    cid = body.crew_id or u["crew_id"]
    auth.require_crew(u, cid)
    crew = mission.one(cid)
    soap = assistant.case_report(u, crew, mission, ridge.risks(mission.crew[cid], mission))
    msg = mission.downlink(u["id"], "case", f"Case report: {crew['name']}", soap["A"], crew_id=cid,
                           private=body.private, data=soap)
    return msg


class Emergency(BaseModel):
    crew_id: int | None = None
    note: str = ""


@app.post("/api/emergency")
def emergency(body: Emergency, u=User):
    """One tap: critical alert to the whole crew + priority downlink to the flight surgeon."""
    cid = body.crew_id or u["crew_id"]
    who = mission.crew[cid].cfg["name"] if cid else "a crew member"
    with mission.lock:
        al = dict(id=mission._id(), crew_id=cid, severity="critical", vital="emergency", value=None, baseline=None,
                  message=f"MEDICAL EMERGENCY declared by {u['name']}" + (f" for {who}" if cid != u["crew_id"] else ""), ts=mission.met, acknowledged=False,
                  crew_feedback=None)
        mission.alerts.append(al)
    mission.downlink(u["id"], "alert", al["message"], body.note or "Priority: crew is running the emergency protocol.",
                     crew_id=cid, ref=al["id"])
    return al


# ---------------- comms with Earth ----------------
class Msg(BaseModel):
    subject: str
    body: str
    crew_id: int | None = None
    private: bool = False


def _msg_visible(m, u):
    if m["private"]:
        return u["role"] == "surgeon" or (m["crew_id"] is not None and m["crew_id"] == u["crew_id"])
    if u["role"] == "astronaut":
        return m["crew_id"] in (None, u["crew_id"])
    return True


@app.get("/api/comms")
def comms(u=User):
    out = []
    side = "earth" if u["role"] == "surgeon" else "ship"
    for m in reversed(mission.messages):
        if not _msg_visible(m, u):
            continue
        arrived = m["arrive"] is not None and m["arrive"] <= mission.met
        if m["to"] == side and not arrived:
            continue            # still travelling at the speed of light
        state = "delivered" if arrived else ("queued (blackout)" if m["arrive"] is None else "in flight")
        out.append(dict(m, state=state, outgoing=m["to"] != side))
    return out[:60]


@app.post("/api/comms")
def send_msg(body: Msg, u=User):
    cid = body.crew_id if u["role"] != "astronaut" else u["crew_id"]
    if u["role"] == "surgeon":
        return mission.uplink(u["id"], "message", body.subject, body.body, crew_id=cid, private=body.private)
    return mission.downlink(u["id"], "message", body.subject, body.body, crew_id=cid, private=body.private)


# ---------------- demo controls ----------------
class Inject(BaseModel):
    crew_id: int
    type: str


@app.post("/api/demo/inject")
def inject(body: Inject, u=User):
    if body.type not in SCENARIOS:
        raise HTTPException(400, f"type must be one of {list(SCENARIOS)}")
    mission.inject(body.crew_id, body.type)
    return {"ok": True}


@app.post("/api/demo/resolve/{cid}")
def resolve(cid: int, u=User):
    mission.resolve(cid)
    return {"ok": True}


@app.post("/api/demo/solar-storm")
def storm(u=User):
    mission.solar_storm()
    return {"ok": True}


@app.post("/api/demo/blackout")
def blackout(on: bool, u=User):
    mission.set_blackout(on)
    return {"ok": True}


@app.post("/api/demo/speed")
def speed(seconds_per_reading: float | None = None, paused: bool | None = None, u=User):
    if seconds_per_reading:
        SPEED["seconds_per_reading"] = max(0.1, min(60.0, seconds_per_reading))
    if paused is not None:
        SPEED["paused"] = paused
    return SPEED


@app.post("/api/demo/reset")
async def reset(u=User):
    global mission
    pharmacy.reset()
    m = await asyncio.to_thread(Mission)
    _seed(m)
    mission = m
    assistant.HISTORY.clear()
    return {"ok": True}


app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True), name="frontend")
