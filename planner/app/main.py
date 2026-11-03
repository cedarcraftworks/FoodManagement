"""計算サービス（Python / FastAPI）。Java の API からだけ呼ばれる、内部向けのサービス。"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .planner import Lot, Movement, monthly_report, plan

app = FastAPI(title="FoodManagement planner", version="1.0.0")


class LotIn(BaseModel):
    id: int
    itemName: str
    category: str
    quantity: int = Field(ge=0)
    expiresOn: date
    expiryType: Literal["best_before", "use_by"]
    receivedOn: date


class PlanRequest(BaseModel):
    today: date
    households: int = Field(ge=1, le=10_000)
    perHousehold: dict[str, int]
    includeExpiredBestBefore: bool = False
    lots: list[LotIn]


class MovementIn(BaseModel):
    kind: Literal["receive", "distribute", "dispose"]
    category: str
    quantity: int = Field(ge=0)
    occurredOn: date


class ReportRequest(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    movements: list[MovementIn]


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/plan")
def post_plan(req: PlanRequest) -> dict[str, Any]:
    lots = [Lot(**lot.model_dump()) for lot in req.lots]
    return plan(lots, req.households, req.perHousehold, req.today, req.includeExpiredBestBefore).to_dict()


@app.post("/report")
def post_report(req: ReportRequest) -> dict[str, Any]:
    movements = [Movement(**m.model_dump()) for m in req.movements]
    return monthly_report(movements, req.month)
