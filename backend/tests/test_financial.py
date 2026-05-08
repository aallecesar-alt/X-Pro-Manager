"""Backend tests for Financial dashboard + Operational expenses (owner-only).

Endpoints covered:
- GET /api/financial/closing (with year/month filters and role enforcement)
- GET /api/financial/monthly?months=N (with role enforcement)
- POST/GET/PUT/DELETE /api/expenses (with role enforcement and month filtering)

Plus end-to-end calculation: rent 3500 expense + 1 sold vehicle (sold 30000, purchase 20000, expenses 1000,
commission 500 paid)  =>  gross 9000, opex 3500, paid_commissions 500, net 5000.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

def _load_backend_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if u:
        return u.rstrip("/")
    # fallback: read frontend/.env
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

OWNER = {"email": "carlos@intercar.com", "password": "senha123"}
SALES = {"email": "joao@intercar.com", "password": "senha456"}


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=20)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def owner_token():
    r = _login(OWNER)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sales_token():
    r = _login(SALES)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def now_ym():
    n = datetime.now(timezone.utc)
    return n.year, n.month


# =========================================================
# 1. EXPENSES CRUD (owner)
# =========================================================
class TestExpensesCRUD:
    def test_create_expense_owner(self, owner_token, now_ym):
        y, m = now_ym
        payload = {
            "date": f"{y:04d}-{m:02d}-15",
            "category": "rent",
            "description": "TEST_RENT",
            "amount": 1234.56,
            "attachment_url": "",
        }
        r = requests.post(f"{API}/expenses", json=payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"]
        assert body["amount"] == 1234.56
        assert body["category"] == "rent"
        assert body["description"] == "TEST_RENT"
        TestExpensesCRUD._eid = body["id"]

    def test_list_expenses_filters_by_month(self, owner_token, now_ym):
        y, m = now_ym
        r = requests.get(f"{API}/expenses", params={"year": y, "month": m},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        rows = r.json()
        ids = [x["id"] for x in rows]
        assert TestExpensesCRUD._eid in ids
        # all rows must lie within month
        prefix = f"{y:04d}-{m:02d}-"
        for x in rows:
            assert x["date"].startswith(prefix), f"row not in month: {x}"

    def test_list_expenses_other_month_excludes(self, owner_token, now_ym):
        y, m = now_ym
        # pick a far-past month (always before TEST_RENT)
        r = requests.get(f"{API}/expenses", params={"year": 2000, "month": 1},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestExpensesCRUD._eid not in ids

    def test_update_expense(self, owner_token):
        eid = TestExpensesCRUD._eid
        r = requests.put(f"{API}/expenses/{eid}", json={"amount": 9999.99, "description": "TEST_RENT_upd"},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["amount"] == 9999.99
        assert body["description"] == "TEST_RENT_upd"

    def test_delete_expense(self, owner_token):
        eid = TestExpensesCRUD._eid
        r = requests.delete(f"{API}/expenses/{eid}", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        # Verify GET no longer lists it (use no filter to be sure)
        r2 = requests.get(f"{API}/expenses", headers=_auth(owner_token), timeout=20)
        assert all(x["id"] != eid for x in r2.json())


# =========================================================
# 2. ROLE ENFORCEMENT
# =========================================================
class TestExpensesRBAC:
    def test_list_expenses_salesperson_403(self, sales_token):
        r = requests.get(f"{API}/expenses", headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_create_expense_salesperson_403(self, sales_token, now_ym):
        y, m = now_ym
        r = requests.post(f"{API}/expenses",
                          json={"date": f"{y:04d}-{m:02d}-01", "category": "x", "amount": 1},
                          headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_update_expense_salesperson_403(self, sales_token):
        r = requests.put(f"{API}/expenses/anyid", json={"amount": 1},
                         headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_delete_expense_salesperson_403(self, sales_token):
        r = requests.delete(f"{API}/expenses/anyid", headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_financial_closing_salesperson_403(self, sales_token):
        r = requests.get(f"{API}/financial/closing", headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403

    def test_financial_monthly_salesperson_403(self, sales_token):
        r = requests.get(f"{API}/financial/monthly", params={"months": 3},
                         headers=_auth(sales_token), timeout=20)
        assert r.status_code == 403


# =========================================================
# 3. FINANCIAL CLOSING + MONTHLY (basic structure)
# =========================================================
class TestFinancialEndpointsStructure:
    def test_closing_default_month(self, owner_token, now_ym):
        r = requests.get(f"{API}/financial/closing", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        y, m = now_ym
        assert d["year"] == y and d["month"] == m
        for k in ("vehicles_sold", "vehicles_count", "total_revenue", "gross_profit",
                  "operational_expenses", "operational_total", "paid_commissions", "net_profit"):
            assert k in d

    def test_closing_filter_year_month(self, owner_token):
        # Filter for a far past month should give zero everything
        r = requests.get(f"{API}/financial/closing", params={"year": 2000, "month": 1},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["year"] == 2000 and d["month"] == 1
        assert d["vehicles_count"] == 0
        assert d["operational_total"] == 0
        assert d["paid_commissions"] == 0
        assert d["net_profit"] == 0

    def test_monthly_returns_n_buckets(self, owner_token):
        r = requests.get(f"{API}/financial/monthly", params={"months": 6},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) == 6
        for row in rows:
            for k in ("year", "month", "label", "revenue", "gross_profit",
                      "operational_expenses", "paid_commissions", "net_profit", "vehicles_count"):
                assert k in row, f"missing {k} in {row}"


# =========================================================
# 4. END-TO-END CALCULATION TEST
#   rent 3500 + 1 sold vehicle (sold 30000, purchase 20000, expenses 1000, commission_amount 500, paid)
#   => gross_profit = 9000, operational_total = 3500, paid_commissions = 500, net_profit = 5000
# =========================================================
class TestEndToEndClosingCalculation:
    @pytest.fixture(scope="class")
    def setup_data(self, owner_token, now_ym):
        y, m = now_ym
        date_iso = f"{y:04d}-{m:02d}-15"

        # 1) Create operational expense rent 3500
        r = requests.post(f"{API}/expenses", json={
            "date": date_iso, "category": "rent",
            "description": f"TEST_E2E_RENT_{uuid.uuid4().hex[:5]}", "amount": 3500
        }, headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]

        # 2) Create vehicle and mark as sold (purchase 20000, expenses 1000, sold 30000, commission 500 paid)
        v_payload = {
            "make": "TEST_E2E", "model": f"M_{uuid.uuid4().hex[:5]}",
            "year": 2022, "purchase_price": 20000, "asking_price": 32000,
            "expenses": 1000, "status": "in_stock"
        }
        r = requests.post(f"{API}/vehicles", json=v_payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        vid = r.json()["id"]

        sold_at = f"{y:04d}-{m:02d}-20T12:00:00"
        upd = {
            "status": "sold",
            "sold_price": 30000,
            "buyer_name": "TEST_E2E Buyer",
            "commission_amount": 500,
            "commission_paid": True,
            "sold_at": sold_at,
            "expenses": 1000,
        }
        r = requests.put(f"{API}/vehicles/{vid}", json=upd, headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        # Verify sold_at saved correctly
        v = requests.get(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20).json()
        assert v.get("status") == "sold"

        yield {"eid": eid, "vid": vid}

        # ---- TEARDOWN: restore vehicle to in_stock; delete expense ----
        requests.delete(f"{API}/expenses/{eid}", headers=_auth(owner_token), timeout=20)
        # Reset vehicle (simplest = delete TEST_E2E vehicle since we created it ourselves)
        requests.delete(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20)

    def test_closing_math(self, owner_token, now_ym, setup_data):
        y, m = now_ym
        r = requests.get(f"{API}/financial/closing", params={"year": y, "month": m},
                         headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # the test vehicle contributes gross 9000 (rev 30000 - cost 21000),
        # commission 500 paid -> per-row profit = 9000 - 500 = 8500.
        # opex from our rent = 3500.
        # Find our specific row & rent row
        v_match = [v for v in d["vehicles_sold"] if v["vehicle_id"] == setup_data["vid"]]
        assert len(v_match) == 1, f"sold vehicle not found in closing: {d['vehicles_sold']}"
        assert v_match[0]["sold_price"] == 30000
        assert v_match[0]["cost"] == 21000  # 20000 + 1000 expenses
        # Per-row profit subtracts paid commission as a per-car expense (consistent with VehicleExpensesModal)
        assert v_match[0]["profit"] == 8500
        assert v_match[0]["commission_amount"] == 500
        assert v_match[0]["commission_paid"] is True

        opex_match = [e for e in d["operational_expenses"] if e["id"] == setup_data["eid"]]
        assert len(opex_match) == 1
        assert opex_match[0]["amount"] == 3500

        # gross_profit at dealership level is rev - cost (without commission deduction).
        # net_profit = gross - opex - paid_commissions (so commission is counted exactly once).
        # Per-row profit DOES subtract commission, so sum(profit) != gross_profit (differs by paid_commissions).
        sum_row_profit = sum(v["profit"] for v in d["vehicles_sold"])
        sum_opex = sum(e["amount"] for e in d["operational_expenses"])
        sum_paid_comm = sum(v["commission_amount"] for v in d["vehicles_sold"] if v["commission_paid"])
        # gross_profit = sum_row_profit + sum_paid_comm
        assert abs(d["gross_profit"] - (sum_row_profit + sum_paid_comm)) < 0.01
        assert abs(d["operational_total"] - sum_opex) < 0.01
        assert abs(d["paid_commissions"] - sum_paid_comm) < 0.01
        # net = gross - opex - paid_commissions
        assert abs(d["net_profit"] - (d["gross_profit"] - sum_opex - sum_paid_comm)) < 0.01
