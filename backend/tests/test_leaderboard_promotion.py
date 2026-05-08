"""Backend tests for the new Painel/Overview features:

1) GET /api/leaderboard
   - Ranking by car count (desc) with rank field (ties share rank, next jumps)
   - Owner response includes 'revenue' per row; salesperson response does NOT
   - year/month query filter
   - Includes salespeople with zero sales

2) GET /api/promotion (visible to owner AND salesperson)
   PUT /api/promotion (owner only -> 200; salesperson -> 403)
   - Persists title/description/image_url/valid_until
   - Adds updated_at + updated_by

3) Side change in PUT /api/vehicles/{vid}: passing only salesperson_id
   auto-populates salesperson_name from the salespeople collection.

Cleanup at session end: delete TEST_ vehicles + TEST_ salespeople created by
this suite, and reset the dealership promotion to empty.
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


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=20)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Session fixtures ----------------
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
def joao_info(salesperson_token):
    r = requests.get(f"{API}/auth/me", headers=_auth(salesperson_token), timeout=20)
    assert r.status_code == 200
    return r.json().get("user") or r.json()


@pytest.fixture(scope="session")
def created_resources():
    """Bag for cleanup at session end."""
    bag = {"vehicles": [], "salespeople": []}
    yield bag


@pytest.fixture(scope="session", autouse=True)
def _session_cleanup(owner_token, created_resources):
    yield
    # Delete TEST vehicles
    for vid in created_resources["vehicles"]:
        try:
            requests.delete(f"{API}/vehicles/{vid}", headers=_auth(owner_token), timeout=20)
        except Exception:
            pass
    # Delete TEST salespeople
    for sid in created_resources["salespeople"]:
        try:
            requests.delete(f"{API}/salespeople/{sid}", headers=_auth(owner_token), timeout=20)
        except Exception:
            pass
    # Reset promotion (clear everything)
    try:
        requests.put(
            f"{API}/promotion",
            json={"title": "", "description": "", "image_url": "", "valid_until": ""},
            headers=_auth(owner_token), timeout=20,
        )
    except Exception:
        pass


# ============================================================
# LEADERBOARD
# ============================================================
class TestLeaderboardShape:
    def test_owner_basic_shape(self, owner_token):
        r = requests.get(f"{API}/leaderboard", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("year", "month", "rows", "total_sold"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["rows"], list)
        for row in d["rows"]:
            assert "salesperson_id" in row
            assert "salesperson_name" in row
            assert "count" in row and isinstance(row["count"], int)
            assert "rank" in row and isinstance(row["rank"], int)
            # Owner sees revenue
            assert "revenue" in row, f"owner row missing revenue: {row}"

    def test_salesperson_no_revenue(self, salesperson_token):
        r = requests.get(f"{API}/leaderboard", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("rows"), list)
        for row in d["rows"]:
            assert "revenue" not in row, f"salesperson row leaked revenue: {row}"
            assert "salesperson_id" in row
            assert "salesperson_name" in row
            assert "count" in row
            assert "rank" in row

    def test_year_month_filter(self, owner_token):
        # Far future month must return zero counts (full team still listed)
        r = requests.get(f"{API}/leaderboard?year=2030&month=5", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["year"] == 2030 and d["month"] == 5
        assert d["total_sold"] == 0
        assert all(row["count"] == 0 for row in d["rows"])

    def test_zero_sales_salespeople_included(self, owner_token, created_resources):
        # Create a brand-new TEST salesperson; they should appear in the leaderboard
        sp_payload = {"name": f"TEST_LB_Zero_{uuid.uuid4().hex[:5]}", "commission_amount": 100}
        r = requests.post(f"{API}/salespeople", json=sp_payload, headers=_auth(owner_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        sp = r.json()
        created_resources["salespeople"].append(sp["id"])

        # Far future month -> our new sp must be in the list with count=0
        r = requests.get(f"{API}/leaderboard?year=2030&month=5", headers=_auth(owner_token), timeout=20)
        d = r.json()
        ids = [row["salesperson_id"] for row in d["rows"]]
        assert sp["id"] in ids, f"new TEST salesperson missing from full team: ids={ids}"
        my_row = next(row for row in d["rows"] if row["salesperson_id"] == sp["id"])
        assert my_row["count"] == 0
        assert my_row["salesperson_name"] == sp_payload["name"]


class TestLeaderboardTies:
    """Create two TEST salespeople, sell one car for each in current month,
    and verify both share rank 1 (tie) with the next entry jumping to 3.
    """
    @pytest.fixture(scope="class")
    def tie_setup(self, owner_token, created_resources):
        # Two new salespeople
        sp_a = requests.post(
            f"{API}/salespeople",
            json={"name": f"TEST_LB_Tie_A_{uuid.uuid4().hex[:5]}", "commission_amount": 100},
            headers=_auth(owner_token), timeout=20,
        ).json()
        sp_b = requests.post(
            f"{API}/salespeople",
            json={"name": f"TEST_LB_Tie_B_{uuid.uuid4().hex[:5]}", "commission_amount": 100},
            headers=_auth(owner_token), timeout=20,
        ).json()
        created_resources["salespeople"].extend([sp_a["id"], sp_b["id"]])

        vids = []
        for label, sp in (("A", sp_a), ("B", sp_b)):
            # Create vehicle
            v = requests.post(
                f"{API}/vehicles",
                json={
                    "make": "TEST_LB", "model": f"Tie{label}_{uuid.uuid4().hex[:5]}",
                    "year": 2022, "purchase_price": 10000,
                    "asking_price": 15000, "status": "in_stock",
                },
                headers=_auth(owner_token), timeout=20,
            ).json()
            vids.append(v["id"])
            created_resources["vehicles"].append(v["id"])
            # Sell as owner, assigning sp via salesperson_id ONLY (test side change too)
            sell_payload = {
                "status": "sold",
                "sold_price": 15000,
                "buyer_name": f"TEST_Buyer_{label}",
                "salesperson_id": sp["id"],
                # NOTE: NOT sending salesperson_name -> server must auto-populate
            }
            r = requests.put(
                f"{API}/vehicles/{v['id']}",
                json=sell_payload,
                headers=_auth(owner_token), timeout=20,
            )
            assert r.status_code == 200, r.text
            sold = r.json()
            assert sold.get("salesperson_name") == sp["name"], (
                f"PUT /vehicles must auto-populate salesperson_name from salespeople collection. "
                f"got={sold.get('salesperson_name')!r}, expected={sp['name']!r}"
            )

        return {"sp_a": sp_a, "sp_b": sp_b, "vids": vids}

    def test_ties_share_rank_and_next_jumps(self, owner_token, tie_setup):
        sp_a = tie_setup["sp_a"]
        sp_b = tie_setup["sp_b"]
        r = requests.get(f"{API}/leaderboard", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]

        row_a = next((r for r in rows if r["salesperson_id"] == sp_a["id"]), None)
        row_b = next((r for r in rows if r["salesperson_id"] == sp_b["id"]), None)
        assert row_a is not None and row_b is not None

        # Both have count=1 (this month)
        assert row_a["count"] >= 1
        assert row_b["count"] >= 1
        assert row_a["count"] == row_b["count"], (
            f"Tie setup invalid: a={row_a['count']} b={row_b['count']}"
        )

        # Owner sees revenue field
        assert "revenue" in row_a and "revenue" in row_b
        assert float(row_a["revenue"]) >= 15000.0
        assert float(row_b["revenue"]) >= 15000.0

        # Same rank for ties
        assert row_a["rank"] == row_b["rank"], (
            f"Ties must share rank: a={row_a['rank']} b={row_b['rank']}"
        )

        # Verify the next (lower) rank entry jumps. Find the first row with a
        # strictly lower count and confirm its rank > tied_rank by at least
        # the size of the tied group.
        tied_count = row_a["count"]
        tied_rank = row_a["rank"]
        tied_size = sum(1 for r in rows if r["count"] == tied_count and r["rank"] == tied_rank)
        next_below = next((r for r in rows if r["count"] < tied_count), None)
        if next_below is not None:
            assert next_below["rank"] >= tied_rank + tied_size, (
                f"After tie of {tied_size} at rank {tied_rank}, next rank should be "
                f">= {tied_rank + tied_size}; got {next_below['rank']} for {next_below}"
            )

    def test_total_sold_consistent(self, owner_token, tie_setup):
        r = requests.get(f"{API}/leaderboard", headers=_auth(owner_token), timeout=20).json()
        assert r["total_sold"] == sum(row["count"] for row in r["rows"])


# ============================================================
# PROMOTION
# ============================================================
class TestPromotion:
    def test_get_owner(self, owner_token):
        r = requests.get(f"{API}/promotion", headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)
        # Always has the four canonical keys
        for k in ("title", "description", "image_url", "valid_until"):
            assert k in d, f"missing key {k} in {d}"

    def test_get_salesperson_no_403(self, salesperson_token):
        r = requests.get(f"{API}/promotion", headers=_auth(salesperson_token), timeout=20)
        assert r.status_code == 200, f"salesperson must be able to read promotion, got {r.status_code} {r.text}"

    def test_put_salesperson_forbidden(self, salesperson_token):
        r = requests.put(
            f"{API}/promotion",
            json={"title": "TEST_HACK", "description": "x", "image_url": "", "valid_until": ""},
            headers=_auth(salesperson_token), timeout=20,
        )
        assert r.status_code == 403, f"expected 403 for salesperson PUT, got {r.status_code} {r.text}"

    def test_put_owner_persists_and_e2e(self, owner_token, salesperson_token):
        promo = {
            "title": "TEST_PROMO Black Friday",
            "description": "Toda a frota com 5% off",
            "image_url": "https://example.com/p.jpg",
            "valid_until": "2030-12-31",
        }
        r = requests.put(f"{API}/promotion", json=promo, headers=_auth(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        for k, v in promo.items():
            assert body.get(k) == v, f"PUT response field {k} mismatch: {body.get(k)!r} vs {v!r}"
        assert body.get("updated_at"), "updated_at must be set"
        assert body.get("updated_by"), "updated_by must be set"
        # updated_at parseable as ISO datetime
        try:
            datetime.fromisoformat(body["updated_at"].replace("Z", "+00:00"))
        except Exception as e:
            pytest.fail(f"updated_at not ISO: {body['updated_at']} ({e})")

        # Owner GET shows it
        r = requests.get(f"{API}/promotion", headers=_auth(owner_token), timeout=20).json()
        for k, v in promo.items():
            assert r.get(k) == v
        assert r.get("updated_at") == body["updated_at"]
        assert r.get("updated_by") == body["updated_by"]

        # Salesperson GET sees the SAME content (full visibility, no money-stripping needed here)
        r2 = requests.get(f"{API}/promotion", headers=_auth(salesperson_token), timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        for k, v in promo.items():
            assert d2.get(k) == v, f"salesperson sees stale/different promo: {k} {d2.get(k)!r} vs {v!r}"

    def test_clear_promotion_returns_empty_strings(self, owner_token):
        r = requests.put(
            f"{API}/promotion",
            json={"title": "", "description": "", "image_url": "", "valid_until": ""},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        for k in ("title", "description", "image_url", "valid_until"):
            assert d[k] == ""


# ============================================================
# Side change: PUT /api/vehicles/{vid} salesperson_id auto-populates name
# (also exercised in TestLeaderboardTies, but verified standalone here)
# ============================================================
class TestVehicleSalespersonAutoName:
    def test_only_salesperson_id_populates_name(self, owner_token, joao_info, created_resources):
        sp_id = joao_info.get("salesperson_id")
        if not sp_id:
            pytest.skip("joao salesperson_id not available")
        # Look up Joao's name from salespeople collection (via list)
        sps = requests.get(f"{API}/salespeople", headers=_auth(owner_token), timeout=20).json()
        joao = next((s for s in sps if s["id"] == sp_id), None)
        assert joao is not None, "joao not found in salespeople list"
        expected_name = joao["name"]

        # Create a TEST vehicle
        v = requests.post(
            f"{API}/vehicles",
            json={
                "make": "TEST_LB", "model": f"AutoName_{uuid.uuid4().hex[:5]}",
                "year": 2021, "purchase_price": 9000,
                "asking_price": 12000, "status": "in_stock",
            },
            headers=_auth(owner_token), timeout=20,
        ).json()
        created_resources["vehicles"].append(v["id"])

        # PUT with ONLY salesperson_id (no name, no status change)
        r = requests.put(
            f"{API}/vehicles/{v['id']}",
            json={"salesperson_id": sp_id},
            headers=_auth(owner_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd.get("salesperson_id") == sp_id
        assert upd.get("salesperson_name") == expected_name, (
            f"server must auto-populate salesperson_name from salespeople collection. "
            f"got={upd.get('salesperson_name')!r}, expected={expected_name!r}"
        )

        # Re-GET to confirm persistence
        g = requests.get(f"{API}/vehicles/{v['id']}", headers=_auth(owner_token), timeout=20).json()
        assert g.get("salesperson_id") == sp_id
        assert g.get("salesperson_name") == expected_name
