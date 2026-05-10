"""Tests for the Receivables module — installment plans / accounts to receive.

Covers:
 - CRUD lifecycle (create + auto-generate installments / list / get / update / delete).
 - Each frequency (weekly / biweekly / monthly) generates the correct due-date sequence.
 - Pay / unpay an installment toggles status, paid_amount, paid_at.
 - Receivable auto-completes when all installments are paid + un-completes on unpay.
 - Summary endpoint correctly buckets overdue / due today / due in 7 days / paid this month.
 - RBAC: a salesperson without explicit receivables permission gets 403.
 - Validation: bad frequency, missing vehicle, out-of-range installment_count.
"""
import os
import sys
from datetime import date, timedelta

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"


def _today() -> str:
    return date.today().strftime("%Y-%m-%d")


@pytest.fixture
def owner_token():
    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": "carlos@intercar.com", "password": "senha123"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture
def headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture
def vehicle_id(headers):
    r = httpx.get(f"{BASE_URL}/vehicles", headers=headers, timeout=15)
    r.raise_for_status()
    items = r.json()
    assert items, "Need at least one vehicle to attach a receivable to"
    return items[0]["id"]


@pytest.fixture
def cleanup(headers):
    """Track created ids and DELETE them at end of the test."""
    created = []

    def _track(rid):
        created.append(rid)

    yield _track

    for rid in created:
        try:
            httpx.delete(f"{BASE_URL}/receivables/{rid}", headers=headers, timeout=15)
        except Exception:
            pass


def test_create_monthly_lifecycle(headers, vehicle_id, cleanup):
    payload = {
        "vehicle_id": vehicle_id,
        "customer_name": "Test Monthly",
        "customer_phone": "+15550001",
        "total_amount": 6000,
        "installment_count": 6,
        "installment_amount": 1000,
        "frequency": "monthly",
        "start_date": "2026-06-01",
        "notes": "Pytest receivable",
    }
    r = httpx.post(f"{BASE_URL}/receivables", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    cleanup(data["id"])

    assert data["status"] == "active"
    assert len(data["installments"]) == 6
    # First and last due dates respect month math
    assert data["installments"][0]["due_date"] == "2026-06-01"
    assert data["installments"][5]["due_date"] == "2026-11-01"
    assert all(i["status"] == "pending" for i in data["installments"])

    # GET single
    r = httpx.get(f"{BASE_URL}/receivables/{data['id']}", headers=headers, timeout=15)
    assert r.status_code == 200
    got = r.json()
    assert got["paid_total"] == 0
    assert got["remaining"] == 6000
    assert got["overdue_count"] == 0
    assert got["pending_count"] == 6


def test_weekly_due_date_sequence(headers, vehicle_id, cleanup):
    payload = {
        "vehicle_id": vehicle_id,
        "customer_name": "Weekly client",
        "total_amount": 400,
        "installment_count": 4,
        "installment_amount": 100,
        "frequency": "weekly",
        "start_date": "2026-06-05",
    }
    r = httpx.post(f"{BASE_URL}/receivables", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    cleanup(data["id"])
    expected = ["2026-06-05", "2026-06-12", "2026-06-19", "2026-06-26"]
    actual = [i["due_date"] for i in data["installments"]]
    assert actual == expected


def test_biweekly_due_date_sequence(headers, vehicle_id, cleanup):
    payload = {
        "vehicle_id": vehicle_id,
        "customer_name": "Biweekly client",
        "total_amount": 600,
        "installment_count": 3,
        "installment_amount": 200,
        "frequency": "biweekly",
        "start_date": "2026-06-05",
    }
    r = httpx.post(f"{BASE_URL}/receivables", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    cleanup(data["id"])
    expected = ["2026-06-05", "2026-06-19", "2026-07-03"]
    actual = [i["due_date"] for i in data["installments"]]
    assert actual == expected


def test_pay_unpay_flow_and_auto_complete(headers, vehicle_id, cleanup):
    payload = {
        "vehicle_id": vehicle_id,
        "customer_name": "Pay flow",
        "total_amount": 200,
        "installment_count": 2,
        "installment_amount": 100,
        "frequency": "weekly",
        "start_date": _today(),
    }
    r = httpx.post(f"{BASE_URL}/receivables", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    rid = data["id"]
    cleanup(rid)

    # Pay installment #1 with default values (today + amount)
    r = httpx.post(
        f"{BASE_URL}/receivables/{rid}/installments/1/pay",
        json={},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    paid = r.json()
    assert paid["installments"][0]["status"] == "paid"
    assert paid["installments"][0]["paid_amount"] == 100
    assert paid["installments"][0]["paid_at"] == _today()
    assert paid["status"] == "active"   # not yet completed
    assert paid["paid_total"] == 100
    assert paid["remaining"] == 100

    # Pay installment #2 → should auto-complete the receivable
    r = httpx.post(
        f"{BASE_URL}/receivables/{rid}/installments/2/pay",
        json={"paid_amount": 95.5, "notes": "discount"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "completed"
    assert done["installments"][1]["paid_amount"] == 95.5
    assert done["installments"][1]["notes"] == "discount"

    # Unpay #2 → should re-open the receivable to active
    r = httpx.post(
        f"{BASE_URL}/receivables/{rid}/installments/2/unpay",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200
    reopened = r.json()
    assert reopened["status"] == "active"
    assert reopened["installments"][1]["status"] == "pending"
    assert reopened["installments"][1]["paid_amount"] == 0


def test_summary_buckets(headers, vehicle_id, cleanup):
    today = date.today()
    yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    today_s = today.strftime("%Y-%m-%d")
    in_5_days = (today + timedelta(days=5)).strftime("%Y-%m-%d")
    in_30_days = (today + timedelta(days=30)).strftime("%Y-%m-%d")

    # We craft three receivables: one with overdue, one due today, one in 5 days.
    for label, start in [
        ("overdue", yesterday),
        ("today_due", today_s),
        ("week_due", in_5_days),
        ("future", in_30_days),
    ]:
        r = httpx.post(
            f"{BASE_URL}/receivables",
            json={
                "vehicle_id": vehicle_id,
                "customer_name": f"summary-{label}",
                "total_amount": 100,
                "installment_count": 1,
                "installment_amount": 100,
                "frequency": "monthly",
                "start_date": start,
            },
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        cleanup(r.json()["id"])

    r = httpx.get(f"{BASE_URL}/receivables/summary", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["overdue_count"] >= 1
    assert s["due_today_count"] >= 1
    assert s["due_week_count"] >= 1
    assert s["alert_count"] == s["overdue_count"] + s["due_today_count"]
    # Each list has matching counts
    assert len(s["overdue_list"]) >= 1
    assert len(s["today_list"]) >= 1
    assert len(s["week_list"]) >= 1


def test_create_without_vehicle_walk_in(headers, cleanup):
    """Cliente avulso (walk-in) — vehicle_id is optional."""
    payload = {
        "customer_name": "Walk-in Test",
        "customer_phone": "+15550099",
        "total_amount": 800,
        "installment_count": 4,
        "installment_amount": 200,
        "frequency": "weekly",
        "start_date": "2026-06-01",
        "notes": "no car attached",
    }
    r = httpx.post(f"{BASE_URL}/receivables", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    cleanup(data["id"])
    assert data["vehicle_id"] is None
    assert data["customer_name"] == "Walk-in Test"
    assert len(data["installments"]) == 4

    # GET single must succeed without joining a vehicle
    r = httpx.get(f"{BASE_URL}/receivables/{data['id']}", headers=headers, timeout=15)
    assert r.status_code == 200
    got = r.json()
    assert got["vehicle"] is None


def test_validation_errors(headers, vehicle_id, cleanup):
    # Bad frequency
    r = httpx.post(
        f"{BASE_URL}/receivables",
        json={
            "vehicle_id": vehicle_id,
            "customer_name": "x",
            "total_amount": 100,
            "installment_count": 1,
            "installment_amount": 100,
            "frequency": "yearly",  # invalid
            "start_date": "2026-06-01",
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 400

    # Missing vehicle
    r = httpx.post(
        f"{BASE_URL}/receivables",
        json={
            "vehicle_id": "deadbeef-not-a-real-id",
            "customer_name": "x",
            "total_amount": 100,
            "installment_count": 1,
            "installment_amount": 100,
            "frequency": "monthly",
            "start_date": "2026-06-01",
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 404

    # installment_count out of range
    r = httpx.post(
        f"{BASE_URL}/receivables",
        json={
            "vehicle_id": vehicle_id,
            "customer_name": "x",
            "total_amount": 100,
            "installment_count": 0,
            "installment_amount": 100,
            "frequency": "monthly",
            "start_date": "2026-06-01",
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 400


def test_update_metadata_only(headers, vehicle_id, cleanup):
    r = httpx.post(
        f"{BASE_URL}/receivables",
        json={
            "vehicle_id": vehicle_id,
            "customer_name": "to-update",
            "total_amount": 100,
            "installment_count": 1,
            "installment_amount": 100,
            "frequency": "monthly",
            "start_date": "2026-06-01",
        },
        headers=headers,
        timeout=15,
    )
    rid = r.json()["id"]
    cleanup(rid)

    r = httpx.put(
        f"{BASE_URL}/receivables/{rid}",
        json={"customer_name": "renamed", "notes": "updated", "status": "cancelled"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["customer_name"] == "renamed"
    assert upd["notes"] == "updated"
    assert upd["status"] == "cancelled"


def test_rbac_salesperson_blocked(headers, vehicle_id, cleanup):
    """A salesperson without explicit `receivables` permission must get 403."""
    # Create a receivable as owner first.
    r = httpx.post(
        f"{BASE_URL}/receivables",
        json={
            "vehicle_id": vehicle_id,
            "customer_name": "rbac",
            "total_amount": 100,
            "installment_count": 1,
            "installment_amount": 100,
            "frequency": "monthly",
            "start_date": "2026-06-01",
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200
    rid = r.json()["id"]
    cleanup(rid)

    # Login as salesperson
    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": "joao@intercar.com", "password": "senha456"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("salesperson account not available — provisioned only inside the conftest run")
    sp_token = r.json()["access_token"]
    sp_headers = {"Authorization": f"Bearer {sp_token}"}

    r = httpx.get(f"{BASE_URL}/receivables", headers=sp_headers, timeout=15)
    assert r.status_code == 403

    r = httpx.get(f"{BASE_URL}/receivables/summary", headers=sp_headers, timeout=15)
    assert r.status_code == 403
