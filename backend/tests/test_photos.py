"""Backend tests for team-member photo management.

Coverage:
- PUT /api/me/photo (any role) updates user's photo_url + photo_public_id
- PUT /api/me/photo as salesperson mirrors photo to salespeople collection
- PUT /api/team/{uid}/photo as owner sets photo for any team member,
  and mirrors to salespeople collection if linked
- PUT /api/team/{uid}/photo as salesperson => 403
- PUT /api/team/{uid}/photo when target is owner => 404
- GET /api/team includes photo_url
- GET /api/auth/me includes photo_url
- POST /api/auth/login includes photo_url
- GET /api/leaderboard rows include photo_url
- GET /api/salespeople includes photo_url
- E2E: owner uploads photo -> reflects in /salespeople and /leaderboard
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env file if env var not in this shell
    from dotenv import dotenv_values
    vals = dotenv_values("/app/frontend/.env")
    BASE_URL = (vals.get("REACT_APP_BACKEND_URL") or "").rstrip("/")

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

OWNER = {"email": "carlos@intercar.com", "password": "senha123"}
SALES = {"email": "joao@intercar.com", "password": "senha456"}
BDC = {"email": "bdc@intercar.com", "password": "bdc1234"}

FAKE_URL = "https://res.cloudinary.com/test/image/upload/v1/profiles/test.jpg"
FAKE_PID = "profiles/test"
FAKE_URL_2 = "https://res.cloudinary.com/test/image/upload/v1/profiles/test2.jpg"
FAKE_PID_2 = "profiles/test2"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def owner_session():
    data = _login(**OWNER)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.user = data["user"]
    return s


@pytest.fixture(scope="module")
def sales_session():
    data = _login(**SALES)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.user = data["user"]
    return s


@pytest.fixture(scope="module")
def bdc_session():
    data = _login(**BDC)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.user = data["user"]
    return s


@pytest.fixture(scope="module", autouse=True)
def _revert_photos_at_end(owner_session):
    """Resets all photos to '' at module teardown so we don't pollute state."""
    yield
    # Get all team members and clear their photos via owner endpoint
    try:
        r = owner_session.get(f"{BASE_URL}/api/team", timeout=15)
        if r.status_code == 200:
            for m in r.json().get("members", []):
                owner_session.put(
                    f"{BASE_URL}/api/team/{m['id']}/photo",
                    json={"photo_url": "", "photo_public_id": ""},
                    timeout=15,
                )
        # Owner clears its own
        owner_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )
    except Exception as e:
        print(f"[teardown] photo reset failed: {e}")


# ============ Login & Me responses ============

class TestAuthIncludesPhoto:
    def test_login_includes_photo_url_field(self):
        data = _login(**OWNER)
        assert "photo_url" in data["user"], "POST /auth/login must include user.photo_url"
        assert isinstance(data["user"]["photo_url"], str)

    def test_me_includes_photo_url_field(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "photo_url" in body["user"], "GET /auth/me must include user.photo_url"


# ============ PUT /me/photo ============

class TestUpdateMyPhoto:
    def test_owner_can_update_own_photo(self, owner_session):
        r = owner_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        assert r.json()["photo_url"] == FAKE_URL
        # verify via /me
        me = owner_session.get(f"{BASE_URL}/api/auth/me", timeout=15).json()
        assert me["user"]["photo_url"] == FAKE_URL
        # cleanup
        owner_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )

    def test_bdc_can_update_own_photo(self, bdc_session):
        r = bdc_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": FAKE_URL_2, "photo_public_id": FAKE_PID_2},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify via /auth/me
        me = bdc_session.get(f"{BASE_URL}/api/auth/me", timeout=15).json()
        assert me["user"]["photo_url"] == FAKE_URL_2
        # cleanup
        bdc_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )

    def test_salesperson_update_self_mirrors_to_salespeople(self, sales_session, owner_session):
        # joao's salesperson_id
        sp_id = sales_session.user.get("salesperson_id")
        assert sp_id, "Joao must be linked to a salesperson record"

        # set photo
        r = sales_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # verify on user
        me = sales_session.get(f"{BASE_URL}/api/auth/me", timeout=15).json()
        assert me["user"]["photo_url"] == FAKE_URL

        # verify on salespeople collection (via /salespeople as owner)
        sps = owner_session.get(f"{BASE_URL}/api/salespeople", timeout=15).json()
        joao = next((s for s in sps if s["id"] == sp_id), None)
        assert joao is not None, "Joao salesperson record must exist"
        assert joao.get("photo_url") == FAKE_URL, (
            f"Salesperson record for Joao must mirror photo_url. Got: {joao}"
        )

        # cleanup
        sales_session.put(
            f"{BASE_URL}/api/me/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )


# ============ PUT /team/{uid}/photo ============

class TestSetTeamPhoto:
    def _get_joao_uid(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/team", timeout=15)
        assert r.status_code == 200
        for m in r.json()["members"]:
            if m["email"] == SALES["email"]:
                return m["id"]
        pytest.fail("Joao team member not found")

    def _get_bdc_uid(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/team", timeout=15)
        assert r.status_code == 200
        for m in r.json()["members"]:
            if m["email"] == BDC["email"]:
                return m["id"]
        pytest.fail("BDC team member not found")

    def _get_owner_uid(self, owner_session):
        return owner_session.user["id"]

    def test_owner_sets_photo_for_salesperson(self, owner_session):
        uid = self._get_joao_uid(owner_session)
        r = owner_session.put(
            f"{BASE_URL}/api/team/{uid}/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["photo_url"] == FAKE_URL

        # Verify on /api/team
        team = owner_session.get(f"{BASE_URL}/api/team", timeout=15).json()
        joao = next(m for m in team["members"] if m["id"] == uid)
        assert joao.get("photo_url") == FAKE_URL

        # Mirror to salespeople collection
        sps = owner_session.get(f"{BASE_URL}/api/salespeople", timeout=15).json()
        joao_sp_id = joao.get("salesperson_id")
        joao_sp = next((s for s in sps if s["id"] == joao_sp_id), None)
        assert joao_sp is not None
        assert joao_sp.get("photo_url") == FAKE_URL, (
            f"Owner uploading for Joao must mirror to salespeople. Got: {joao_sp}"
        )

        # cleanup
        owner_session.put(
            f"{BASE_URL}/api/team/{uid}/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )

    def test_owner_sets_photo_for_bdc(self, owner_session):
        uid = self._get_bdc_uid(owner_session)
        r = owner_session.put(
            f"{BASE_URL}/api/team/{uid}/photo",
            json={"photo_url": FAKE_URL_2, "photo_public_id": FAKE_PID_2},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        team = owner_session.get(f"{BASE_URL}/api/team", timeout=15).json()
        bdc = next(m for m in team["members"] if m["id"] == uid)
        assert bdc.get("photo_url") == FAKE_URL_2
        # cleanup
        owner_session.put(
            f"{BASE_URL}/api/team/{uid}/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )

    def test_salesperson_cannot_set_team_photo(self, sales_session, owner_session):
        bdc_uid = self._get_bdc_uid(owner_session)
        r = sales_session.put(
            f"{BASE_URL}/api/team/{bdc_uid}/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_bdc_cannot_set_team_photo(self, bdc_session, owner_session):
        joao_uid = self._get_joao_uid(owner_session)
        r = bdc_session.put(
            f"{BASE_URL}/api/team/{joao_uid}/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 403

    def test_owner_cannot_set_own_photo_via_team_endpoint(self, owner_session):
        """Owners must use /me/photo for self — /team/{self_uid}/photo returns 403."""
        owner_uid = self._get_owner_uid(owner_session)
        r = owner_session.put(
            f"{BASE_URL}/api/team/{owner_uid}/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 403, (
            f"Owner can't photo-edit themselves via /team/{{uid}}/photo (use /me/photo). Got {r.status_code}"
        )

    def test_owner_set_photo_on_unknown_uid_404(self, owner_session):
        r = owner_session.put(
            f"{BASE_URL}/api/team/this-uid-does-not-exist-zzz/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 404


# ============ List endpoints include photo_url ============

class TestListEndpointsIncludePhoto:
    def test_team_list_has_photo_url(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/team", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["members"], "Should have at least one member"
        for m in body["members"]:
            assert "photo_url" in m, f"Member missing photo_url: {m}"

    def test_salespeople_list_has_photo_url(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/salespeople", timeout=15)
        assert r.status_code == 200
        sps = r.json()
        assert sps, "Should have at least one salesperson seeded"
        for sp in sps:
            assert "photo_url" in sp, (
                f"Salesperson record missing photo_url. Pydantic Salesperson model "
                f"likely doesn't declare photo_url field. Got: {sp}"
            )

    def test_leaderboard_rows_include_photo_url(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/leaderboard", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        # leaderboard may be a list of rows or dict — handle both
        if isinstance(rows, dict):
            rows = rows.get("rows") or rows.get("leaderboard") or []
        assert isinstance(rows, list)
        if not rows:
            pytest.skip("Leaderboard is empty — cannot validate photo_url presence")
        for row in rows:
            assert "photo_url" in row, f"Leaderboard row missing photo_url: {row}"


# ============ End-to-end propagation ============

class TestE2EOwnerUploadsForJoao:
    def test_owner_uploads_for_joao_propagates_to_salespeople_and_leaderboard(self, owner_session):
        # 1) find joao uid + salesperson_id
        team = owner_session.get(f"{BASE_URL}/api/team", timeout=15).json()
        joao = next((m for m in team["members"] if m["email"] == SALES["email"]), None)
        assert joao is not None
        joao_uid = joao["id"]
        joao_sp_id = joao["salesperson_id"]

        # 2) owner uploads photo for joao
        r = owner_session.put(
            f"{BASE_URL}/api/team/{joao_uid}/photo",
            json={"photo_url": FAKE_URL, "photo_public_id": FAKE_PID},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # 3) /salespeople reflects it
        sps = owner_session.get(f"{BASE_URL}/api/salespeople", timeout=15).json()
        joao_sp = next((s for s in sps if s["id"] == joao_sp_id), None)
        assert joao_sp is not None
        assert joao_sp.get("photo_url") == FAKE_URL, (
            f"E2E mirror: salespeople should have photo_url. Got: {joao_sp}"
        )

        # 4) leaderboard reflects it for joao's row
        r = owner_session.get(f"{BASE_URL}/api/leaderboard", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        if isinstance(rows, dict):
            rows = rows.get("rows") or rows.get("leaderboard") or []
        joao_row = next((row for row in rows if row.get("salesperson_id") == joao_sp_id), None)
        if joao_row is None:
            pytest.skip("Joao not in leaderboard (no sales) — propagation to leaderboard not testable here")
        assert joao_row.get("photo_url") == FAKE_URL, (
            f"Leaderboard row for Joao must reflect uploaded photo. Got: {joao_row}"
        )

        # 5) cleanup
        owner_session.put(
            f"{BASE_URL}/api/team/{joao_uid}/photo",
            json={"photo_url": "", "photo_public_id": ""},
            timeout=15,
        )

        # 6) verify cleanup propagated
        sps = owner_session.get(f"{BASE_URL}/api/salespeople", timeout=15).json()
        joao_sp = next((s for s in sps if s["id"] == joao_sp_id), None)
        assert joao_sp.get("photo_url") in ("", None), (
            "Cleanup must propagate empty string back to salespeople collection"
        )
