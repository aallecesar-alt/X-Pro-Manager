"""Backend tests for Pós-Vendas (Post-Sales) feature.

Covers:
- RBAC: owner allowed, salesperson denied, BDC denied
- VIN lookup: found / not_found
- CRUD: create -> list -> update (status flow + auto exit_date) -> delete
- Mirror expense_item: cost flows into the linked vehicle's expenses field,
  removed when post-sale is deleted
"""
import os
import re
import uuid
from datetime import datetime, timezone

import pytest
import requests


def _read_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                m = re.match(r"REACT_APP_BACKEND_URL=(.+)", line.strip())
                if m:
                    return m.group(1).rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"

OWNER = {"email": "carlos@intercar.com", "password": "senha123"}
SALES = {"email": "joao@intercar.com", "password": "senha456"}
BDC = {"email": "bdc@intercar.com", "password": "bdc1234"}


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=20)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def owner_token():
    r = _login(OWNER)
    assert r.status_code == 200, f"owner login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sales_token():
    r = _login(SALES)
    if r.status_code != 200:
        pytest.skip(f"salesperson login failed: {r.status_code}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def bdc_token():
    r = _login(BDC)
    if r.status_code != 200:
        pytest.skip(f"bdc login failed: {r.status_code}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def test_vehicle(owner_token):
    """Create a throwaway vehicle for VIN lookup + expense mirroring tests."""
    vin = f"TESTVIN{uuid.uuid4().hex[:10].upper()}"
    payload = {
        "make": "TEST_PostSales",
        "model": "Probe",
        "year": 2024,
        "vin": vin,
        "color": "red",
        "purchase_price": 10000,
        "sale_price": 12000,
        "status": "sold",
        "buyer_name": "TEST PostSales Buyer",
        "buyer_phone": "555-9999",
    }
    r = requests.post(f"{API}/vehicles", headers=_auth(owner_token), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    veh = r.json()
    yield veh
    # cleanup handled by conftest sweeper (TEST_ prefix)


# ============================================================
# RBAC
# ============================================================
class TestPostSalesAccess:
    def test_owner_can_list(self, owner_token):
        r = requests.get(f"{API}/post-sales", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_salesperson_denied(self, sales_token):
        r = requests.get(f"{API}/post-sales", headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_bdc_denied(self, bdc_token):
        r = requests.get(f"{API}/post-sales", headers=_auth(bdc_token), timeout=20)
        assert r.status_code == 403


# ============================================================
# VIN lookup
# ============================================================
class TestVinLookup:
    def test_lookup_found(self, owner_token, test_vehicle):
        r = requests.get(
            f"{API}/post-sales/lookup-vin",
            headers=_auth(owner_token),
            params={"vin": test_vehicle["vin"]},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["found"] is True
        assert d["vehicle_id"] == test_vehicle["id"]
        assert d["make"] == "TEST_PostSales"
        assert d["model"] == "Probe"
        assert d["year"] == 2024
        assert d["customer_name"] == "TEST PostSales Buyer"
        assert d["customer_phone"] == "555-9999"

    def test_lookup_not_found(self, owner_token):
        r = requests.get(
            f"{API}/post-sales/lookup-vin",
            headers=_auth(owner_token),
            params={"vin": "NOPE999999999"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json() == {"found": False}

    def test_lookup_case_insensitive(self, owner_token, test_vehicle):
        r = requests.get(
            f"{API}/post-sales/lookup-vin",
            headers=_auth(owner_token),
            params={"vin": test_vehicle["vin"].lower()},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["found"] is True


# ============================================================
# CRUD + mirror expense lifecycle
# ============================================================
class TestPostSalesLifecycle:
    def test_create_update_delete_flow(self, owner_token, test_vehicle):
        veh_id = test_vehicle["id"]

        # 1) Create open repair with cost 350
        payload = {
            "vin": test_vehicle["vin"],
            "vehicle_id": veh_id,
            "make": test_vehicle["make"],
            "model": test_vehicle["model"],
            "year": 2024,
            "customer_name": "TEST PostSales Buyer",
            "customer_phone": "555-9999",
            "problem": "TEST_ Barulho na suspensão",
            "work_to_do": "TEST_ Trocar amortecedor traseiro",
            "cost": 350,
            "technician": "TEST_Pedro",
            "status": "open",
        }
        r = requests.post(f"{API}/post-sales", headers=_auth(owner_token), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        ps = r.json()
        ps_id = ps["id"]
        assert ps["status"] == "open"
        assert ps["cost"] == 350.0
        # entry_date auto-stamped today
        assert ps["entry_date"] == datetime.now(timezone.utc).date().isoformat()

        # 2) Vehicle should now have a mirror expense_item
        r = requests.get(f"{API}/vehicles/{veh_id}", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        veh = r.json()
        ps_items = [it for it in veh.get("expense_items") or [] if it.get("category") == "post_sale"]
        assert len(ps_items) == 1
        assert ps_items[0]["amount"] == 350.0
        assert ps_items[0]["id"] == ps_id
        assert veh["expenses"] >= 350.0

        # 3) Update status to in_progress, change cost to 420
        r = requests.put(
            f"{API}/post-sales/{ps_id}",
            headers=_auth(owner_token),
            json={**payload, "cost": 420, "status": "in_progress"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"
        assert r.json()["cost"] == 420.0

        # 4) Vehicle expense should reflect the new amount (replaced, not duplicated)
        r = requests.get(f"{API}/vehicles/{veh_id}", headers=_auth(owner_token), timeout=20)
        veh = r.json()
        ps_items = [it for it in veh.get("expense_items") or [] if it.get("category") == "post_sale"]
        assert len(ps_items) == 1
        assert ps_items[0]["amount"] == 420.0

        # 5) Move to "done" without exit_date — backend should auto-stamp it
        r = requests.put(
            f"{API}/post-sales/{ps_id}",
            headers=_auth(owner_token),
            json={**payload, "cost": 420, "status": "done", "exit_date": ""},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "done"
        assert d["exit_date"] == datetime.now(timezone.utc).date().isoformat()

        # 6) Delete — vehicle expense mirror should be wiped
        r = requests.delete(f"{API}/post-sales/{ps_id}", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        assert r.json() == {"deleted": True}

        r = requests.get(f"{API}/vehicles/{veh_id}", headers=_auth(owner_token), timeout=20)
        veh = r.json()
        ps_items = [it for it in veh.get("expense_items") or [] if it.get("category") == "post_sale"]
        assert ps_items == []

    def test_invalid_status_rejected(self, owner_token):
        r = requests.post(
            f"{API}/post-sales",
            headers=_auth(owner_token),
            json={"vin": "TEST_V", "problem": "TEST_x", "work_to_do": "TEST_y", "status": "bogus"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_create_without_vehicle_id_works(self, owner_token):
        """Customer brings a car that's NOT in the system — manual entry must be allowed."""
        r = requests.post(
            f"{API}/post-sales",
            headers=_auth(owner_token),
            json={
                "vin": f"TESTUNKN{uuid.uuid4().hex[:6].upper()}",
                "make": "TEST_Toyota",
                "model": "Corolla",
                "year": 2018,
                "problem": "TEST_ luz acendendo",
                "work_to_do": "TEST_ scan de erros",
                "cost": 80,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        ps = r.json()
        assert ps["vehicle_id"] == ""
        assert ps["status"] == "open"
        # Cleanup
        requests.delete(f"{API}/post-sales/{ps['id']}", headers=_auth(owner_token), timeout=20)
