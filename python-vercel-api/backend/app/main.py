from __future__ import annotations

import os
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from backend.app.train_models import (
    PROJECTION_END_YEAR,
    compare_temperature_scenarios,
    simulate_temperature_scenario,
)


def _cors_allow_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOW_ORIGINS", "")
    if not configured.strip():
        return ["*"]

    origins: list[str] = []
    for origin in configured.split(","):
        cleaned = origin.strip().rstrip("/")
        if cleaned:
            origins.append(cleaned)
    return origins or ["*"]


app = FastAPI(title="Climate Scenario API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScenarioRequest(BaseModel):
    target_year: int = Field(..., gt=2020, le=PROJECTION_END_YEAR)
    simulations: int = Field(1000, ge=25, le=10000)
    co2_modifier: float = Field(0.0, ge=-100.0, le=200.0)
    forest_loss_modifier: float = Field(0.0, ge=-100.0, le=200.0)
    renewables_modifier: float = Field(0.0, ge=-100.0, le=200.0)
    seed: int = Field(42, ge=0, le=2_147_483_647)


class ScenarioModifiers(BaseModel):
    co2: float = Field(0.0, ge=-100.0, le=200.0)
    forest_loss: float = Field(0.0, ge=-100.0, le=200.0)
    renewables: float = Field(0.0, ge=-100.0, le=200.0)


class ComparisonRequest(BaseModel):
    target_year: int = Field(..., gt=2020, le=PROJECTION_END_YEAR)
    scenario_modifiers: ScenarioModifiers = Field(default_factory=ScenarioModifiers)
    simulations: int | None = Field(default=None, ge=25, le=10000)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)


@app.get("/")
def root() -> dict[str, object]:
    return {
        "name": "Climate Scenario API",
        "health_path": "/health",
        "simulate_path": "/simulate",
        "compare_path": "/compare",
        "allowed_origins": _cors_allow_origins(),
    }


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/simulate")
def simulate(request: ScenarioRequest) -> dict[str, object]:
    try:
        return simulate_temperature_scenario(
            target_year=request.target_year,
            simulations=request.simulations,
            co2_modifier=request.co2_modifier,
            forest_loss_modifier=request.forest_loss_modifier,
            renewables_modifier=request.renewables_modifier,
            seed=request.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/compare")
def compare(request: ComparisonRequest) -> dict[str, object]:
    try:
        return compare_temperature_scenarios(
            target_year=request.target_year,
            co2_modifier=request.scenario_modifiers.co2,
            forest_loss_modifier=request.scenario_modifiers.forest_loss,
            renewables_modifier=request.scenario_modifiers.renewables,
            simulations=request.simulations or 1000,
            seed=request.seed or 42,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
