"""Global test fixtures + post-session cleanup safety net.

This conftest enforces that NO test-generated rows leak into the production
dealership data. Every test file adds session-scoped autouse fixtures already,
but if any one of them fails before its teardown, leftover rows would stay in
the DB. This sweeper runs at the very end of EVERY pytest invocation and wipes
anything matching common test markers.
"""
import os
import uuid
import bcrypt
from datetime import datetime, timezone
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


# Throwaway test salesperson auto-provisioned at session start, deleted at end.
# Never visible in the team list outside the test run.
TEST_SALES_EMAIL = "joao@intercar.com"
TEST_SALES_PASS = "senha456"
TEST_SALES_NAME = "Joao Silva"

# Throwaway test BDC same idea (used by test_team_management).
TEST_BDC_EMAIL = "bdc@intercar.com"
TEST_BDC_PASS = "bdc1234"
TEST_BDC_NAME = "Natalia"


def _wipe_test_residue(db):
    """Aggressive sweep — anything that looks like test data gets nuked.

    Markers we use: names starting with TEST_, emails like *@e2e-test.com,
    notes containing 'TEST_', VIN starting with TEST.
    """
    r1 = db.lost_sales.delete_many({"$or": [
        {"make": {"$regex": "^TEST", "$options": "i"}},
        {"model": {"$regex": "TEST_", "$options": "i"}},
        {"buyer_name": {"$regex": "^TEST ", "$options": "i"}},
        {"notes": {"$regex": "TEST_", "$options": "i"}},
    ]})
    r2 = db.vehicles.delete_many({"$or": [
        {"make": {"$regex": "^TEST_", "$options": "i"}},
        {"model": {"$regex": "TEST_", "$options": "i"}},
        {"vin": {"$regex": "^TEST"}},
        {"buyer_name": {"$regex": "^TEST ", "$options": "i"}},
    ]})
    r3 = db.salespeople.delete_many({"name": {"$regex": "TEST_", "$options": "i"}})
    r4 = db.operational_expenses.delete_many({"description": {"$regex": "TEST_", "$options": "i"}})
    r5 = db.users.delete_many({"$or": [
        {"full_name": {"$regex": "TEST_|^TEST ", "$options": "i"}},
        {"email": {"$regex": "@e2e-test\\.com|@test-team\\.com|^test_"}},
    ]})
    r6 = db.leads.delete_many({"$or": [
        {"name": {"$regex": "^TEST_", "$options": "i"}},
        {"notes": {"$regex": "TEST_", "$options": "i"}},
    ]})
    r7 = db.dealerships.delete_many({"name": {"$regex": "^TEST_|^E2E_", "$options": "i"}})
    r8 = db.post_sales.delete_many({"$or": [
        {"vin": {"$regex": "^TEST"}},
        {"problem": {"$regex": "TEST_", "$options": "i"}},
        {"work_to_do": {"$regex": "TEST_", "$options": "i"}},
        {"customer_name": {"$regex": "^TEST ", "$options": "i"}},
    ]})
    r9 = db.chat_messages.delete_many({"content": {"$regex": "TEST_", "$options": "i"}})

    return {
        "lost_sales": r1.deleted_count, "vehicles": r2.deleted_count,
        "salespeople": r3.deleted_count, "operational_expenses": r4.deleted_count,
        "users": r5.deleted_count, "leads": r6.deleted_count,
        "dealerships": r7.deleted_count, "post_sales": r8.deleted_count,
        "chat_messages": r9.deleted_count,
    }


def _ensure_test_salesperson(db):
    """Create a throwaway salesperson login used across the test suite.

    Tied to the same dealership as the seeded owner. Idempotent.
    Returns the salesperson_id so callers can reference it.
    """
    owner = db.users.find_one({"email": "carlos@intercar.com"})
    if not owner:
        return None
    dealership_id = owner["dealership_id"]
    sp = db.salespeople.find_one({"name": TEST_SALES_NAME, "dealership_id": dealership_id})
    if not sp:
        sp_doc = {
            "id": str(uuid.uuid4()),
            "name": TEST_SALES_NAME,
            "email": TEST_SALES_EMAIL,
            "phone": "",
            "commission_amount": 500.0,
            "dealership_id": dealership_id,
            "active": True,
            "photo_url": "",
            "photo_public_id": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        db.salespeople.insert_one(sp_doc)
        sp = sp_doc
    pwd_hash = bcrypt.hashpw(TEST_SALES_PASS.encode(), bcrypt.gensalt()).decode()
    db.users.update_one(
        {"email": TEST_SALES_EMAIL},
        {"$set": {
            "id": str(uuid.uuid4()),
            "email": TEST_SALES_EMAIL,
            "password_hash": pwd_hash,
            "full_name": TEST_SALES_NAME,
            "dealership_id": dealership_id,
            "role": "salesperson",
            "salesperson_id": sp["id"],
            "permissions": None,  # use role defaults
            "photo_url": "",
            "photo_public_id": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return sp["id"]


def _drop_test_salesperson(db):
    """Remove the throwaway salesperson login + linked salesperson record."""
    db.users.delete_one({"email": TEST_SALES_EMAIL})
    db.salespeople.delete_many({"name": TEST_SALES_NAME, "email": TEST_SALES_EMAIL})


def _ensure_test_bdc(db):
    """Create a throwaway BDC login. Idempotent."""
    owner = db.users.find_one({"email": "carlos@intercar.com"})
    if not owner:
        return None
    dealership_id = owner["dealership_id"]
    pwd_hash = bcrypt.hashpw(TEST_BDC_PASS.encode(), bcrypt.gensalt()).decode()
    db.users.update_one(
        {"email": TEST_BDC_EMAIL},
        {"$set": {
            "id": str(uuid.uuid4()),
            "email": TEST_BDC_EMAIL,
            "password_hash": pwd_hash,
            "full_name": TEST_BDC_NAME,
            "dealership_id": dealership_id,
            "role": "bdc",
            "salesperson_id": "",
            "permissions": None,  # use role defaults (overview + leads)
            "photo_url": "",
            "photo_public_id": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


def _drop_test_bdc(db):
    db.users.delete_one({"email": TEST_BDC_EMAIL})


@pytest.fixture(scope="session", autouse=True)
def _global_test_cleanup():
    """Runs once at the START of every session AND once at the END.

    Start: catch leftovers from previous interrupted runs + provision the
    throwaway salesperson login the test suite relies on.
    End: catch anything our per-file fixtures missed + remove the test salesperson.
    """
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        yield
        return

    client = MongoClient(mongo_url)
    db = client[db_name]

    # Pre-test cleanup (catches stuff from a previous crashed run)
    pre = _wipe_test_residue(db)
    if any(pre.values()):
        print(f"\n[conftest] Pre-test cleanup wiped: {pre}")
    _ensure_test_salesperson(db)
    _ensure_test_bdc(db)

    yield

    # Post-test cleanup
    post = _wipe_test_residue(db)
    if any(post.values()):
        print(f"\n[conftest] Post-test cleanup wiped: {post}")
    _drop_test_salesperson(db)
    _drop_test_bdc(db)
    client.close()
