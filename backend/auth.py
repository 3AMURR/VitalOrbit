"""Demo identities and roles. PINs are demo-only values, shown on the login screen on purpose.

Roles
- astronaut: sees only their own health data, check-ins, assistant and private line to the flight surgeon
- cmo:       Crew Medical Officer (also an astronaut): sees the whole crew, alerts, pharmacy, cases
- surgeon:   Flight Surgeon at Mission Control on Earth: sees everything, but only after the light-time delay
"""
from __future__ import annotations

import secrets

from fastapi import Header, HTTPException

USERS = {
    "sara": dict(id="sara", name="Sara Haddad", title="Commander", role="astronaut", crew_id=1, pin="1111"),
    "lucas": dict(id="lucas", name="Lucas Meyer", title="Flight Engineer", role="astronaut", crew_id=2, pin="2222"),
    "amina": dict(id="amina", name="Amina Okafor", title="Crew Medical Officer", role="cmo", crew_id=3, pin="3333"),
    "kenji": dict(id="kenji", name="Kenji Watanabe", title="Mission Specialist", role="astronaut", crew_id=4, pin="4444"),
    "mansour": dict(id="mansour", name="Dr. Layla Mansour", title="Flight Surgeon · Mission Control", role="surgeon",
                    crew_id=None, pin="9999"),
}
TOKENS: dict[str, str] = {}


def public(u):
    return {k: v for k, v in u.items() if k != "pin"}


def login(user_id: str, pin: str):
    u = USERS.get(user_id)
    if not u or u["pin"] != pin:
        raise HTTPException(401, "Wrong crew ID or PIN")
    tok = secrets.token_urlsafe(24)
    TOKENS[tok] = user_id
    return dict(token=tok, user=public(u))


def current(authorization: str = Header(default="")):
    tok = authorization.removeprefix("Bearer ").strip()
    if tok not in TOKENS:
        raise HTTPException(401, "Please log in")
    return USERS[TOKENS[tok]]


def can_see(user, crew_id: int) -> bool:
    return user["role"] in ("cmo", "surgeon") or user["crew_id"] == crew_id


def require_crew(user, crew_id: int):
    if not can_see(user, crew_id):
        raise HTTPException(403, "Medical data is private to each astronaut, the CMO and the flight surgeon")
