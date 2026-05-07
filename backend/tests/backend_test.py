"""Backend tests for role-based access (owner vs salesperson) at Inter Car app.

Covers:
- Auth login & /auth/me for owner and salesperson
- Salesperson credentials lifecycle (POST / DELETE / GET map)
- Vehicle list/get/update field-stripping for salesperson
- Stats endpoint role differences
- Sales-report role differences
- 403 enforcement on owner-only endpoints
- Auto-assignment of salesperson_id + commission when salesperson marks vehicle as sold
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://auto-commerce-lab.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "carlos@intercar.com", "password": "senha123"}
SALES = {"email": "joao@intercar.com", "password": "senha456"}


# ---------- helpers ----------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    return r


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
    assert r.status_code == 200, f"salesperson login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def owner_me(owner_token):
    r = requests.get(f"{API}/auth/me", headers=_auth(owner_token), timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def sales_me(salesperson_token):
    r = requests.get(f"{API}/auth/me", headers=_auth(salesperson_token), timeout=20)
    assert r.status_code == 200
    return r.json()


# ============================================================
# AUTH
# ============================================================
class TestAuth:
    def test_owner_login(self, owner_token):
        assert isinstance(owner_token, str) and len(owner_token) > 10

    def test_owner_me_role(self, owner_me):
        u = owner_me.get("user") or owner_me
        assert u.get("role") == "owner", f"expected owner role, got {u}"

    def test_salesperson_login_returns_role(self):
        r = _login(SALES)
        assert r.status_code == 200
        body = r.json()
        u = body.get("user") or {}
        assert u.get("role") == "salesperson"
        assert u.get("salesperson_id"), "salesperson_id should be populated on login"

    def test_salesperson_me(self, sales_me):
        u = sales_me.get("user") or sales_me
        assert u.get("role") == "salesperson"
        assert u.get("salesperson_id")


# ============================================================
# SALESPERSON CREDENTIALS lifecycle
# ============================================================
class TestSalespersonCredentials:
    @pytest.fixture(scope="class")
    def fresh_sp(self, owner_token):
        # create fresh salesperson
        payload = {"name": f"TEST_SP_{uuid.uuid4().hex[:6]}", "commission_amount": 250, "phone": "", "email": "", "active": True}
        r = requests.post(f"{API}/salespeople", json=payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        sp = r.json()
        yield sp
        # cleanup: revoke creds + delete sp
        requests.delete(f"{API}/salespeople/{sp['id']}/credentials", headers=_auth(owner_token), timeout=20)
        requests.delete(f"{API}/salespeople/{sp['id']}", headers=_auth(owner_token), timeout=20)

    def test_create_credentials(self, owner_token, fresh_sp):
        email = f"test_{uuid.uuid4().hex[:6]}@intercar.com"
        r = requests.post(
            f"{API}/salespeople/{fresh_sp['id']}/credentials",
            json={"email": email, "password": "TestPass123"},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("login_email") == email
        # store on class for next steps
        TestSalespersonCredentials._created_email = email

    def test_credentials_login_works(self, fresh_sp):
        # login with new credentials should work
        r = _login({"email": TestSalespersonCredentials._created_email, "password": "TestPass123"})
        assert r.status_code == 200, r.text
        u = r.json().get("user") or {}
        assert u.get("role") == "salesperson"
        assert u.get("salesperson_id") == fresh_sp["id"]

    def test_credentials_map(self, owner_token, fresh_sp):
        r = requests.get(f"{API}/salespeople/credentials", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        m = r.json()
        assert fresh_sp["id"] in m
        assert m[fresh_sp["id"]]["has_login"] is True
        assert m[fresh_sp["id"]]["login_email"] == TestSalespersonCredentials._created_email

    def test_revoke_credentials(self, owner_token, fresh_sp):
        r = requests.delete(f"{API}/salespeople/{fresh_sp['id']}/credentials", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        assert r.json().get("deleted") >= 1
        # subsequent login should fail
        r2 = _login({"email": TestSalespersonCredentials._created_email, "password": "TestPass123"})
        assert r2.status_code in (401, 403)


# ============================================================
# VEHICLES list/get with role-stripping
# ============================================================
class TestVehiclesRoleStripping:
    HIDDEN = {"purchase_price", "expenses", "expense_items"}

    def test_owner_sees_full_fields(self, owner_token):
        r = requests.get(f"{API}/vehicles", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        items = r.json()
        if items:
            v = items[0]
            # owner should at least have the keys (values may be 0)
            assert "purchase_price" in v

    def test_salesperson_stripped(self, salesperson_token):
        r = requests.get(f"{API}/vehicles", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200
        for v in r.json():
            for k in self.HIDDEN:
                assert k not in v, f"salesperson got hidden field {k} in vehicle {v.get('id')}"

    def test_salesperson_get_one_stripped(self, owner_token, salesperson_token):
        r = requests.get(f"{API}/vehicles", headers=_auth(owner_token), timeout=20)
        items = r.json()
        if not items:
            pytest.skip("no vehicles to test single fetch")
        vid = items[0]["id"]
        r2 = requests.get(f"{API}/vehicles/{vid}", headers=_auth(salesperson_token), timeout=20)
        assert r2.status_code == 200
        v = r2.json()
        for k in self.HIDDEN:
            assert k not in v


# ============================================================
# STATS endpoint
# ============================================================
class TestStats:
    OWNER_ONLY = ("invested_in_stock", "expenses_in_stock", "stock_total_cost",
                  "total_revenue", "total_profit", "avg_ticket")

    def test_owner_stats_full(self, owner_token):
        r = requests.get(f"{API}/stats", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in self.OWNER_ONLY:
            assert k in d, f"owner missing {k}"

    def test_salesperson_stats_stripped(self, salesperson_token):
        r = requests.get(f"{API}/stats", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in self.OWNER_ONLY:
            assert k not in d, f"salesperson should not see {k}"
        # monthly_sales rows must only contain month + count
        for m in d.get("monthly_sales", []):
            assert set(m.keys()) <= {"month", "count"}, f"unexpected keys in monthly row: {m.keys()}"


# ============================================================
# SALES-REPORT
# ============================================================
class TestSalesReport:
    def test_owner_sales_report(self, owner_token):
        r = requests.get(f"{API}/sales-report", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "total_revenue" in d
        assert "total_profit" in d

    def test_salesperson_sales_report_filtered(self, salesperson_token, sales_me):
        u = sales_me.get("user") or sales_me
        sp_id = u.get("salesperson_id")
        r = requests.get(f"{API}/sales-report", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "total_revenue" not in d
        assert "total_profit" not in d
        for row in d.get("rows", []):
            assert row.get("salesperson_id") == sp_id, "sales report rows should be filtered to own sales"
            assert "profit" not in row, "salesperson rows should not include profit"


# ============================================================
# 403 owner-only enforcement
# ============================================================
class TestForbiddenForSalesperson:
    def test_create_vehicle_403(self, salesperson_token):
        r = requests.post(f"{API}/vehicles", json={"make": "x", "model": "y", "year": 2020}, headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 403

    def test_delete_vehicle_403(self, salesperson_token, owner_token):
        # find any vehicle id
        r = requests.get(f"{API}/vehicles", headers=_auth(owner_token), timeout=20)
        items = r.json()
        if not items:
            pytest.skip("no vehicles available")
        vid = items[0]["id"]
        r2 = requests.delete(f"{API}/vehicles/{vid}", headers=_auth(salesperson_token), timeout=20)
        assert r2.status_code == 403

    def test_import_url_403(self, salesperson_token):
        r = requests.post(f"{API}/vehicles/import-url", json={"url": "http://x"}, headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 403

    def test_regen_token_403(self, salesperson_token):
        r = requests.post(f"{API}/dealership/regenerate-token", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 403

    def test_create_salesperson_403(self, salesperson_token):
        r = requests.post(f"{API}/salespeople", json={"name": "x"}, headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 403


# ============================================================
# UPDATE vehicle as salesperson — auto-assign + strip financials
# ============================================================
class TestSalespersonUpdateVehicle:
    @pytest.fixture
    def test_vehicle(self, owner_token):
        # create a fresh in_stock vehicle as owner
        payload = {
            "make": "TEST", "model": f"AutoSold_{uuid.uuid4().hex[:5]}",
            "year": 2022, "purchase_price": 50000, "asking_price": 60000,
            "status": "in_stock"
        }
        r = requests.post(f"{API}/vehicles", json=payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        v = r.json()
        yield v
        requests.delete(f"{API}/vehicles/{v['id']}", headers=_auth(owner_token), timeout=20)

    def test_auto_assign_on_sold(self, salesperson_token, sales_me, owner_token, test_vehicle):
        u = sales_me.get("user") or sales_me
        sp_id = u.get("salesperson_id")
        vid = test_vehicle["id"]

        # salesperson sets sold + buyer + sold_price + tries to inject forbidden fields
        payload = {
            "status": "sold",
            "buyer_name": "TEST Buyer",
            "sold_price": 65000,
            "purchase_price": 9999,        # should be stripped
            "expenses": 8888,              # should be stripped
            "expense_items": [{"label": "x", "amount": 1}],
            "commission_paid": True,
        }
        r = requests.put(f"{API}/vehicles/{vid}", json=payload, headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200, r.text
        # verify with owner token to see all fields
        r2 = requests.get(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20)
        assert r2.status_code == 200
        v = r2.json()
        assert v["status"] == "sold"
        assert v.get("buyer_name") == "TEST Buyer"
        assert v.get("salesperson_id") == sp_id, "should auto-assign salesperson_id"
        assert v.get("salesperson_name"), "salesperson_name must be auto-populated"
        # purchase_price unchanged from 50000 (stripped)
        assert float(v.get("purchase_price") or 0) == 50000
        # commission_amount populated from salesperson record (Joao = 500 per spec)
        assert float(v.get("commission_amount") or 0) > 0, "commission should be auto-populated from salesperson"
        # commission_paid should remain False (silently stripped)
        assert v.get("commission_paid") is False, "salesperson should not be able to mark commission paid"

    def test_update_buyer_only(self, salesperson_token, owner_token, test_vehicle):
        vid = test_vehicle["id"]
        # mark sold first
        requests.put(f"{API}/vehicles/{vid}", json={"status": "sold", "sold_price": 60000, "buyer_name": "A"}, headers=_auth(salesperson_token), timeout=20)
        r = requests.put(f"{API}/vehicles/{vid}",
                         json={"buyer_name": "TEST Buyer Updated", "purchase_price": 1},
                         headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20)
        v = r2.json()
        assert v.get("buyer_name") == "TEST Buyer Updated"
        assert float(v.get("purchase_price") or 0) == 50000
