"""Global test fixtures + post-session cleanup safety net.

This conftest enforces that NO test-generated rows leak into the production
dealership data. Every test file adds session-scoped autouse fixtures already,
but if any one of them fails before its teardown, leftover rows would stay in
the DB. This sweeper runs at the very end of EVERY pytest invocation and wipes
anything matching common test markers.
"""
import os
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


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

    return {
        "lost_sales": r1.deleted_count, "vehicles": r2.deleted_count,
        "salespeople": r3.deleted_count, "operational_expenses": r4.deleted_count,
        "users": r5.deleted_count, "leads": r6.deleted_count,
        "dealerships": r7.deleted_count,
    }


@pytest.fixture(scope="session", autouse=True)
def _global_test_cleanup():
    """Runs once at the START of every session AND once at the END.

    Start: catch leftovers from previous interrupted runs.
    End: catch anything our per-file fixtures missed.
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

    yield

    # Post-test cleanup
    post = _wipe_test_residue(db)
    if any(post.values()):
        print(f"\n[conftest] Post-test cleanup wiped: {post}")
    client.close()
