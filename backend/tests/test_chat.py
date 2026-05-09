"""Backend tests for the Chat feature.

Covers:
- RBAC: anyone authenticated can use chat, but DM rooms enforce membership
- Send / list / edit / delete messages (own only, except owner who can delete any)
- Soft delete: deleted=True, content cleared, marker visible to others
- Unread tracking: messages from others count, your own don't, mark-read clears
- Online presence: heartbeat updates last_seen on every chat call
"""
import os
import re
import time
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
BDC = {"email": "bdc@intercar.com", "password": "bdc1234"}


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=20)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def owner_session():
    r = _login(OWNER)
    assert r.status_code == 200
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"], "name": r.json()["user"]["full_name"]}


@pytest.fixture(scope="module")
def sales_session():
    r = _login(SALES)
    if r.status_code != 200:
        pytest.skip(f"salesperson login failed: {r.status_code}")
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"], "name": r.json()["user"]["full_name"]}


@pytest.fixture(scope="module")
def bdc_session():
    r = _login(BDC)
    if r.status_code != 200:
        pytest.skip(f"bdc login failed: {r.status_code}")
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"], "name": r.json()["user"]["full_name"]}


def _dm_room(a, b):
    return f"dm:{'_'.join(sorted([a, b]))}"


@pytest.fixture(autouse=True)
def _cleanup_after():
    yield
    # Sweeper handled by conftest, but be safe — purge any test markers still around
    # via a fresh login. Conftest hook will catch the rest.


# ============================================================
# Users + presence
# ============================================================
class TestChatUsers:
    def test_owner_sees_all_users(self, owner_session):
        r = requests.get(f"{API}/chat/users", headers=_auth(owner_session["token"]), timeout=20)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        ids = [u["id"] for u in users]
        assert owner_session["id"] in ids
        # is_self flag is correctly set on me
        me = next(u for u in users if u["id"] == owner_session["id"])
        assert me["is_self"] is True

    def test_heartbeat_makes_user_online(self, owner_session):
        # Calling chat/users counts as a heartbeat
        requests.get(f"{API}/chat/users", headers=_auth(owner_session["token"]), timeout=20)
        r = requests.get(f"{API}/chat/users", headers=_auth(owner_session["token"]), timeout=20)
        users = r.json()
        me = next(u for u in users if u["id"] == owner_session["id"])
        assert me["online"] is True


# ============================================================
# Team room messaging
# ============================================================
class TestTeamRoom:
    def test_send_list_edit_delete_team(self, owner_session, sales_session):
        # Owner sends to team
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(owner_session["token"]),
            json={"room_id": "team", "content": "TEST_chat hello team"},
            timeout=20,
        )
        assert r.status_code == 200
        msg = r.json()
        msg_id = msg["id"]
        assert msg["sender_id"] == owner_session["id"]
        assert msg["content"] == "TEST_chat hello team"
        assert msg["deleted"] is False
        assert msg["edited_at"] in (None, "")

        # Sales sees it via list
        r = requests.get(
            f"{API}/chat/messages",
            headers=_auth(sales_session["token"]),
            params={"room_id": "team"},
            timeout=20,
        )
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert msg_id in ids

        # Sales cannot edit owner's message
        r = requests.put(
            f"{API}/chat/messages/{msg_id}",
            headers=_auth(sales_session["token"]),
            json={"content": "TEST_chat hacked"},
            timeout=20,
        )
        assert r.status_code == 403

        # Owner edits own
        r = requests.put(
            f"{API}/chat/messages/{msg_id}",
            headers=_auth(owner_session["token"]),
            json={"content": "TEST_chat edited"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["content"] == "TEST_chat edited"
        assert r.json()["edited_at"]

        # Owner soft-deletes
        r = requests.delete(
            f"{API}/chat/messages/{msg_id}",
            headers=_auth(owner_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200

        # Sales now sees it as deleted (still listed but deleted=True, content empty)
        r = requests.get(
            f"{API}/chat/messages",
            headers=_auth(sales_session["token"]),
            params={"room_id": "team"},
            timeout=20,
        )
        deleted = next((m for m in r.json() if m["id"] == msg_id), None)
        assert deleted is not None
        assert deleted["deleted"] is True
        assert deleted["content"] == ""

    def test_empty_message_rejected(self, owner_session):
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(owner_session["token"]),
            json={"room_id": "team", "content": "   ", "attachments": []},
            timeout=20,
        )
        assert r.status_code == 400


# ============================================================
# DM rooms — membership enforced
# ============================================================
class TestDmRooms:
    def test_dm_only_participants(self, owner_session, sales_session, bdc_session):
        room = _dm_room(owner_session["id"], sales_session["id"])
        # Owner sends DM
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(owner_session["token"]),
            json={"room_id": room, "content": "TEST_chat private to sales"},
            timeout=20,
        )
        assert r.status_code == 200
        msg_id = r.json()["id"]
        # Sales can read
        r = requests.get(
            f"{API}/chat/messages",
            headers=_auth(sales_session["token"]),
            params={"room_id": room},
            timeout=20,
        )
        assert r.status_code == 200
        assert any(m["id"] == msg_id for m in r.json())
        # BDC (not in DM) is denied
        r = requests.get(
            f"{API}/chat/messages",
            headers=_auth(bdc_session["token"]),
            params={"room_id": room},
            timeout=20,
        )
        assert r.status_code == 403
        # BDC cannot send into someone else's DM either
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(bdc_session["token"]),
            json={"room_id": room, "content": "TEST_chat intrusion"},
            timeout=20,
        )
        assert r.status_code == 403
        # Cleanup
        requests.delete(f"{API}/chat/messages/{msg_id}", headers=_auth(owner_session["token"]), timeout=20)


# ============================================================
# Unread tracking
# ============================================================
class TestUnread:
    def test_unread_counts_then_marks_read(self, owner_session, sales_session):
        # Both users mark team as read FIRST so any old messages (incl. system
        # notifications from past application submissions) don't pollute counts.
        for sess in (owner_session, sales_session):
            requests.post(
                f"{API}/chat/read",
                headers=_auth(sess["token"]),
                json={"room_id": "team"},
                timeout=20,
            )
        time.sleep(0.5)

        # Owner sends 2 messages in team
        ids = []
        for i in range(2):
            r = requests.post(
                f"{API}/chat/messages",
                headers=_auth(owner_session["token"]),
                json={"room_id": "team", "content": f"TEST_chat unread {i}"},
                timeout=20,
            )
            assert r.status_code == 200
            ids.append(r.json()["id"])

        # Sales sees unread=2
        r = requests.get(f"{API}/chat/unread", headers=_auth(sales_session["token"]), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["team"] >= 2
        assert d["total"] >= 2

        # Owner sees own messages NOT counted
        r = requests.get(f"{API}/chat/unread", headers=_auth(owner_session["token"]), timeout=20)
        d2 = r.json()
        # Owner's count for team should be 0 (they sent everything)
        assert d2["team"] == 0

        # Sales marks team read
        r = requests.post(
            f"{API}/chat/read",
            headers=_auth(sales_session["token"]),
            json={"room_id": "team"},
            timeout=20,
        )
        assert r.status_code == 200
        # Now unread back to 0
        r = requests.get(f"{API}/chat/unread", headers=_auth(sales_session["token"]), timeout=20)
        assert r.json()["team"] == 0

        # Cleanup
        for mid in ids:
            requests.delete(f"{API}/chat/messages/{mid}", headers=_auth(owner_session["token"]), timeout=20)
