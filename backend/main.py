import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routers import auth, analyze, garmin

# Configure logging to show application logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

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


@app.get("/{full_path:path}")
async def serve_spa_or_static(full_path: str):
    """
    Serve static files or fallback to index.html for SPA routing.
    This handles both actual files and SPA routes.
    """
    # Try to serve the requested file
    requested_path = PUBLIC_DIR / full_path
    if requested_path.exists() and requested_path.is_file():
        return FileResponse(requested_path)
    
    # If it's a directory, try index.html
    if requested_path.exists() and requested_path.is_dir():
        index_path = requested_path / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
    
    # Otherwise, serve index.html for SPA routing
    index_path = PUBLIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    
    return {"error": "Not found"}
