"""contract/cases.json の共通ケース。TypeScript 側（web）も同じファイルで確かめる。"""

import json
from datetime import date
from pathlib import Path

import pytest

from app.planner import Lot, Movement, monthly_report, plan, status

CASES = json.loads((Path(__file__).resolve().parents[2] / "contract" / "cases.json").read_text(encoding="utf-8"))


def _lot(d: dict) -> Lot:
    return Lot(
        **{**d, "expiresOn": date.fromisoformat(d["expiresOn"]), "receivedOn": date.fromisoformat(d["receivedOn"])}
    )


@pytest.mark.parametrize("case", CASES["status"], ids=lambda c: c["name"])
def test_status(case):
    assert status(date.fromisoformat(case["expiresOn"]), date.fromisoformat(case["today"])) == case["expected"]


@pytest.mark.parametrize("case", CASES["plan"], ids=lambda c: c["name"])
def test_plan(case):
    result = plan(
        [_lot(d) for d in case["lots"]],
        case["households"],
        case["perHousehold"],
        date.fromisoformat(case["today"]),
        case["includeExpiredBestBefore"],
    )
    assert result.to_dict() == case["expected"]


@pytest.mark.parametrize("case", CASES["report"], ids=lambda c: c["name"])
def test_report(case):
    movements = [Movement(**{**m, "occurredOn": date.fromisoformat(m["occurredOn"])}) for m in case["movements"]]
    assert monthly_report(movements, case["month"]) == case["expected"]
