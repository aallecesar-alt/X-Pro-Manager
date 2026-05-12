"""
Tests for the new buyer_email / buyer_address fields and the revert-to-in_stock cleanup
which was previously losing buyer name/phone but keeping registration_cost etc.
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


def _create_vehicle(headers, **overrides):
    payload = {
        "make": "TestBuyer", "model": "Sedan", "year": 2024,
        "color": "Red", "vin": f"TESTVIN{os.urandom(4).hex().upper()}",
        "transmission": "Automatic", "fuel_type": "Gasoline", "body_type": "Sedan",
        "purchase_price": 10000, "sale_price": 15000, "expenses": 0,
        "description": "", "images": [], "status": "in_stock",
    }
    payload.update(overrides)
    r = requests.post(f"{API}/vehicles", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_vehicle(headers, vid):
    try:
        requests.delete(f"{API}/vehicles/{vid}", headers=headers, timeout=10)
    except Exception:
        pass


def test_create_sold_vehicle_with_email_and_address_persists():
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Joao Cliente",
            "buyer_phone": "5511999998888",
            "buyer_email": "joao@email.com",
            "buyer_address": "Rua Exemplo, 123 - Apto 4 - São Paulo",
            "down_payment": 5000,
            "bank_check_amount": 10000,
            "sold_price": 15000,
            "payment_method": "Financiado",
            "bank_name": "Banco X",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["buyer_name"] == "Joao Cliente"
        assert body["buyer_phone"] == "5511999998888"
        assert body["buyer_email"] == "joao@email.com"
        assert body["buyer_address"] == "Rua Exemplo, 123 - Apto 4 - São Paulo"
        assert body["status"] == "sold"
    finally:
        _delete_vehicle(h, v["id"])


def test_reverting_sold_to_in_stock_wipes_all_buyer_and_payment_fields():
    """Regression for the residual-data bug:
    When a sold vehicle is reverted to in_stock, every buyer/payment/financing
    field must be cleared so the next sale starts blank.
    """
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        # Mark as sold with everything filled in
        requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Maria Cliente",
            "buyer_phone": "+15551234567",
            "buyer_email": "maria@email.com",
            "buyer_address": "Av Test 99",
            "payment_method": "Financiado",
            "bank_name": "Banco Y",
            "down_payment": 2000,
            "bank_check_amount": 13000,
            "registration_cost": 500,
            "sold_price": 14500,
        }, timeout=15).raise_for_status()

        # Revert to in_stock (frontend echoes back old values — server must wipe them)
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "in_stock",
            # frontend STILL sends these stale values:
            "buyer_name": "Maria Cliente",
            "buyer_phone": "+15551234567",
            "buyer_email": "maria@email.com",
            "buyer_address": "Av Test 99",
            "payment_method": "Financiado",
            "bank_name": "Banco Y",
            "down_payment": 2000,
            "bank_check_amount": 13000,
            "registration_cost": 500,
            "sold_price": 14500,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "in_stock"
        # Every customer field must be cleared regardless of what the client sent
        assert body["buyer_name"] == "", f"buyer_name not wiped: {body['buyer_name']!r}"
        assert body["buyer_phone"] == "", f"buyer_phone not wiped: {body['buyer_phone']!r}"
        assert body["buyer_email"] == "", f"buyer_email not wiped: {body['buyer_email']!r}"
        assert body["buyer_address"] == "", f"buyer_address not wiped: {body['buyer_address']!r}"
        assert body["payment_method"] == "", f"payment_method not wiped: {body['payment_method']!r}"
        assert body["bank_name"] == "", f"bank_name not wiped: {body['bank_name']!r}"
        # Financing breakdown
        assert (body.get("down_payment") or 0) == 0
        assert (body.get("bank_check_amount") or 0) == 0
        assert (body.get("registration_cost") or 0) == 0
        assert (body.get("sold_price") or 0) == 0
        assert body.get("sold_at") in (None, "")
        # No phantom registration expense left behind
        for it in body.get("expense_items") or []:
            assert it.get("category") != "registration", "Phantom registration expense after revert"
    finally:
        _delete_vehicle(h, v["id"])


def test_email_and_address_are_optional_when_marking_as_sold():
    """Backwards compatibility: users may not type email/address. Backend must
    accept the sale and default both fields to empty strings."""
    h = _owner_headers()
    v = _create_vehicle(h)
    try:
        r = requests.put(f"{API}/vehicles/{v['id']}", headers=h, json={
            "status": "sold",
            "buyer_name": "Sem Email",
            "buyer_phone": "999",
            "down_payment": 1000,
            "bank_check_amount": 0,
            "sold_price": 1000,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Existing vehicle has no email/address set, defaults must be empty strings (not missing)
        assert body.get("buyer_email", "") == ""
        assert body.get("buyer_address", "") == ""
    finally:
        _delete_vehicle(h, v["id"])
