import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import auth, analyze, garmin

TOKEN_DIR = Path("/root/.garminconnect")
PUBLIC_DIR = Path(__file__).parent.parent / "public"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise mutable app state
    app.state.garmin_client = None
    app.state.pending_login = None

    # Try to restore a previous Garmin session from the persisted token store
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    config_path = TOKEN_DIR / "config.json"
    if config_path.exists():
        import json

        cfg = json.loads(config_path.read_text())
        email = cfg.get("email", "")
        if email:
            try:
                from garminconnect import Garmin

                client = Garmin(email, "")
                client.login(str(TOKEN_DIR))
                app.state.garmin_client = client
            except Exception:
                # Tokens stale or absent — user must re-login via the PWA
                pass

    yield


app = FastAPI(title="Nutrition Label → Garmin", lifespan=lifespan)

# CORS — accept origins configured via env var (default: all, suitable for LAN use)
raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
if raw_origins == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(analyze.router, prefix="/api", tags=["analyze"])
app.include_router(garmin.router, prefix="/api/garmin", tags=["garmin"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve the PWA — must be last so API routes take precedence
if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="static")
