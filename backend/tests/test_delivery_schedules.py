"""
Tests for the new Delivery Schedules (Programação de Entrega) feature.
"""
import os
import re
import time
from datetime import datetime, timezone, timedelta

import requests


def _read_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            m = re.match(r"REACT_APP_BACKEND_URL=(.+)", line.strip())
            if m:
                return m.group(1).rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"
OWNER_EMAIL = "carlos@intercar.com"
OWNER_PASS = "senha123"


def _owner_headers():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _cleanup(headers, sid):
    try:
        requests.delete(f"{API}/delivery-schedules/{sid}", headers=headers, timeout=10)
    except Exception:
        pass


def test_create_schedule_with_specs_and_assignees():
    h = _owner_headers()
    payload = {
        "customer_name": "TEST_SCHED Diessica",
        "vehicle_label": "2023 Chevy Silverado (azul)",
        "vin": "1GCUDDED3PZ181772",
        "delivery_date": "2026-05-21T16:30",
        "specifications": [
            {"text": "Colocar estribo"},
            {"text": "Colocar caporta marítima"},
        ],
        "assigned_names": ["Almir Batiston", "Joao", "Ricardinho"],
        "notes": "Cliente vem buscar quinta às 16:30",
    }
    r = requests.post(f"{API}/delivery-schedules", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    s = r.json()
    sid = s["id"]
    try:
        assert s["customer_name"] == "TEST_SCHED Diessica"
        assert len(s["specifications"]) == 2
        # Each spec got an id and is pending
        for sp in s["specifications"]:
            assert sp["id"]
            assert sp["done"] is False
        assert s["status"] == "pending"
        # Listing should include it (with derived fields)
        rlist = requests.get(f"{API}/delivery-schedules", headers=h, timeout=15)
        assert rlist.status_code == 200
        listed = [x for x in rlist.json() if x["id"] == sid]
        assert listed, "newly created schedule must appear in /delivery-schedules"
        item = listed[0]
        assert item["vin_last_6"] == "181772"
        assert item["total_specs"] == 2
        assert item["done_specs"] == 0
        assert item["pending_specs"] == 2
    finally:
        _cleanup(h, sid)


def test_toggle_spec_marks_done_and_records_actor():
    h = _owner_headers()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED Toggle",
        "specifications": [{"text": "Tarefa única"}],
    }, timeout=15)
    sid = r.json()["id"]
    spec_id = r.json()["specifications"][0]["id"]
    try:
        r2 = requests.post(f"{API}/delivery-schedules/{sid}/spec/{spec_id}/toggle", headers=h, timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["specifications"][0]["done"] is True
        assert body["specifications"][0]["done_by"]  # actor name set
        assert body["specifications"][0]["done_at"]
        # All done → status auto-completed
        assert body["status"] == "completed"
        assert body["completed_at"]

        # Toggle again undoes
        r3 = requests.post(f"{API}/delivery-schedules/{sid}/spec/{spec_id}/toggle", headers=h, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["specifications"][0]["done"] is False
        assert r3.json()["status"] == "pending"
        assert r3.json()["completed_at"] is None
    finally:
        _cleanup(h, sid)


def test_partial_progress_sets_in_progress():
    h = _owner_headers()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED Partial",
        "specifications": [{"text": "A"}, {"text": "B"}],
    }, timeout=15)
    sid = r.json()["id"]
    spec_a = r.json()["specifications"][0]["id"]
    try:
        r2 = requests.post(f"{API}/delivery-schedules/{sid}/spec/{spec_a}/toggle", headers=h, timeout=15)
        assert r2.json()["status"] == "in_progress"
        # Not yet completed
        assert r2.json()["completed_at"] is None
    finally:
        _cleanup(h, sid)


def test_alert_due_soon_within_24h_with_pending():
    """A schedule due in 12h with pending tasks must be flagged alert_due_soon."""
    h = _owner_headers()
    soon = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED Soon",
        "delivery_date": soon,
        "specifications": [{"text": "Lavar"}],
    }, timeout=15)
    sid = r.json()["id"]
    try:
        rlist = requests.get(f"{API}/delivery-schedules", headers=h, timeout=15)
        item = next(x for x in rlist.json() if x["id"] == sid)
        assert item["alert_due_soon"] is True
        assert item["hours_until"] is not None
        # The alerts endpoint counts it
        ralerts = requests.get(f"{API}/delivery-schedules/alerts", headers=h, timeout=15)
        assert ralerts.status_code == 200
        assert ralerts.json()["count"] >= 1
    finally:
        _cleanup(h, sid)


def test_no_alert_when_more_than_24h_away():
    h = _owner_headers()
    far = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED Far",
        "delivery_date": far,
        "specifications": [{"text": "Lavar"}],
    }, timeout=15)
    sid = r.json()["id"]
    try:
        rlist = requests.get(f"{API}/delivery-schedules", headers=h, timeout=15)
        item = next(x for x in rlist.json() if x["id"] == sid)
        assert item["alert_due_soon"] is False
    finally:
        _cleanup(h, sid)


def test_no_alert_when_completed():
    """Even if delivery_date is past, a completed schedule must not raise alerts."""
    h = _owner_headers()
    past = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED Done",
        "delivery_date": past,
        "specifications": [{"text": "Lavar"}],
    }, timeout=15)
    sid = r.json()["id"]
    spec_id = r.json()["specifications"][0]["id"]
    try:
        # Mark all done
        requests.post(f"{API}/delivery-schedules/{sid}/spec/{spec_id}/toggle", headers=h, timeout=15)
        rlist = requests.get(f"{API}/delivery-schedules", headers=h, timeout=15)
        item = next(x for x in rlist.json() if x["id"] == sid)
        assert item["status"] == "completed"
        assert item["alert_due_soon"] is False
    finally:
        _cleanup(h, sid)


def test_delete_schedule_owner():
    h = _owner_headers()
    r = requests.post(f"{API}/delivery-schedules", headers=h, json={
        "customer_name": "TEST_SCHED ToDelete",
        "specifications": [],
    }, timeout=15)
    sid = r.json()["id"]
    rdel = requests.delete(f"{API}/delivery-schedules/{sid}", headers=h, timeout=15)
    assert rdel.status_code == 200
    assert rdel.json()["deleted"] is True
    rlist = requests.get(f"{API}/delivery-schedules", headers=h, timeout=15)
    assert not any(x["id"] == sid for x in rlist.json())


def test_unauthenticated_request_rejected():
    r = requests.get(f"{API}/delivery-schedules", timeout=10)
    assert r.status_code in (401, 403)
