import logging
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / ".env", override=True)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
NORTHFLANK_TOKEN = os.environ.get("NORTHFLANK_TOKEN", "").strip()
NORTHFLANK_PROJECT_ID = os.environ.get("NORTHFLANK_PROJECT_ID", "").strip()
NORTHFLANK_JOB_ID = os.environ.get("NORTHFLANK_JOB_ID", "").strip()
MAX_RUNS_PER_TEAM = int(os.environ.get("MAX_RUNS_PER_TEAM", "5"))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

DB_PATH = Path(__file__).parent / "data" / "runs.db"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gtc-backend")

# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------
for _var_name, _var_val in [
    ("NORTHFLANK_TOKEN", NORTHFLANK_TOKEN),
    ("NORTHFLANK_PROJECT_ID", NORTHFLANK_PROJECT_ID),
    ("NORTHFLANK_JOB_ID", NORTHFLANK_JOB_ID),
]:
    if not _var_val:
        raise RuntimeError(f"Required env var {_var_name} is not set.")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

TEAM_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = _get_db()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                team_name      TEXT NOT NULL,
                nf_run_id      TEXT,
                num_envs       INTEGER,
                max_iterations INTEGER,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _count_runs(team_name: str) -> int:
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM runs WHERE team_name = ?", (team_name,)
        ).fetchone()
        return row["cnt"]
    finally:
        conn.close()


def _insert_run(team_name: str, nf_run_id: str, num_envs: int, max_iterations: int) -> None:
    conn = _get_db()
    try:
        conn.execute(
            "INSERT INTO runs (team_name, nf_run_id, num_envs, max_iterations) VALUES (?, ?, ?, ?)",
            (team_name, nf_run_id, num_envs, max_iterations),
        )
        conn.commit()
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    _init_db()
    yield


app = FastAPI(lifespan=lifespan)

origins = [o.strip() for o in ALLOWED_ORIGINS.split(",")] if ALLOWED_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    team_name: str = Field(..., min_length=1, max_length=64)
    wandb_api_key: str = Field(..., min_length=1)
    num_envs: int = Field(default=1024, ge=1024, le=16384)
    max_iterations: int = Field(default=1200, ge=1000, le=2000)


class RunResponse(BaseModel):
    run_id: str
    team_name: str
    wandb_url: str
    runs_used: int
    runs_remaining: int


class TeamRunsResponse(BaseModel):
    team_name: str
    runs_used: int
    runs_remaining: int
    max_runs: int



# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/runs/{team_name}", response_model=TeamRunsResponse)
async def get_runs(team_name: str):
    team_name = team_name.lower().strip()
    if not TEAM_NAME_RE.match(team_name):
        raise HTTPException(status_code=400, detail="Invalid team name format.")
    used = _count_runs(team_name)
    return TeamRunsResponse(
        team_name=team_name,
        runs_used=used,
        runs_remaining=max(MAX_RUNS_PER_TEAM - used, 0),
        max_runs=MAX_RUNS_PER_TEAM,
    )


@app.post("/run", response_model=RunResponse)
async def create_run(req: RunRequest):
    team_name = req.team_name.lower().strip()
    if not TEAM_NAME_RE.match(team_name):
        raise HTTPException(status_code=400, detail="Invalid team name format.")

    # 1. Check run quota
    used = _count_runs(team_name)
    if used >= MAX_RUNS_PER_TEAM:
        raise HTTPException(status_code=429, detail="This team has used all 5 training runs.")

    wandb_api_key = req.wandb_api_key.strip()
    wandb_auth = ("api", wandb_api_key)

    # 2. Validate API key AND get the user's teams in one query
    #    This is reliable because we check the viewer's OWN teams,
    #    not the entity query which returns data for any name.
    logger.info("Validating W&B credentials for team '%s'...", team_name)
    resp = await httpx.AsyncClient(timeout=15).post(
        "https://api.wandb.ai/graphql",
        auth=wandb_auth,
        json={"query": "{ viewer { id username teams { edges { node { name } } } } }"},
    )
    body = resp.json()
    logger.info("W&B viewer+teams response: %s", body)

    viewer = (body.get("data") or {}).get("viewer") if isinstance(body.get("data"), dict) else None
    if not viewer or not viewer.get("username"):
        logger.warning("FAIL: Invalid API key — viewer: %s", viewer)
        raise HTTPException(
            status_code=401,
            detail="Invalid W&B API key. Get yours at wandb.ai/authorize.",
        )

    username = viewer["username"]
    logger.info("API key valid for user: %s", username)

    # 3. Check team_name is the user's own username OR one of their teams
    team_names = set()
    team_names.add(username)  # personal entity
    for edge in (viewer.get("teams") or {}).get("edges") or []:
        node = edge.get("node") or {}
        if node.get("name"):
            team_names.add(node["name"])

    logger.info("User '%s' has access to entities: %s", username, team_names)

    if team_name not in team_names:
        logger.warning("FAIL: team '%s' not in user's entities: %s", team_name, team_names)
        raise HTTPException(
            status_code=404,
            detail=f"W&B team '{team_name}' not found. Make sure you have access to this team.",
        )
    logger.info("PASS: team '%s' verified for user '%s'", team_name, username)

    # 4. Trigger Northflank job run
    nf_payload = {
        "runtimeEnvironment": {
            "WANDB_API_KEY": wandb_api_key,
            "WANDB_ENTITY": team_name,
            "NUM_ENVS": str(req.num_envs),
            "MAX_ITERATIONS": str(req.max_iterations),
        }
    }
    nf_url = f"https://api.northflank.com/v1/projects/{NORTHFLANK_PROJECT_ID}/jobs/{NORTHFLANK_JOB_ID}/runs"
    logger.info("Northflank URL: %s", nf_url)
    logger.info("Northflank env: %s", {k: (v if k != "WANDB_API_KEY" else "***") for k, v in nf_payload["runtimeEnvironment"].items()})
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                nf_url,
                headers={
                    "Authorization": f"Bearer {NORTHFLANK_TOKEN}",
                    "Content-Type": "application/json",
                },
                json=nf_payload,
            )
            resp.raise_for_status()
            nf_data = resp.json()
        logger.info("Northflank response: %s", nf_data)
        nf_run_id = nf_data.get("data", {}).get("id", "unknown")
    except Exception:
        logger.exception("Northflank run trigger failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to start training job. Please try again.",
        )

    # 5. Record the run
    _insert_run(team_name, nf_run_id, req.num_envs, req.max_iterations)
    used += 1
    logger.info("Run recorded: team=%s, run_id=%s, used=%d", team_name, nf_run_id, used)

    return RunResponse(
        run_id=nf_run_id,
        team_name=team_name,
        wandb_url=f"https://wandb.ai/{team_name}/isaaclab-dexsuite-arm",
        runs_used=used,
        runs_remaining=max(MAX_RUNS_PER_TEAM - used, 0),
    )
