"""
Garmin Connect authentication router.

Login flow:
  1. POST /api/auth/login  { email, password }
     → returns { status: "success" } or { status: "mfa_required" }
  2. POST /api/auth/mfa    { code }         (only when MFA is required)
     → returns { status: "success" }

The python-garminconnect login() call is blocking and runs in a daemon thread.
A threading.Event bridges the async web handler with the MFA callback inside
that thread.
"""

import asyncio
import json
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from garminconnect import Garmin
from pydantic import BaseModel, EmailStr

TOKEN_DIR = Path("/root/.garminconnect")
CONFIG_FILE = TOKEN_DIR / "config.json"

router = APIRouter()


# ---------------------------------------------------------------------------
# Internal login session — one at a time
# ---------------------------------------------------------------------------


class _LoginSession:
    """Carries state across the two HTTP calls needed for an MFA login."""

    def __init__(self) -> None:
        self._mfa_ready = threading.Event()
        self._done = threading.Event()
        self._mfa_code: str | None = None
        self.needs_mfa = False
        self.success = False
        self.error: str | None = None
        self.client: Garmin | None = None

    # Called from the login thread when Garmin requests a code
    def _prompt_mfa(self) -> str:
        self.needs_mfa = True
        self._mfa_ready.wait()  # blocks until provide_mfa() is called
        return self._mfa_code or ""

    def provide_mfa(self, code: str) -> None:
        self._mfa_code = code
        self._mfa_ready.set()


def _run_login(session: _LoginSession, email: str, password: str) -> None:
    """Runs in a daemon thread — may block on MFA prompt."""
    try:
        TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        client = Garmin(email, password, prompt_mfa=session._prompt_mfa)
        client.login(str(TOKEN_DIR))
        session.client = client
        session.success = True
        # Persist the email so the server can restore the session after a restart
        CONFIG_FILE.write_text(json.dumps({"email": email}))
    except Exception as exc:
        session.error = str(exc)
    finally:
        session._done.set()


async def _wait_for(session: _LoginSession, timeout_s: float = 30.0) -> None:
    """Await up to *timeout_s* for the login thread to finish or request MFA."""
    elapsed = 0.0
    while elapsed < timeout_s:
        if session._done.is_set() or session.needs_mfa:
            return
        await asyncio.sleep(0.1)
        elapsed += 0.1


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class MFARequest(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/status")
async def status(request: Request):
    """Return whether the server currently holds a valid Garmin session."""
    return {"authenticated": request.app.state.garmin_client is not None}


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    # Cancel any stale pending session
    request.app.state.pending_login = None

    session = _LoginSession()
    request.app.state.pending_login = session

    thread = threading.Thread(
        target=_run_login,
        args=(session, body.email, body.password),
        daemon=True,
    )
    thread.start()

    await _wait_for(session)

    if session.needs_mfa and not session._done.is_set():
        return {"status": "mfa_required"}

    if session.success and session.client:
        request.app.state.garmin_client = session.client
        request.app.state.pending_login = None
        return {"status": "success"}

    request.app.state.pending_login = None
    raise HTTPException(status_code=401, detail=session.error or "Login failed")


@router.post("/mfa")
async def mfa(body: MFARequest, request: Request):
    session: _LoginSession | None = request.app.state.pending_login
    if session is None or not session.needs_mfa:
        raise HTTPException(status_code=400, detail="No pending MFA challenge")

    session.provide_mfa(body.code)

    await _wait_for(session)

    if session.success and session.client:
        request.app.state.garmin_client = session.client
        request.app.state.pending_login = None
        return {"status": "success"}

    request.app.state.pending_login = None
    raise HTTPException(status_code=401, detail=session.error or "MFA login failed")


@router.post("/logout")
async def logout(request: Request):
    client: Garmin | None = request.app.state.garmin_client
    if client:
        try:
            client.logout(str(TOKEN_DIR))
        except Exception:
            pass
    request.app.state.garmin_client = None
    request.app.state.pending_login = None
    # Remove persisted config so the server won't auto-restore on restart
    if CONFIG_FILE.exists():
        CONFIG_FILE.unlink()
    return {"status": "logged_out"}
