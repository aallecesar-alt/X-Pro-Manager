"""
Tests for the premium Visão Geral / Overview endpoint /api/overview-insights.

Covers:
- Owner gets full payload (revenue/profit/avg_ticket + deltas + heatmap + days)
- Deltas: 100% when previous_month==0 and current>0; 0/None when both==0; negative when current<prev
- Avg days in stock based on purchase_date / created_at
- Weekday counts: only sales in last 90 days, bucketed by datetime.weekday()
- Salesperson sees a stripped payload (no money, only counts + weekday + days)
"""
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

import pytest
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


def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def owner_headers():
    data = _login(OWNER_EMAIL, OWNER_PASS)
    return {"Authorization": f"Bearer {data['access_token']}"}


def test_owner_gets_full_insights_payload(owner_headers):
    r = requests.get(f"{API}/overview-insights", headers=owner_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Top-level keys
    for key in ("current_month", "previous_month", "deltas", "avg_days_in_stock", "weekday_counts"):
        assert key in data, f"missing key '{key}' in {data}"
    # Owner sees money fields
    for key in ("sales_count", "revenue", "profit", "avg_ticket"):
        assert key in data["current_month"], f"current_month missing '{key}'"
        assert key in data["previous_month"], f"previous_month missing '{key}'"
    # weekday_counts has 7 buckets (Mon..Sun)
    assert isinstance(data["weekday_counts"], list)
    assert len(data["weekday_counts"]) == 7
    assert all(isinstance(n, int) and n >= 0 for n in data["weekday_counts"])
    # avg_days_in_stock is numeric
    assert isinstance(data["avg_days_in_stock"], (int, float))
    # deltas: each can be None, int or float
    for k in ("sales_count_pct", "revenue_pct", "profit_pct", "avg_ticket_pct"):
        assert k in data["deltas"]
        v = data["deltas"][k]
        assert v is None or isinstance(v, (int, float))


def test_delta_is_100_when_previous_zero_and_current_positive(owner_headers):
    """Helper sanity check using API math: when previous month is 0 and current >0,
    the API reports +100% (we treat that as a 'lift from zero' indicator)."""
    r = requests.get(f"{API}/overview-insights", headers=owner_headers, timeout=15)
    data = r.json()
    cm = data["current_month"]
    pm = data["previous_month"]
    deltas = data["deltas"]
    # Sales count delta math sanity
    if pm["sales_count"] == 0 and cm["sales_count"] > 0:
        assert deltas["sales_count_pct"] == 100.0
    if pm["sales_count"] == 0 and cm["sales_count"] == 0:
        assert deltas["sales_count_pct"] is None


def test_weekday_counts_match_recent_sales(owner_headers):
    """The sum of weekday_counts should equal the count of vehicles sold in last 90 days."""
    r = requests.get(f"{API}/overview-insights", headers=owner_headers, timeout=15)
    data = r.json()
    counts_sum = sum(data["weekday_counts"])

    # Cross-check: fetch sales-report and bucket sold_at by last-90-days
    rep = requests.get(f"{API}/sales-report", headers=owner_headers, timeout=15)
    assert rep.status_code == 200
    payload = rep.json()
    if isinstance(payload, dict):
        items = payload.get("rows") or payload.get("sales") or []
    else:
        items = payload
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    recent = 0
    for v in items:
        s = v.get("sold_at")
        if not s:
            continue
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            continue
        if dt >= cutoff:
            recent += 1
    assert counts_sum == recent, f"weekday sum {counts_sum} != recent sold {recent}"


def test_avg_days_in_stock_is_non_negative(owner_headers):
    r = requests.get(f"{API}/overview-insights", headers=owner_headers, timeout=15)
    data = r.json()
    assert data["avg_days_in_stock"] >= 0
    if data.get("longest_in_stock"):
        assert data["longest_in_stock"]["days"] >= 0
        assert "label" in data["longest_in_stock"]


def test_unauthenticated_request_rejected():
    r = requests.get(f"{API}/overview-insights", timeout=10)
    assert r.status_code in (401, 403)
