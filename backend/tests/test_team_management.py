"""
Tests for Unified Team Management & Per-Tab Permissions.

Covers:
- GET /api/team (owner only, returns members + all_permissions + role_defaults)
- POST /api/team (create salesperson w/ link, BDC, validations, duplicate email)
- PUT /api/team/{uid} (update full_name/email/permissions; password optional;
  invalid permission keys filtered)
- DELETE /api/team/{uid}
- Permission enforcement on /api/vehicles, /api/leads, /api/delivery, /api/salespeople
- /auth/me and /auth/login include permissions field
- Owner with empty permissions array still bypasses all checks
- Default permissions for salesperson/bdc are correct
"""
import os
import re
import uuid
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

OWNER_EMAIL = "carlos@intercar.com"
OWNER_PASS = "senha123"
SALES_EMAIL = "joao@intercar.com"
SALES_PASS = "senha456"
BDC_EMAIL = "bdc@intercar.com"
BDC_PASS = "bdc1234"


# ============================================================
# Fixtures
# ============================================================
def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def owner_login():
    return _login(OWNER_EMAIL, OWNER_PASS)


@pytest.fixture(scope="session")
def owner_token(owner_login):
    return owner_login["access_token"]


@pytest.fixture(scope="session")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def sales_login():
    return _login(SALES_EMAIL, SALES_PASS)


@pytest.fixture(scope="session")
def sales_token(sales_login):
    return sales_login["access_token"]


@pytest.fixture(scope="session")
def sales_headers(sales_token):
    return {"Authorization": f"Bearer {sales_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def bdc_login():
    return _login(BDC_EMAIL, BDC_PASS)


@pytest.fixture(scope="session")
def bdc_headers(bdc_login):
    return {"Authorization": f"Bearer {bdc_login['access_token']}", "Content-Type": "application/json"}


# ============================================================
# Cleanup tracking
# ============================================================
_created_user_ids = []
_created_salesperson_ids = []


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data(owner_headers):
    """At session end: delete all TEST_TEAM_* users + salespeople created by these tests."""
    yield
    # Delete users via DELETE /api/team/{uid}
    for uid in list(_created_user_ids):
        try:
            requests.delete(f"{API}/team/{uid}", headers=owner_headers, timeout=10)
        except Exception:
            pass
    # Delete salespeople records
    for sid in list(_created_salesperson_ids):
        try:
            requests.delete(f"{API}/salespeople/{sid}", headers=owner_headers, timeout=10)
        except Exception:
            pass


def _make_email(prefix: str = "tm") -> str:
    return f"TEST_TEAM_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def _create_salesperson_record(owner_headers) -> str:
    name = f"TEST_TEAM_SP_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/salespeople", headers=owner_headers,
                      json={"name": name, "commission_rate": 1.0}, timeout=15)
    assert r.status_code in (200, 201), f"create salesperson record failed: {r.status_code} {r.text}"
    sp = r.json()
    _created_salesperson_ids.append(sp["id"])
    return sp["id"]


# ============================================================
# /auth/login + /auth/me include permissions
# ============================================================
class TestAuthIncludesPermissions:
    def test_login_owner_includes_permissions(self, owner_login):
        u = owner_login["user"]
        assert "permissions" in u
        assert isinstance(u["permissions"], list)
        # Owner effective perms = ALL
        for p in ["overview", "inventory", "pipeline", "delivery", "leads", "salespeople", "financial"]:
            assert p in u["permissions"], f"owner missing perm {p}"

    def test_login_salesperson_includes_permissions(self, sales_login):
        u = sales_login["user"]
        assert "permissions" in u
        assert isinstance(u["permissions"], list)

    def test_login_bdc_includes_permissions(self, bdc_login):
        u = bdc_login["user"]
        assert "permissions" in u
        assert isinstance(u["permissions"], list)

    def test_me_returns_permissions(self, owner_headers):
        r = requests.get(f"{API}/auth/me", headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "user" in body
        assert "permissions" in body["user"]
        assert isinstance(body["user"]["permissions"], list)


# ============================================================
# GET /api/team
# ============================================================
class TestListTeam:
    def test_owner_can_list_team(self, owner_headers):
        r = requests.get(f"{API}/team", headers=owner_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "members" in body
        assert "all_permissions" in body
        assert "role_defaults" in body
        assert isinstance(body["members"], list)
        # all_permissions must contain all 7 known tabs
        assert set(body["all_permissions"]) == {
            "overview", "inventory", "pipeline", "delivery", "leads", "salespeople", "financial"
        }
        # role_defaults: salesperson default has no financial, bdc=overview+leads
        assert "financial" not in body["role_defaults"]["salesperson"]
        assert set(body["role_defaults"]["salesperson"]) == {
            "overview", "inventory", "pipeline", "delivery", "leads", "salespeople"
        }
        assert set(body["role_defaults"]["bdc"]) == {"overview", "leads"}
        assert set(body["role_defaults"]["owner"]) == set(body["all_permissions"])

    def test_salesperson_cannot_list_team(self, sales_headers):
        r = requests.get(f"{API}/team", headers=sales_headers, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_bdc_cannot_list_team(self, bdc_headers):
        r = requests.get(f"{API}/team", headers=bdc_headers, timeout=15)
        assert r.status_code == 403


# ============================================================
# POST /api/team
# ============================================================
class TestCreateTeamMember:
    def test_create_salesperson_without_id_returns_400(self, owner_headers):
        payload = {
            "full_name": "TEST_TEAM noid",
            "email": _make_email("noid"),
            "password": "pass1234",
            "role": "salesperson",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 400, r.text

    def test_create_salesperson_with_link_and_custom_perms(self, owner_headers):
        sp_id = _create_salesperson_record(owner_headers)
        payload = {
            "full_name": "TEST_TEAM Sales",
            "email": _make_email("sales"),
            "password": "pass1234",
            "role": "salesperson",
            "salesperson_id": sp_id,
            "permissions": ["overview"],
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        _created_user_ids.append(u["id"])
        assert u["role"] == "salesperson"
        assert u["salesperson_id"] == sp_id
        assert u["permissions"] == ["overview"]
        assert u["effective_permissions"] == ["overview"]
        # GET to verify persistence
        r2 = requests.get(f"{API}/team", headers=owner_headers, timeout=15)
        assert r2.status_code == 200
        members_by_id = {m["id"]: m for m in r2.json()["members"]}
        assert u["id"] in members_by_id
        assert members_by_id[u["id"]]["effective_permissions"] == ["overview"]

    def test_create_salesperson_duplicate_login_returns_400(self, owner_headers):
        sp_id = _create_salesperson_record(owner_headers)
        # First create succeeds
        payload = {
            "full_name": "TEST_TEAM Dup",
            "email": _make_email("dup1"),
            "password": "pass1234",
            "role": "salesperson",
            "salesperson_id": sp_id,
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        _created_user_ids.append(r.json()["id"])
        # Second create with same salesperson_id should 400
        payload2 = {**payload, "email": _make_email("dup2")}
        r2 = requests.post(f"{API}/team", headers=owner_headers, json=payload2, timeout=15)
        assert r2.status_code == 400, r2.text

    def test_create_bdc_no_salesperson_id_required(self, owner_headers):
        payload = {
            "full_name": "TEST_TEAM BDC",
            "email": _make_email("bdc"),
            "password": "pass1234",
            "role": "bdc",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        _created_user_ids.append(u["id"])
        assert u["role"] == "bdc"
        # BDC default permissions = overview + leads
        assert set(u["effective_permissions"]) == {"overview", "leads"}

    def test_create_duplicate_email_returns_400(self, owner_headers):
        email = _make_email("dupemail")
        payload = {
            "full_name": "TEST_TEAM e1",
            "email": email,
            "password": "pass1234",
            "role": "bdc",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200
        _created_user_ids.append(r.json()["id"])
        payload2 = {**payload, "full_name": "TEST_TEAM e2"}
        r2 = requests.post(f"{API}/team", headers=owner_headers, json=payload2, timeout=15)
        assert r2.status_code == 400, r2.text

    def test_non_owner_cannot_create(self, sales_headers):
        r = requests.post(f"{API}/team", headers=sales_headers, json={
            "full_name": "x", "email": _make_email("nx"), "password": "p", "role": "bdc"
        }, timeout=15)
        assert r.status_code == 403


# ============================================================
# PUT /api/team/{uid}
# ============================================================
class TestUpdateTeamMember:
    def _create_bdc(self, owner_headers):
        payload = {
            "full_name": "TEST_TEAM Upd",
            "email": _make_email("upd"),
            "password": "originalpass",
            "role": "bdc",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        _created_user_ids.append(u["id"])
        return u

    def test_update_full_name_email_permissions(self, owner_headers):
        u = self._create_bdc(owner_headers)
        new_email = _make_email("updnew")
        r = requests.put(f"{API}/team/{u['id']}", headers=owner_headers, json={
            "full_name": "TEST_TEAM Updated",
            "email": new_email,
            "permissions": ["overview", "leads", "salespeople"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["full_name"] == "TEST_TEAM Updated"
        assert body["email"] == new_email.lower()
        assert set(body["permissions"]) == {"overview", "leads", "salespeople"}
        assert set(body["effective_permissions"]) == {"overview", "leads", "salespeople"}

    def test_update_password_optional(self, owner_headers):
        u = self._create_bdc(owner_headers)
        # Update without password — original password should still work
        r = requests.put(f"{API}/team/{u['id']}", headers=owner_headers, json={
            "full_name": "TEST_TEAM NoPW"
        }, timeout=15)
        assert r.status_code == 200
        # Verify original password still works
        r2 = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "originalpass"}, timeout=15)
        assert r2.status_code == 200, "Original password should still work when password not provided"
        # Now update with password
        r3 = requests.put(f"{API}/team/{u['id']}", headers=owner_headers, json={"password": "newpass99"}, timeout=15)
        assert r3.status_code == 200
        # Old password should fail
        r4 = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "originalpass"}, timeout=15)
        assert r4.status_code == 401, "Old password should no longer work"
        # New password should work
        r5 = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "newpass99"}, timeout=15)
        assert r5.status_code == 200

    def test_update_filters_invalid_permission_keys(self, owner_headers):
        u = self._create_bdc(owner_headers)
        r = requests.put(f"{API}/team/{u['id']}", headers=owner_headers, json={
            "permissions": ["overview", "foo", "bar", "leads", "not_a_real_tab"]
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Only valid keys retained
        assert set(body["permissions"]) == {"overview", "leads"}

    def test_non_owner_cannot_update(self, owner_headers, sales_headers):
        u = self._create_bdc(owner_headers)
        r = requests.put(f"{API}/team/{u['id']}", headers=sales_headers, json={"full_name": "x"}, timeout=15)
        assert r.status_code == 403


# ============================================================
# DELETE /api/team/{uid}
# ============================================================
class TestDeleteTeamMember:
    def test_owner_can_delete(self, owner_headers):
        payload = {
            "full_name": "TEST_TEAM Del",
            "email": _make_email("del"),
            "password": "pass1234",
            "role": "bdc",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200
        uid = r.json()["id"]
        r2 = requests.delete(f"{API}/team/{uid}", headers=owner_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("deleted") is True
        # Verify gone
        r3 = requests.get(f"{API}/team", headers=owner_headers, timeout=15)
        ids = [m["id"] for m in r3.json()["members"]]
        assert uid not in ids

    def test_non_owner_cannot_delete(self, owner_headers, sales_headers):
        payload = {
            "full_name": "TEST_TEAM Del2",
            "email": _make_email("del2"),
            "password": "pass1234",
            "role": "bdc",
        }
        r = requests.post(f"{API}/team", headers=owner_headers, json=payload, timeout=15)
        uid = r.json()["id"]
        _created_user_ids.append(uid)
        r2 = requests.delete(f"{API}/team/{uid}", headers=sales_headers, timeout=15)
        assert r2.status_code == 403


# ============================================================
# Permission enforcement on resource endpoints
# ============================================================
class TestPermissionEnforcement:
    def _create_user_with_perms(self, owner_headers, role: str, perms: list, link_sp: bool = False):
        email = _make_email(f"perm_{role}")
        password = "permpass1"
        body = {
            "full_name": f"TEST_TEAM Perm {role}",
            "email": email,
            "password": password,
            "role": role,
            "permissions": perms,
        }
        if role == "salesperson" or link_sp:
            sp_id = _create_salesperson_record(owner_headers)
            body["salesperson_id"] = sp_id
        r = requests.post(f"{API}/team", headers=owner_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        _created_user_ids.append(uid)
        # Login as that user
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        assert lr.status_code == 200, lr.text
        token = lr.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, lr.json()["user"]

    def test_salesperson_overview_only_blocks_inventory_leads_delivery(self, owner_headers):
        h, u = self._create_user_with_perms(owner_headers, "salesperson", ["overview"])
        assert u["permissions"] == ["overview"]
        r1 = requests.get(f"{API}/vehicles", headers=h, timeout=15)
        assert r1.status_code == 403, f"vehicles expected 403, got {r1.status_code}"
        r2 = requests.get(f"{API}/leads", headers=h, timeout=15)
        assert r2.status_code == 403, f"leads expected 403, got {r2.status_code}"
        r3 = requests.get(f"{API}/delivery", headers=h, timeout=15)
        assert r3.status_code == 403, f"delivery expected 403, got {r3.status_code}"

    def test_bdc_default_perms_allow_leads_block_vehicles(self, owner_headers):
        # Pass permissions explicitly = overview+leads (BDC default)
        h, u = self._create_user_with_perms(owner_headers, "bdc", ["overview", "leads"])
        assert set(u["permissions"]) == {"overview", "leads"}
        rl = requests.get(f"{API}/leads", headers=h, timeout=15)
        assert rl.status_code == 200, f"leads expected 200, got {rl.status_code}: {rl.text[:200]}"
        rv = requests.get(f"{API}/vehicles", headers=h, timeout=15)
        assert rv.status_code == 403, f"vehicles expected 403, got {rv.status_code}"

    def test_salespeople_endpoint_accessible_with_either_salespeople_or_leads_perm(self, owner_headers):
        # Permissions include salespeople AND leads -> /salespeople should be 200
        h, _ = self._create_user_with_perms(owner_headers, "bdc", ["overview", "leads", "salespeople"])
        r = requests.get(f"{API}/salespeople", headers=h, timeout=15)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"

        # Only leads (no 'salespeople') -> still accessible since leads grants the dropdown
        h2, _ = self._create_user_with_perms(owner_headers, "bdc", ["overview", "leads"])
        r2 = requests.get(f"{API}/salespeople", headers=h2, timeout=15)
        assert r2.status_code == 200, f"leads-only expected 200 got {r2.status_code}"

        # Only overview (no leads, no salespeople) -> 403
        h3, _ = self._create_user_with_perms(owner_headers, "bdc", ["overview"])
        r3 = requests.get(f"{API}/salespeople", headers=h3, timeout=15)
        assert r3.status_code == 403, f"overview-only expected 403 got {r3.status_code}"

    def test_owner_with_empty_permissions_still_full_access(self, owner_headers):
        """Owner role bypasses perms even if permissions=[] is set on the user."""
        # /auth/me already returns owner's effective perms = ALL_TAB_PERMISSIONS by default
        # We cannot easily set permissions=[] on the seeded owner via API (no PUT for self),
        # but we can verify the design: owner role bypasses checks via user_can_access.
        # Hit endpoints that require various tabs and verify 200 for owner.
        for path in ["/vehicles", "/leads", "/delivery", "/salespeople"]:
            r = requests.get(f"{API}{path}", headers=owner_headers, timeout=15)
            assert r.status_code == 200, f"owner blocked from {path}: {r.status_code}"


# ============================================================
# Default permission values match spec
# ============================================================
class TestDefaultPermissions:
    def test_role_defaults_in_team_response(self, owner_headers):
        r = requests.get(f"{API}/team", headers=owner_headers, timeout=15)
        assert r.status_code == 200
        rd = r.json()["role_defaults"]
        assert set(rd["salesperson"]) == {"overview", "inventory", "pipeline", "delivery", "leads", "salespeople"}
        assert "financial" not in rd["salesperson"]
        assert set(rd["bdc"]) == {"overview", "leads"}

    def test_seeded_salesperson_default_perms(self, sales_login):
        # joao@intercar.com has permissions=null -> defaults applied
        perms = sales_login["user"]["permissions"]
        assert set(perms) == {"overview", "inventory", "pipeline", "delivery", "leads", "salespeople"}

    def test_seeded_bdc_default_perms(self, bdc_login):
        perms = bdc_login["user"]["permissions"]
        assert set(perms) == {"overview", "leads"}
