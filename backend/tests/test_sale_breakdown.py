"""Tests for the financed-sale breakdown — down_payment + bank_check_amount + registration_cost.

When a vehicle is marked sold with the financing breakdown:
  - sold_price is auto-computed as down_payment + bank_check_amount
  - registration_cost mirrors into expense_items (category="registration")
  - vehicle.expenses is updated accordingly so per-vehicle profit reflects emplacamento

Reverting from sold → in_stock clears the breakdown so the next sale starts fresh.
"""
import os
import httpx
import pytest

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"


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
def fresh_vehicle(headers):
    """Provision a temporary vehicle and yield its id; delete on cleanup."""
    r = httpx.post(
        f"{BASE_URL}/vehicles",
        json={"make": "Test", "model": "SaleBreakdown", "year": 2024, "purchase_price": 15000, "sale_price": 20000},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    yield vid
    try:
        httpx.delete(f"{BASE_URL}/vehicles/{vid}", headers=headers, timeout=15)
    except Exception:
        pass


def test_sold_breakdown_computes_sold_price(headers, fresh_vehicle):
    """sold_price must equal down_payment + bank_check_amount."""
    r = httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={
            "status": "sold",
            "buyer_name": "Buyer Test",
            "down_payment": 5000,
            "bank_check_amount": 16000,
            "bank_name": "Capital One",
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "sold"
    assert v["down_payment"] == 5000
    assert v["bank_check_amount"] == 16000
    # Note: cheque + entrada = 21000, may exceed sale_price (20000) — that's allowed.
    assert v["sold_price"] == 21000


def test_registration_cost_mirrors_into_expense_items(headers, fresh_vehicle):
    r = httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={
            "status": "sold",
            "buyer_name": "Buyer Reg",
            "down_payment": 3000,
            "bank_check_amount": 17000,
            "registration_cost": 600,
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["registration_cost"] == 600
    reg_items = [it for it in v.get("expense_items", []) if it.get("category") == "registration"]
    assert len(reg_items) == 1
    assert reg_items[0]["amount"] == 600
    assert reg_items[0]["id"] == f"reg-{fresh_vehicle}"
    assert v["expenses"] == 600


def test_changing_registration_replaces_mirror(headers, fresh_vehicle):
    # Initial sale with $600 registration
    httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"status": "sold", "buyer_name": "X", "down_payment": 5000, "bank_check_amount": 15000, "registration_cost": 600},
        headers=headers,
        timeout=15,
    )
    # Edit registration to $800
    r = httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"registration_cost": 800},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    v = r.json()
    reg_items = [it for it in v.get("expense_items", []) if it.get("category") == "registration"]
    assert len(reg_items) == 1   # still exactly one — old one was replaced
    assert reg_items[0]["amount"] == 800
    assert v["expenses"] == 800


def test_zero_registration_removes_mirror(headers, fresh_vehicle):
    # First with $500
    httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"status": "sold", "buyer_name": "X", "down_payment": 5000, "bank_check_amount": 15000, "registration_cost": 500},
        headers=headers,
        timeout=15,
    )
    # Set to 0
    r = httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"registration_cost": 0},
        headers=headers,
        timeout=15,
    )
    v = r.json()
    reg_items = [it for it in v.get("expense_items", []) if it.get("category") == "registration"]
    assert reg_items == []
    assert v["expenses"] == 0


def test_revert_sale_clears_breakdown(headers, fresh_vehicle):
    # Mark sold with breakdown
    httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"status": "sold", "buyer_name": "X", "down_payment": 5000, "bank_check_amount": 15000, "registration_cost": 500},
        headers=headers,
        timeout=15,
    )
    # Revert to in_stock
    r = httpx.put(
        f"{BASE_URL}/vehicles/{fresh_vehicle}",
        json={"status": "in_stock"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200
    v = r.json()
    assert v["status"] == "in_stock"
    assert v["down_payment"] == 0
    assert v["bank_check_amount"] == 0
    assert v["registration_cost"] == 0
    assert v["sold_price"] == 0
