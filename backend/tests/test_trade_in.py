"""
Tests for the new Trade-in (veículo na troca) feature.
"""
import os
import re
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


def _create_vehicle(h, **overrides):
    payload = {
        "make": "TestSale", "model": "X", "year": 2024,
        "color": "Black", "vin": f"TIVIN{os.urandom(4).hex().upper()}",
        "transmission": "Automatic", "fuel_type": "Gasoline", "body_type": "Sedan",
        "purchase_price": 10000, "sale_price": 20000, "expenses": 0,
        "description": "", "images": [], "status": "in_stock",
    }
    payload.update(overrides)
    r = requests.post(f"{API}/vehicles", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _delete(h, vid):
    try:
        requests.delete(f"{API}/vehicles/{vid}", headers=h, timeout=10)
    except Exception:
        pass


def test_trade_in_value_counts_toward_total_payment():
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Cliente Trade",
            "down_payment": 2000,
            "bank_check_amount": 10000,
            "trade_in_make": "Honda",
            "trade_in_model": "Civic",
            "trade_in_year": 2018,
            "trade_in_value": 8000,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # sold_price should be entrada + cheque + trade-in (= 2000 + 10000 + 8000 = 20000)
        assert body["sold_price"] == 20000
        assert body["trade_in_make"] == "Honda"
        assert body["trade_in_value"] == 8000
        assert body.get("trade_in_vehicle_id")  # auto-created stock car
    finally:
        # Cleanup both vehicles
        if (r.json() if r.status_code == 200 else {}).get("trade_in_vehicle_id"):
            _delete(h, r.json()["trade_in_vehicle_id"])
        _delete(h, v["id"])


def test_trade_in_auto_creates_stock_vehicle():
    """Saving a sale with a trade-in must create a new in_stock vehicle
    representing the car received from the customer."""
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Maria Trade",
            "down_payment": 5000,
            "bank_check_amount": 5000,
            "trade_in_make": "Toyota",
            "trade_in_model": "Corolla",
            "trade_in_year": 2019,
            "trade_in_value": 7000,
        }, timeout=15)
        assert r.status_code == 200, r.text
        new_stock_id = r.json()["trade_in_vehicle_id"]
        assert new_stock_id
        # Fetch the new stock vehicle and assert basics
        rget = requests.get(f"{API}/vehicles", headers=h, timeout=15)
        items = rget.json()
        new_v = next((x for x in items if x["id"] == new_stock_id), None)
        assert new_v is not None
        assert new_v["status"] == "in_stock"
        assert new_v["make"] == "Toyota"
        assert new_v["model"] == "Corolla"
        assert new_v["year"] == 2019
        # Purchase price defaults to credit value
        assert new_v["purchase_price"] == 7000
        # History entry references the original sale
        assert any(h.get("type") == "created_from_trade_in" for h in (new_v.get("history") or []))
        _delete(h, new_stock_id)
    finally:
        _delete(h, v["id"])


def test_trade_in_payoff_creates_expense_on_new_stock_vehicle():
    """If there is a bank payoff, the new stock vehicle should carry that as
    an expense_items entry with category=trade_in_payoff."""
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Joao Trade",
            "down_payment": 3000,
            "bank_check_amount": 12000,
            "trade_in_make": "Ford",
            "trade_in_model": "Fusion",
            "trade_in_year": 2017,
            "trade_in_value": 5000,
            "trade_in_payoff_amount": 3500,
            "trade_in_payoff_bank": "Banco X",
        }, timeout=15)
        assert r.status_code == 200, r.text
        new_id = r.json()["trade_in_vehicle_id"]
        rget = requests.get(f"{API}/vehicles", headers=h, timeout=15)
        new_v = next((x for x in rget.json() if x["id"] == new_id), None)
        assert new_v is not None
        items = new_v.get("expense_items") or []
        payoff_items = [it for it in items if it.get("category") == "trade_in_payoff"]
        assert len(payoff_items) == 1
        assert payoff_items[0]["amount"] == 3500
        assert "Banco X" in (payoff_items[0]["description"] or "")
        # expenses field should reflect the payoff
        assert new_v["expenses"] == 3500
        # Cost basis = trade-in value credited + payoff absorbed
        assert new_v["purchase_price"] == 5000 + 3500
        _delete(h, new_id)
    finally:
        _delete(h, v["id"])


def test_trade_in_is_idempotent_on_subsequent_updates():
    """Updating the sold vehicle again must NOT create a second stock vehicle."""
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r1 = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "trade_in_make": "Nissan",
            "trade_in_model": "Sentra",
            "trade_in_year": 2020,
            "trade_in_value": 4000,
            "down_payment": 1000,
            "bank_check_amount": 5000,
        }, timeout=15)
        new_id_1 = r1.json()["trade_in_vehicle_id"]
        # Second PUT (just touching buyer name) — must not create another stock car
        r2 = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={"buyer_name": "Alterado"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["trade_in_vehicle_id"] == new_id_1
        # Verify only one in_stock matching this combination
        all_v = requests.get(f"{API}/vehicles", headers=h, timeout=15).json()
        matches = [x for x in all_v if x["make"] == "Nissan" and x["model"] == "Sentra" and x.get("status") == "in_stock"]
        assert len(matches) == 1
        _delete(h, new_id_1)
    finally:
        _delete(h, v["id"])


def test_reverting_sold_to_in_stock_wipes_trade_in_fields_but_keeps_stock_car():
    """Reverting clears trade-in fields on the sold car so a future sale starts
    fresh, but the auto-created stock car stays — it now belongs to the lot."""
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "trade_in_make": "Chevy",
            "trade_in_model": "Onix",
            "trade_in_year": 2021,
            "trade_in_value": 6000,
            "down_payment": 1000,
            "bank_check_amount": 5000,
        }, timeout=15)
        new_id = r.json()["trade_in_vehicle_id"]
        # Revert
        r2 = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "in_stock",
            "trade_in_make": "Chevy",  # client echoes back stale value
            "trade_in_value": 6000,
        }, timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body["trade_in_make"] == ""
        assert body["trade_in_value"] == 0
        assert body["trade_in_payoff_amount"] == 0
        # Stock car still exists
        all_v = requests.get(f"{API}/vehicles", headers=h, timeout=15).json()
        assert any(x["id"] == new_id for x in all_v)
        _delete(h, new_id)
    finally:
        _delete(h, v["id"])
