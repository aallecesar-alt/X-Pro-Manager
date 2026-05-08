"""Backend tests for the Lost Sales feature.

Covers:
- POST /api/vehicles/{vid}/revert-sale (sold -> in_stock + lost_sales record)
- GET /api/lost-sales (rows, by_reason, totals, month filter, role enforcement)
- End-to-end: sell a vehicle as Joao for $25000, revert it with reason=financing_denied,
  verify lost-sales row + vehicle is back in stock with purchase_price preserved.
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
    # Fallback: read from frontend .env
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


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=20)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def owner_token():
    r = _login(OWNER)
    assert r.status_code == 200, f"owner login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def salesperson_token():
    r = _login(SALES)
    if r.status_code != 200:
        pytest.skip(f"salesperson login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def salesperson_info(salesperson_token):
    r = requests.get(f"{API}/auth/me", headers=_auth(salesperson_token), timeout=20)
    assert r.status_code == 200
    return r.json().get("user") or r.json()


# ============================================================
# RBAC for /lost-sales
# ============================================================
class TestLostSalesAccess:
    def test_owner_can_list(self, owner_token):
        r = requests.get(f"{API}/lost-sales", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("rows", "by_reason", "total_count", "total_lost_revenue"):
            assert k in d, f"missing key {k}"

    def test_salesperson_forbidden(self, salesperson_token):
        r = requests.get(f"{API}/lost-sales", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ============================================================
# Revert flow + record creation
# ============================================================
class TestRevertSale:
    @pytest.fixture
    def fresh_vehicle(self, owner_token):
        payload = {
            "make": "TEST_LOST", "model": f"Revertible_{uuid.uuid4().hex[:5]}",
            "year": 2023, "purchase_price": 18000,
            "expense_items": [{"label": "Detalhe", "amount": 200}],
            "expenses": 200,
            "asking_price": 28000, "status": "in_stock",
        }
        r = requests.post(f"{API}/vehicles", json=payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        v = r.json()
        yield v
        requests.delete(f"{API}/vehicles/{v['id']}", headers=_auth(owner_token), timeout=20)

    def test_revert_unsold_returns_400(self, owner_token, fresh_vehicle):
        r = requests.post(
            f"{API}/vehicles/{fresh_vehicle['id']}/revert-sale",
            json={"reason": "financing_denied", "notes": "test"},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 400, f"expected 400 for unsold revert, got {r.status_code} {r.text}"

    def test_revert_unknown_vehicle_404(self, owner_token):
        r = requests.post(
            f"{API}/vehicles/__nope__/revert-sale",
            json={"reason": "other", "notes": ""},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 404

    def test_full_e2e_revert_and_lost_sale(self, owner_token, salesperson_token, salesperson_info, fresh_vehicle):
        vid = fresh_vehicle["id"]
        sp_id = salesperson_info.get("salesperson_id")
        sp_name = salesperson_info.get("salesperson_name") or salesperson_info.get("name") or ""

        # 1) Mark sold as the salesperson (Joao) for $25000
        r = requests.put(
            f"{API}/vehicles/{vid}",
            json={"status": "sold", "sold_price": 25000, "buyer_name": "TEST Mr. Buyer", "buyer_phone": "555"},
            headers=_auth(salesperson_token), timeout=20,
        )
        assert r.status_code == 200, r.text

        # Confirm via owner GET that salesperson_name was snapshot
        v_before = requests.get(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20).json()
        assert v_before["status"] == "sold"
        assert v_before.get("salesperson_id") == sp_id
        snapped_sp_name = v_before.get("salesperson_name") or sp_name
        assert snapped_sp_name, "salesperson_name must be populated before revert"

        # Snapshot lost-sales count baseline (owner)
        before = requests.get(f"{API}/lost-sales", headers=_auth(owner_token), timeout=20).json()
        before_total = before["total_count"]

        # 2) Revert as owner
        r = requests.post(
            f"{API}/vehicles/{vid}/revert-sale",
            json={"reason": "financing_denied", "notes": "Banco recusou financiamento"},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        ls = body["lost_sale"]
        # Validate snapshot fields
        assert ls["vehicle_id"] == vid
        assert ls["reason"] == "financing_denied"
        assert ls["notes"] == "Banco recusou financiamento"
        assert float(ls["sold_price"]) == 25000.0
        assert ls["buyer_name"] == "TEST Mr. Buyer"
        assert ls["salesperson_id"] == sp_id
        assert ls["salesperson_name"] == snapped_sp_name
        assert ls.get("lost_at"), "lost_at must be present"
        assert ls.get("reverted_by_name"), "reverted_by_name must be present"
        assert ls["make"] == fresh_vehicle["make"]
        assert ls["model"] == fresh_vehicle["model"]
        assert ls["year"] == fresh_vehicle["year"]
        ls_id = ls["id"]

        # 3) Vehicle is back in stock with purchase_price + expense_items preserved
        v_after = requests.get(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20).json()
        assert v_after["status"] == "in_stock"
        assert float(v_after.get("sold_price") or 0) == 0
        assert v_after.get("buyer_name") in ("", None)
        assert v_after.get("salesperson_id") in ("", None)
        assert v_after.get("salesperson_name") in ("", None)
        assert int(v_after.get("delivery_step") or 0) == 0
        assert v_after.get("sold_at") in (None, "", 0)
        assert float(v_after.get("purchase_price") or 0) == 18000.0, "purchase_price must be preserved"
        # expense_items preserved
        ei = v_after.get("expense_items") or []
        assert any(item.get("label") == "Detalhe" and float(item.get("amount") or 0) == 200 for item in ei), \
            f"expense_items must be preserved: {ei}"

        # 4) GET /lost-sales reflects the new record
        after = requests.get(f"{API}/lost-sales", headers=_auth(owner_token), timeout=20).json()
        assert after["total_count"] == before_total + 1
        # find our row
        row = next((r for r in after["rows"] if r.get("id") == ls_id), None)
        assert row is not None, f"lost_sale {ls_id} not found in list"
        assert row["reason"] == "financing_denied"
        assert float(row["sold_price"]) == 25000.0
        # by_reason aggregation contains financing_denied
        fd_bucket = next((b for b in after["by_reason"] if b["reason"] == "financing_denied"), None)
        assert fd_bucket is not None
        assert fd_bucket["count"] >= 1
        assert fd_bucket["lost_revenue"] >= 25000.0
        # total_lost_revenue includes our 25000
        assert after["total_lost_revenue"] >= 25000.0

        # 5) Month filter — current month should include it; far-past month should not
        now = datetime.now(timezone.utc)
        in_month = requests.get(
            f"{API}/lost-sales?year={now.year}&month={now.month}",
            headers=_auth(owner_token), timeout=20,
        ).json()
        assert any(r.get("id") == ls_id for r in in_month["rows"]), "row should be in current month bucket"

        far_past = requests.get(
            f"{API}/lost-sales?year=2000&month=1",
            headers=_auth(owner_token), timeout=20,
        ).json()
        assert not any(r.get("id") == ls_id for r in far_past["rows"]), "row should NOT be in 2000-01 bucket"

        # cleanup the lost_sale row by id is not exposed via API; flag for cleanup
        TestRevertSale._created_lost_sale_ids = getattr(TestRevertSale, "_created_lost_sale_ids", []) + [ls_id]
