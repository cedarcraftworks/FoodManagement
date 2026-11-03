from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

LOT = {
    "id": 1,
    "itemName": "サバ缶",
    "category": "canned",
    "quantity": 3,
    "expiresOn": "2026-11-05",
    "expiryType": "best_before",
    "receivedOn": "2026-10-01",
}


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}


def test_plan_endpoint():
    res = client.post(
        "/plan",
        json={"today": "2026-11-01", "households": 2, "perHousehold": {"canned": 2}, "lots": [LOT]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["picks"] == [
        {
            "lotId": 1,
            "itemName": "サバ缶",
            "category": "canned",
            "quantity": 3,
            "expiresOn": "2026-11-05",
            "daysLeft": 4,
            "reason": "期限まで4日",
        }
    ]
    assert body["shortages"] == [{"category": "canned", "needed": 4, "available": 3, "short": 1}]


def test_report_endpoint():
    res = client.post(
        "/report",
        json={
            "month": "2026-10",
            "movements": [{"kind": "receive", "category": "canned", "quantity": 5, "occurredOn": "2026-10-03"}],
        },
    )
    assert res.json()["total"] == {"received": 5, "distributed": 0, "disposed": 0}


def test_rejects_invalid_input():
    assert (
        client.post("/plan", json={"today": "2026-11-01", "households": 0, "perHousehold": {}, "lots": []}).status_code
        == 422
    )
    assert client.post("/report", json={"month": "2026/10", "movements": []}).status_code == 422
    bad_lot = {**LOT, "expiryType": "maybe"}
    res = client.post("/plan", json={"today": "2026-11-01", "households": 1, "perHousehold": {}, "lots": [bad_lot]})
    assert res.status_code == 422
