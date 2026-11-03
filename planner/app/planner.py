"""期限の早い在庫から配布を割り当てる（FEFO: First Expired, First Out）と、月次の集計。

今日の日付は必ず外から受け取る。テストではどの日に実行しても同じ結果になる。
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Literal

ExpiryType = Literal["best_before", "use_by"]
Status = Literal["expired", "within3", "within7", "ok"]
MovementKind = Literal["receive", "distribute", "dispose"]


@dataclass(frozen=True)
class Lot:
    id: int
    itemName: str
    category: str
    quantity: int
    expiresOn: date
    expiryType: ExpiryType
    receivedOn: date


@dataclass
class Pick:
    lotId: int
    itemName: str
    category: str
    quantity: int
    expiresOn: str
    daysLeft: int
    reason: str


@dataclass
class Shortage:
    category: str
    needed: int
    available: int
    short: int


@dataclass
class Plan:
    picks: list[Pick] = field(default_factory=list)
    shortages: list[Shortage] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def status(expires_on: date, today: date) -> Status:
    """期限の表示区分：期限切れ・3日以内（今日を含む）・7日以内・余裕あり。"""
    days = (expires_on - today).days
    if days < 0:
        return "expired"
    if days <= 3:
        return "within3"
    if days <= 7:
        return "within7"
    return "ok"


def _eligible(lot: Lot, today: date, include_expired_best_before: bool) -> bool:
    if lot.quantity <= 0:
        return False
    if lot.expiresOn >= today:
        return True
    # 期限切れ：消費期限は絶対に配らない。賞味期限は団体の設定しだい。
    return lot.expiryType == "best_before" and include_expired_best_before


def _reason(days_left: int) -> str:
    if days_left < 0:
        return f"賞味期限を{-days_left}日過ぎています（団体の設定で配布対象）"
    if days_left == 0:
        return "期限は今日です"
    return f"期限まで{days_left}日"


def plan(
    lots: Iterable[Lot],
    households: int,
    per_household: Mapping[str, int],
    today: date,
    include_expired_best_before: bool = False,
) -> Plan:
    lots = list(lots)
    out = Plan()
    for category, per in per_household.items():
        needed = households * per
        if needed <= 0:
            continue
        candidates = sorted(
            (lot for lot in lots if lot.category == category and _eligible(lot, today, include_expired_best_before)),
            key=lambda lot: (lot.expiresOn, lot.receivedOn, lot.id),
        )
        available = sum(lot.quantity for lot in candidates)
        remaining = needed
        for lot in candidates:
            if remaining == 0:
                break
            take = min(lot.quantity, remaining)
            days_left = (lot.expiresOn - today).days
            out.picks.append(
                Pick(lot.id, lot.itemName, category, take, lot.expiresOn.isoformat(), days_left, _reason(days_left))
            )
            remaining -= take
        if remaining > 0:
            out.shortages.append(Shortage(category, needed, available, remaining))
    return out


@dataclass(frozen=True)
class Movement:
    kind: MovementKind
    category: str
    quantity: int
    occurredOn: date


def monthly_report(movements: Iterable[Movement], month: str) -> dict[str, Any]:
    """month は "2026-10" の形。種類ごとに受入・配布・廃棄の個数を数える（種類は最初に出てきた順）。"""
    rows: dict[str, dict[str, Any]] = {}
    total = {"received": 0, "distributed": 0, "disposed": 0}
    column = {"receive": "received", "distribute": "distributed", "dispose": "disposed"}
    for m in movements:
        if m.occurredOn.isoformat()[:7] != month:
            continue
        row = rows.setdefault(m.category, {"category": m.category, "received": 0, "distributed": 0, "disposed": 0})
        row[column[m.kind]] += m.quantity
        total[column[m.kind]] += m.quantity
    return {"month": month, "rows": list(rows.values()), "total": total}
