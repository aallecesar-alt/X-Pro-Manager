from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import secrets
import logging
import base64
import re
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

import cloudinary
import cloudinary.utils
import cloudinary.uploader

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

# Cloudinary config
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = FastAPI(title="Inter Car Auto Manager")
api_router = APIRouter(prefix="/api")
public_router = APIRouter(prefix="/api/public")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================
# MODELS
# ============================================================
class SignupRequest(BaseModel):
    full_name: str
    dealership_name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VehicleBase(BaseModel):
    make: str
    model: str
    year: int
    color: str = ""
    plate: str = ""
    vin: str = ""
    mileage: int = 0
    transmission: str = "Automatic"
    fuel_type: str = "Gasoline"
    body_type: str = "Sedan"
    purchase_price: float = 0
    sale_price: float = 0
    expenses: float = 0
    description: str = ""
    images: List[str] = []
    status: str = "in_stock"  # in_stock | reserved | sold
    buyer_name: str = ""
    buyer_phone: str = ""
    payment_method: str = ""
    sold_at: Optional[str] = None
    sold_price: float = 0
    # Delivery pipeline (1..8). 0 = not in delivery yet.
    # 1 Vendido | 2 Dados cliente | 3 Contrato banco | 4 Manutencao | 5 Seguro | 6 Titulo | 7 Registro | 8 Entregue
    delivery_step: int = 0
    # Timestamp of the last step change — used to flag vehicles stuck too long on the same step.
    delivery_step_updated_at: Optional[str] = None
    bank_name: str = ""
    delivery_notes: str = ""
    delivered_at: Optional[str] = None
    # Files attached per step. Keys are step numbers as strings ("1".."8").
    step_files: Dict[str, List[Dict]] = Field(default_factory=dict)
    step_notes: Dict[str, str] = Field(default_factory=dict)
    # Itemized expense list. Each item:
    # { id, description, amount, category, date, attachments: [{url, name, public_id}] }
    expense_items: List[Dict] = Field(default_factory=list)
    # Salesperson who closed the deal (snapshot fields for stability after deletion)
    salesperson_id: str = ""
    salesperson_name: str = ""
    # Commission tracking (fixed amount per sale + paid/unpaid status)
    commission_amount: float = 0
    commission_paid: bool = False


class Vehicle(VehicleBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dealership_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    plate: Optional[str] = None
    vin: Optional[str] = None
    mileage: Optional[int] = None
    transmission: Optional[str] = None
    fuel_type: Optional[str] = None
    body_type: Optional[str] = None
    purchase_price: Optional[float] = None
    sale_price: Optional[float] = None
    expenses: Optional[float] = None
    description: Optional[str] = None
    images: Optional[List[str]] = None
    status: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_phone: Optional[str] = None
    payment_method: Optional[str] = None
    sold_price: Optional[float] = None
    delivery_step: Optional[int] = None
    bank_name: Optional[str] = None
    delivery_notes: Optional[str] = None
    step_notes: Optional[Dict[str, str]] = None
    expense_items: Optional[List[Dict]] = None
    salesperson_id: Optional[str] = None
    salesperson_name: Optional[str] = None
    commission_amount: Optional[float] = None
    commission_paid: Optional[bool] = None


# ============================================================
# AUTH HELPERS
# ============================================================
def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()


def verify_password(pwd: str, hashed: str) -> bool:
    return bcrypt.checkpw(pwd.encode(), hashed.encode())


def create_token(user_id: str, dealership_id: str, email: str) -> str:
    return jwt.encode({
        "sub": user_id,
        "dealership_id": dealership_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        # Default role for accounts created before role was introduced
        user.setdefault("role", "owner")
        user.setdefault("salesperson_id", "")
        user.setdefault("permissions", None)  # None means: use role defaults
        user.setdefault("photo_url", "")
        user.setdefault("photo_public_id", "")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


# All tab permissions in the system. Owner always has full access.
ALL_TAB_PERMISSIONS = [
    "overview", "inventory", "pipeline", "delivery",
    "leads", "salespeople", "financial", "post_sales",
]
ROLE_DEFAULT_PERMISSIONS = {
    "owner": ALL_TAB_PERMISSIONS,
    "bdc": ["overview", "leads"],
    "salesperson": ["overview", "inventory", "pipeline", "delivery", "leads", "salespeople"],
    # Gerente (manager) starts with no default access — owner grants case-by-case.
    "gerente": [],
    # Geral (yard / parts / shop staff) — defaults to post-sales (handles repairs).
    "geral": ["post_sales"],
}


def effective_permissions(user: dict) -> list:
    """Returns the list of tabs the user can access. Custom permissions override role defaults."""
    role = user.get("role", "owner")
    custom = user.get("permissions")
    if isinstance(custom, list):
        return custom
    return ROLE_DEFAULT_PERMISSIONS.get(role, ["overview"])


def user_can_access(user: dict, tab: str) -> bool:
    if user.get("role") == "owner":
        return True
    return tab in effective_permissions(user)


def require_tab(user: dict, tab: str):
    if not user_can_access(user, tab):
        raise HTTPException(403, f"No access to {tab}")


def is_salesperson(user: dict) -> bool:
    return user.get("role") == "salesperson"


def is_bdc(user: dict) -> bool:
    return user.get("role") == "bdc"


# Fields hidden from salespeople (per-vehicle financials that reveal cost/profit)
_HIDDEN_VEHICLE_FIELDS = ("purchase_price", "expenses", "expense_items")


def strip_vehicle_for_salesperson(v: dict) -> dict:
    """Remove cost/profit fields from a vehicle dict before returning to salesperson."""
    if not v:
        return v
    out = {k: val for k, val in v.items() if k not in _HIDDEN_VEHICLE_FIELDS}
    return out


def require_owner(user: dict):
    if user.get("role") != "owner":
        raise HTTPException(403, "Owner access required")


def require_owner_or_bdc(user: dict):
    if user.get("role") not in ("owner", "bdc"):
        raise HTTPException(403, "Owner or BDC access required")


# ============================================================
# STARTUP
# ============================================================
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.dealerships.create_index("id", unique=True)
    await db.dealerships.create_index("api_token", unique=True, sparse=True)
    await db.vehicles.create_index("id", unique=True)
    await db.vehicles.create_index("dealership_id")
    await db.salespeople.create_index("id", unique=True)
    await db.salespeople.create_index("dealership_id")
    await db.operational_expenses.create_index("id", unique=True)
    await db.operational_expenses.create_index([("dealership_id", 1), ("date", -1)])
    await db.lost_sales.create_index("id", unique=True)
    await db.lost_sales.create_index([("dealership_id", 1), ("date", -1)])
    await db.leads.create_index("id", unique=True)
    await db.leads.create_index([("dealership_id", 1), ("created_at", -1)])
    await db.leads.create_index([("dealership_id", 1), ("monday_item_id", 1)])


# ============================================================
# AUTH ROUTES
# ============================================================
@api_router.post("/auth/signup")
async def signup(payload: SignupRequest):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already in use")

    dealership_id = str(uuid.uuid4())
    api_token = secrets.token_urlsafe(24)
    await db.dealerships.insert_one({
        "id": dealership_id,
        "name": payload.dealership_name,
        "api_token": api_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "dealership_id": dealership_id,
        "role": "owner",
        "salesperson_id": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    token = create_token(user_id, dealership_id, email)
    return {
        "access_token": token,
        "user": {"id": user_id, "email": email, "full_name": payload.full_name, "dealership_id": dealership_id, "role": "owner", "salesperson_id": ""},
        "dealership": {"id": dealership_id, "name": payload.dealership_name, "api_token": api_token},
    }


@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    dealership = await db.dealerships.find_one({"id": user["dealership_id"]}, {"_id": 0})
    token = create_token(user["id"], user["dealership_id"], user["email"])
    perms = effective_permissions(user)
    return {
        "access_token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user.get("full_name", ""),
            "dealership_id": user["dealership_id"],
            "role": user.get("role", "owner"),
            "salesperson_id": user.get("salesperson_id", ""),
            "permissions": perms,
            "photo_url": user.get("photo_url", ""),
        },
        "dealership": dealership,
    }


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    dealership = await db.dealerships.find_one({"id": current["dealership_id"]}, {"_id": 0})
    out_user = {**current, "permissions": effective_permissions(current)}
    return {"user": out_user, "dealership": dealership}


# ============================================================
# VEHICLES (multi-tenant)
# ============================================================
@api_router.get("/vehicles")
async def list_vehicles(
    status: Optional[str] = None,
    search: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    body_type: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    require_tab(current, "inventory")
    q = {"dealership_id": current["dealership_id"]}
    if status:
        q["status"] = status
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"make": rx}, {"model": rx}, {"plate": rx}, {"vin": rx}]
    if make:
        q["make"] = {"$regex": f"^{re.escape(make)}$", "$options": "i"}
    if model:
        q["model"] = {"$regex": f"^{re.escape(model)}$", "$options": "i"}
    if body_type:
        q["body_type"] = {"$regex": f"^{re.escape(body_type)}$", "$options": "i"}
    items = await db.vehicles.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if is_salesperson(current):
        items = [strip_vehicle_for_salesperson(v) for v in items]
    return items


@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(payload: VehicleCreate, current: dict = Depends(get_current_user)):
    require_owner(current)
    v = Vehicle(dealership_id=current["dealership_id"], **payload.model_dump())
    # Auto-compute expenses total from items if present
    if v.expense_items:
        v.expenses = sum(float(it.get("amount") or 0) for it in v.expense_items)
    await db.vehicles.insert_one(v.model_dump())
    return v


@api_router.get("/vehicles/{vid}")
async def get_vehicle(vid: str, current: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if is_salesperson(current):
        v = strip_vehicle_for_salesperson(v)
    return v


@api_router.get("/vehicles/{vid}/history")
async def vehicle_history(vid: str, current: dict = Depends(get_current_user)):
    """Aggregated timeline for one vehicle.

    Combines: created_at, expense_items (maintenance + others), recorded history
    (status / step / commission / salesperson swaps), lost_sales records, and
    legacy date fields (sold_at, delivered_at) when no recorded event exists yet.
    """
    v = await db.vehicles.find_one(
        {"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not v:
        raise HTTPException(404, "Vehicle not found")

    events = []

    if v.get("created_at"):
        events.append({
            "type": "created",
            "at": v["created_at"],
            "title": "Veículo cadastrado no sistema",
            "icon": "plus",
        })

    # Expense items (split into maintenance vs other)
    for it in (v.get("expense_items") or []):
        date = it.get("date") or it.get("created_at") or v.get("created_at")
        if it.get("category") == "maintenance":
            events.append({
                "type": "maintenance",
                "at": date,
                "title": it.get("description") or "Servico de manutencao",
                "amount": float(it.get("amount") or 0),
                "by": it.get("created_by_name") or "",
                "parts": it.get("parts") or [],
                "attachments": it.get("attachments") or [],
                "icon": "wrench",
            })
        else:
            events.append({
                "type": "expense",
                "at": date,
                "title": it.get("description") or "Despesa",
                "amount": float(it.get("amount") or 0),
                "category": it.get("category") or "",
                "icon": "dollar",
            })

    # Recorded events from in-doc history (status changes, step moves, commission, etc.)
    for ev in (v.get("history") or []):
        events.append({**ev, "icon": ev.get("type", "dot")})

    # Legacy fallbacks — only emit if not already covered by a recorded event
    has_recorded_status = any(e.get("type") == "status_change" for e in events)
    if v.get("sold_at") and not has_recorded_status:
        events.append({
            "type": "status_change",
            "from": "in_stock", "to": "sold",
            "at": v["sold_at"],
            "buyer_name": v.get("buyer_name", ""),
            "salesperson_name": v.get("salesperson_name", ""),
            "sold_price": float(v.get("sold_price") or 0),
            "icon": "status_change",
        })
    has_delivery_event = any(e.get("type") == "delivery_step" for e in events)
    if v.get("delivered_at") and not has_delivery_event:
        events.append({
            "type": "delivered",
            "at": v["delivered_at"],
            "title": "Veiculo entregue ao cliente",
            "icon": "check",
        })
    elif v.get("delivery_step_updated_at") and not has_delivery_event and (v.get("delivery_step") or 0) > 0:
        events.append({
            "type": "delivery_step",
            "from": 0, "to": v.get("delivery_step"),
            "at": v["delivery_step_updated_at"],
            "icon": "delivery_step",
        })

    # Lost sale records (revertions)
    async for ls in db.lost_sales.find(
        {"vehicle_id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0}
    ):
        events.append({
            "type": "lost_sale",
            "at": ls.get("date") or ls.get("created_at"),
            "title": "Venda revertida",
            "buyer_name": ls.get("buyer_name") or "",
            "reason": ls.get("reason") or "",
            "observation": ls.get("observation") or "",
            "lost_revenue": float(ls.get("lost_revenue") or 0),
            "salesperson_name": ls.get("salesperson_name") or "",
            "icon": "lost_sale",
        })

    # Sort newest first
    events.sort(key=lambda e: e.get("at") or "", reverse=True)

    return {
        "vehicle": {
            "id": v["id"],
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "year": v.get("year"),
            "color": v.get("color", ""),
            "vin": v.get("vin", ""),
            "image": (v.get("images") or [None])[0],
            "status": v.get("status", "in_stock"),
            "delivery_step": v.get("delivery_step") or 0,
            "buyer_name": v.get("buyer_name", "") if v.get("status") == "sold" else "",
            "sold_price": float(v.get("sold_price") or 0),
            "salesperson_name": v.get("salesperson_name", ""),
        },
        "events": events,
    }




@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, payload: VehicleUpdate, current: dict = Depends(get_current_user)):
    upd = {k: val for k, val in payload.model_dump().items() if val is not None}
    # Auto-populate salesperson_name when only salesperson_id is provided
    if upd.get("salesperson_id") and not upd.get("salesperson_name"):
        sp = await db.salespeople.find_one(
            {"id": upd["salesperson_id"], "dealership_id": current["dealership_id"]}, {"_id": 0}
        )
        if sp:
            upd["salesperson_name"] = sp.get("name", "")
    # Salesperson restrictions: strip financial fields + forbid changing payment status / commission
    if is_salesperson(current):
        for forbidden in ("purchase_price", "expenses", "expense_items", "commission_amount", "commission_paid"):
            upd.pop(forbidden, None)
        # When marking as sold, auto-assign salesperson to themselves
        if upd.get("status") == "sold" and not upd.get("salesperson_id"):
            sp_id = current.get("salesperson_id") or ""
            if sp_id:
                sp = await db.salespeople.find_one(
                    {"id": sp_id, "dealership_id": current["dealership_id"]}, {"_id": 0}
                )
                if sp:
                    upd["salesperson_id"] = sp_id
                    upd["salesperson_name"] = sp.get("name", "")
                    if not upd.get("commission_amount"):
                        upd["commission_amount"] = float(sp.get("commission_amount") or 0)
    # Auto-compute expenses total from itemized list when provided
    if "expense_items" in upd and isinstance(upd["expense_items"], list):
        upd["expenses"] = sum(float(it.get("amount") or 0) for it in upd["expense_items"])
    # Existing doc — used to detect transitions for the history log.
    existing = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    push_events = []
    actor_name = current.get("full_name") or current.get("email") or ""
    now_iso = datetime.now(timezone.utc).isoformat()
    # Auto-set sold_at and start delivery pipeline at step 1 when transitioning to sold
    if upd.get("status") == "sold":
        if existing and existing.get("status") != "sold":
            upd["sold_at"] = now_iso
            # Auto-assign currently logged-in salesperson when no one is set
            if not upd.get("salesperson_id") and not existing.get("salesperson_id"):
                if is_salesperson(current) and current.get("salesperson_id"):
                    sp = await db.salespeople.find_one(
                        {"id": current["salesperson_id"], "dealership_id": current["dealership_id"]}, {"_id": 0}
                    )
                    if sp:
                        upd["salesperson_id"] = sp["id"]
                        upd["salesperson_name"] = sp.get("name", "")
                        if not upd.get("commission_amount"):
                            upd["commission_amount"] = float(sp.get("commission_amount") or 0)
            # Force delivery_step = 1 on first transition to sold (override any 0/None payload value)
            if (existing.get("delivery_step") or 0) == 0 and (upd.get("delivery_step") or 0) == 0:
                upd["delivery_step"] = 1
    # Log every status transition
    if "status" in upd and existing and upd.get("status") != existing.get("status"):
        push_events.append({
            "type": "status_change",
            "from": existing.get("status") or "in_stock",
            "to": upd.get("status"),
            "at": now_iso,
            "by": actor_name,
            "buyer_name": upd.get("buyer_name") or existing.get("buyer_name") or "",
            "salesperson_name": upd.get("salesperson_name") or existing.get("salesperson_name") or "",
            "sold_price": upd.get("sold_price") or existing.get("sold_price") or 0,
        })
    # Track every delivery step change so we can alert when cars get stuck.
    if "delivery_step" in upd:
        prev_step = (existing or {}).get("delivery_step") or 0
        new_step = upd.get("delivery_step") or 0
        if prev_step != new_step:
            upd["delivery_step_updated_at"] = now_iso
            push_events.append({
                "type": "delivery_step",
                "from": prev_step,
                "to": new_step,
                "at": now_iso,
                "by": actor_name,
            })
    # Log commission paid toggle
    if "commission_paid" in upd and existing and bool(upd.get("commission_paid")) != bool(existing.get("commission_paid")):
        push_events.append({
            "type": "commission_paid" if upd.get("commission_paid") else "commission_unpaid",
            "at": now_iso,
            "by": actor_name,
            "amount": float(upd.get("commission_amount") or existing.get("commission_amount") or 0),
            "salesperson_name": upd.get("salesperson_name") or existing.get("salesperson_name") or "",
        })
    # Log salesperson swap
    if "salesperson_id" in upd and existing and upd.get("salesperson_id") and upd.get("salesperson_id") != existing.get("salesperson_id"):
        push_events.append({
            "type": "salesperson_changed",
            "at": now_iso,
            "by": actor_name,
            "from_name": existing.get("salesperson_name") or "",
            "to_name": upd.get("salesperson_name") or "",
        })
    # Auto-set delivered_at when reaching step 8
    if upd.get("delivery_step") == 8:
        upd["delivered_at"] = now_iso
    if not upd and not push_events:
        raise HTTPException(400, "Nothing to update")
    mongo_op = {}
    if upd:
        mongo_op["$set"] = upd
    if push_events:
        mongo_op["$push"] = {"history": {"$each": push_events}}
    res = await db.vehicles.update_one(
        {"id": vid, "dealership_id": current["dealership_id"]}, mongo_op
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Vehicle not found")
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if is_salesperson(current):
        v = strip_vehicle_for_salesperson(v)
    return v


@api_router.get("/delivery")
async def list_delivery(current: dict = Depends(get_current_user)):
    """Vehicles currently in the delivery pipeline (sold but not delivered)."""
    require_tab(current, "delivery")
    items = await db.vehicles.find(
        {"dealership_id": current["dealership_id"], "status": "sold", "delivery_step": {"$gte": 1, "$lte": 8}},
        {"_id": 0}
    ).sort("sold_at", -1).to_list(500)
    # Attach days_in_step + stuck flag so the frontend can render alerts.
    now = datetime.now(timezone.utc)
    for v in items:
        ref = v.get("delivery_step_updated_at") or v.get("sold_at")
        days = 0
        if ref:
            try:
                days = max(0, (now - datetime.fromisoformat(ref)).days)
            except Exception:
                days = 0
        v["days_in_step"] = days
        # Alert only for non-delivered cars stuck >=45 days on current step.
        v["stuck_alert"] = (v.get("delivery_step") or 0) < 8 and days >= 45
    if is_salesperson(current):
        items = [strip_vehicle_for_salesperson(v) for v in items]
    return items


@api_router.get("/delivery/alerts")
async def list_delivery_alerts(days: int = 45, current: dict = Depends(get_current_user)):
    """Cars stuck on the same delivery step for N+ days. Owner/gerente only."""
    role = (current or {}).get("role") or "owner"
    if role not in ("owner", "gerente"):
        raise HTTPException(403, "Owner or manager access required")
    items = await db.vehicles.find(
        {"dealership_id": current["dealership_id"], "status": "sold", "delivery_step": {"$gte": 1, "$lte": 7}},
        {"_id": 0}
    ).to_list(500)
    now = datetime.now(timezone.utc)
    out = []
    for v in items:
        ref = v.get("delivery_step_updated_at") or v.get("sold_at")
        d = 0
        if ref:
            try:
                d = max(0, (now - datetime.fromisoformat(ref)).days)
            except Exception:
                d = 0
        if d >= days:
            out.append({
                "id": v.get("id"),
                "make": v.get("make"),
                "model": v.get("model"),
                "year": v.get("year"),
                "image": (v.get("images") or [None])[0],
                "buyer_name": v.get("buyer_name") or "",
                "delivery_step": v.get("delivery_step") or 0,
                "days_in_step": d,
                "salesperson_name": v.get("salesperson_name") or "",
            })
    out.sort(key=lambda x: x["days_in_step"], reverse=True)
    return out


# ============================================================
# MAINTENANCE (yard / parts / general staff)
# Each maintenance service is stored as an expense_item on the vehicle with
# category="maintenance". The total flows directly into the vehicle's expenses
# field — so the Financial dashboard already accounts for it without duplicates.
# ============================================================
class MaintenanceItemPayload(BaseModel):
    description: str
    amount: float = 0
    date: Optional[str] = None
    parts: List[str] = Field(default_factory=list)
    attachments: List[Dict] = Field(default_factory=list)


def _maintenance_view(v: dict) -> dict:
    """Stripped vehicle dict for maintenance UI (no purchase_price / sale_price)."""
    maint = [it for it in (v.get("expense_items") or []) if it.get("category") == "maintenance"]
    return {
        "id": v["id"],
        "make": v.get("make", ""),
        "model": v.get("model", ""),
        "year": v.get("year"),
        "color": v.get("color", ""),
        "vin": v.get("vin", ""),
        "image": (v.get("images") or [None])[0],
        "status": v.get("status", "in_stock"),
        "delivery_step": v.get("delivery_step", 0) or 0,
        "buyer_name": v.get("buyer_name", "") if v.get("status") == "sold" else "",
        "maintenance_total": sum(float(it.get("amount") or 0) for it in maint),
        "maintenance_count": len(maint),
        "maintenance_items": sorted(
            maint, key=lambda x: x.get("date") or x.get("created_at") or "", reverse=True
        ),
    }


async def _save_expense_items(vid: str, dealership_id: str, items: list):
    new_total = sum(float(it.get("amount") or 0) for it in items)
    await db.vehicles.update_one(
        {"id": vid, "dealership_id": dealership_id},
        {"$set": {"expense_items": items, "expenses": new_total}},
    )


@api_router.get("/maintenance")
async def list_maintenance(current: dict = Depends(get_current_user)):
    """List all vehicles with maintenance summary + items. Stripped of cost fields."""
    require_tab(current, "maintenance")
    items = await db.vehicles.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return [_maintenance_view(v) for v in items]


@api_router.post("/maintenance/vehicles/{vid}/items")
async def add_maintenance_item(vid: str, payload: MaintenanceItemPayload, current: dict = Depends(get_current_user)):
    require_tab(current, "maintenance")
    v = await db.vehicles.find_one(
        {"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not v:
        raise HTTPException(404, "Vehicle not found")
    item = {
        "id": str(uuid.uuid4()),
        "description": payload.description,
        "amount": float(payload.amount or 0),
        "category": "maintenance",
        "date": payload.date or datetime.now(timezone.utc).date().isoformat(),
        "parts": payload.parts or [],
        "attachments": payload.attachments or [],
        "created_by_name": current.get("full_name") or current.get("email") or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    items = list(v.get("expense_items") or [])
    items.append(item)
    await _save_expense_items(vid, current["dealership_id"], items)
    return item


@api_router.put("/maintenance/vehicles/{vid}/items/{item_id}")
async def update_maintenance_item(vid: str, item_id: str, payload: MaintenanceItemPayload, current: dict = Depends(get_current_user)):
    require_tab(current, "maintenance")
    v = await db.vehicles.find_one(
        {"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not v:
        raise HTTPException(404, "Vehicle not found")
    items = list(v.get("expense_items") or [])
    found = None
    for it in items:
        if it.get("id") == item_id and it.get("category") == "maintenance":
            it["description"] = payload.description
            it["amount"] = float(payload.amount or 0)
            it["date"] = payload.date or it.get("date")
            it["parts"] = payload.parts or []
            it["attachments"] = payload.attachments or []
            it["updated_at"] = datetime.now(timezone.utc).isoformat()
            it["updated_by_name"] = current.get("full_name") or current.get("email") or ""
            found = it
            break
    if not found:
        raise HTTPException(404, "Maintenance item not found")
    await _save_expense_items(vid, current["dealership_id"], items)
    return found


@api_router.delete("/maintenance/vehicles/{vid}/items/{item_id}")
async def delete_maintenance_item(vid: str, item_id: str, current: dict = Depends(get_current_user)):
    require_tab(current, "maintenance")
    v = await db.vehicles.find_one(
        {"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not v:
        raise HTTPException(404, "Vehicle not found")
    before = len(v.get("expense_items") or [])
    items = [
        it for it in (v.get("expense_items") or [])
        if not (it.get("id") == item_id and it.get("category") == "maintenance")
    ]
    if len(items) == before:
        raise HTTPException(404, "Maintenance item not found")
    await _save_expense_items(vid, current["dealership_id"], items)
    return {"deleted": True}



# ============================================================
# POST-SALES (Pós-Vendas) — track repairs after a car has been sold.
# Stored as standalone documents in `post_sales` collection.
# When a repair has cost AND vehicle_id is set, a mirroring expense_item with
# category="post_sale" is kept in sync on the vehicle so the Financial dashboard
# accounts for it without duplicates.
# ============================================================
class PostSalePayload(BaseModel):
    vin: str = ""
    vehicle_id: str = ""           # blank if VIN didn't match an existing vehicle
    make: str = ""
    model: str = ""
    year: Optional[int] = None
    color: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    entry_date: Optional[str] = None      # data de entrada (YYYY-MM-DD)
    exit_date: Optional[str] = None       # data de saída (when finished)
    problem: str = ""                     # descrição do problema relatado pelo cliente
    work_to_do: str = ""                  # o que tem que fazer
    cost: float = 0
    technician: str = ""                  # mecânico/responsável
    notes: str = ""
    status: str = "open"                  # open | in_progress | done


VALID_POST_SALE_STATUSES = {"open", "in_progress", "done"}


def _post_sale_to_view(doc: dict) -> dict:
    """Strip Mongo internals and ensure consistent JSON shape."""
    return {k: v for k, v in doc.items() if k != "_id"}


async def _sync_post_sale_expense_on_vehicle(post_sale: dict, dealership_id: str):
    """Mirror this post-sale onto the vehicle's expense_items so the Financial
    dashboard counts it. Idempotent — uses post_sale id as the expense_item id.
    Removes the mirror when post_sale has no vehicle_id or zero cost."""
    ps_id = post_sale.get("id")
    if not ps_id:
        return
    veh_id = post_sale.get("vehicle_id") or ""
    cost = float(post_sale.get("cost") or 0)

    # Remove any existing mirror from EVERY vehicle in this dealership (handles vehicle change).
    await db.vehicles.update_many(
        {"dealership_id": dealership_id, "expense_items.id": ps_id},
        {"$pull": {"expense_items": {"id": ps_id}}},
    )
    # Recompute totals for every vehicle that lost a mirror item
    affected = await db.vehicles.find(
        {"dealership_id": dealership_id}, {"_id": 0, "id": 1, "expense_items": 1}
    ).to_list(2000)
    for v in affected:
        new_total = sum(float(it.get("amount") or 0) for it in (v.get("expense_items") or []))
        await db.vehicles.update_one(
            {"id": v["id"], "dealership_id": dealership_id},
            {"$set": {"expenses": new_total}},
        )

    # Add mirror expense to current vehicle if both a vehicle AND a cost are set.
    if not veh_id or cost <= 0:
        return
    veh = await db.vehicles.find_one(
        {"id": veh_id, "dealership_id": dealership_id}, {"_id": 0}
    )
    if not veh:
        return
    items = list(veh.get("expense_items") or [])
    items.append({
        "id": ps_id,
        "description": (post_sale.get("work_to_do") or post_sale.get("problem") or "Pós-venda")[:200],
        "amount": cost,
        "category": "post_sale",
        "date": post_sale.get("exit_date") or post_sale.get("entry_date") or datetime.now(timezone.utc).date().isoformat(),
        "post_sale_id": ps_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    new_total = sum(float(it.get("amount") or 0) for it in items)
    await db.vehicles.update_one(
        {"id": veh_id, "dealership_id": dealership_id},
        {"$set": {"expense_items": items, "expenses": new_total}},
    )


@api_router.get("/post-sales/lookup-vin")
async def post_sales_lookup_vin(vin: str, current: dict = Depends(get_current_user)):
    """Try to find a sold vehicle by VIN. Returns autofill data if found, empty if not."""
    require_tab(current, "post_sales")
    vin_clean = (vin or "").strip()
    if not vin_clean:
        return {"found": False}
    veh = await db.vehicles.find_one(
        {"dealership_id": current["dealership_id"], "vin": {"$regex": f"^{re.escape(vin_clean)}$", "$options": "i"}},
        {"_id": 0},
    )
    if not veh:
        return {"found": False}
    return {
        "found": True,
        "vehicle_id": veh.get("id"),
        "vin": veh.get("vin", ""),
        "make": veh.get("make", ""),
        "model": veh.get("model", ""),
        "year": veh.get("year"),
        "color": veh.get("color", ""),
        "customer_name": veh.get("buyer_name", "") if veh.get("status") == "sold" else "",
        "customer_phone": veh.get("buyer_phone", "") if veh.get("status") == "sold" else "",
        "image": (veh.get("images") or [None])[0],
        "status": veh.get("status", ""),
    }


@api_router.get("/post-sales")
async def list_post_sales(current: dict = Depends(get_current_user)):
    """List every post-sale repair for this dealership, newest first."""
    require_tab(current, "post_sales")
    items = await db.post_sales.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0}
    ).sort("entry_date", -1).to_list(2000)
    return items


@api_router.post("/post-sales")
async def create_post_sale(payload: PostSalePayload, current: dict = Depends(get_current_user)):
    require_tab(current, "post_sales")
    if payload.status and payload.status not in VALID_POST_SALE_STATUSES:
        raise HTTPException(400, "Invalid status")
    today = datetime.now(timezone.utc).date().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "dealership_id": current["dealership_id"],
        "vin": payload.vin.strip(),
        "vehicle_id": payload.vehicle_id or "",
        "make": payload.make,
        "model": payload.model,
        "year": payload.year,
        "color": payload.color,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "entry_date": payload.entry_date or today,
        "exit_date": payload.exit_date or None,
        "problem": payload.problem,
        "work_to_do": payload.work_to_do,
        "cost": float(payload.cost or 0),
        "technician": payload.technician,
        "notes": payload.notes,
        "status": payload.status or "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_name": current.get("full_name") or current.get("email") or "",
    }
    await db.post_sales.insert_one(doc)
    await _sync_post_sale_expense_on_vehicle(doc, current["dealership_id"])
    return _post_sale_to_view(doc)


@api_router.put("/post-sales/{ps_id}")
async def update_post_sale(ps_id: str, payload: PostSalePayload, current: dict = Depends(get_current_user)):
    require_tab(current, "post_sales")
    if payload.status and payload.status not in VALID_POST_SALE_STATUSES:
        raise HTTPException(400, "Invalid status")
    existing = await db.post_sales.find_one(
        {"id": ps_id, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Post-sale not found")
    update = {
        "vin": payload.vin.strip(),
        "vehicle_id": payload.vehicle_id or "",
        "make": payload.make,
        "model": payload.model,
        "year": payload.year,
        "color": payload.color,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "entry_date": payload.entry_date or existing.get("entry_date"),
        "exit_date": payload.exit_date,
        "problem": payload.problem,
        "work_to_do": payload.work_to_do,
        "cost": float(payload.cost or 0),
        "technician": payload.technician,
        "notes": payload.notes,
        "status": payload.status or existing.get("status", "open"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by_name": current.get("full_name") or current.get("email") or "",
    }
    # Auto-stamp exit_date when status flips to "done" if not set
    if update["status"] == "done" and not update.get("exit_date"):
        update["exit_date"] = datetime.now(timezone.utc).date().isoformat()
    await db.post_sales.update_one(
        {"id": ps_id, "dealership_id": current["dealership_id"]},
        {"$set": update},
    )
    merged = {**existing, **update}
    await _sync_post_sale_expense_on_vehicle(merged, current["dealership_id"])
    return _post_sale_to_view(merged)


@api_router.delete("/post-sales/{ps_id}")
async def delete_post_sale(ps_id: str, current: dict = Depends(get_current_user)):
    require_tab(current, "post_sales")
    existing = await db.post_sales.find_one(
        {"id": ps_id, "dealership_id": current["dealership_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Post-sale not found")
    # Remove mirror from any vehicle
    await db.vehicles.update_many(
        {"dealership_id": current["dealership_id"], "expense_items.id": ps_id},
        {"$pull": {"expense_items": {"id": ps_id}}},
    )
    affected = await db.vehicles.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0, "id": 1, "expense_items": 1}
    ).to_list(2000)
    for v in affected:
        new_total = sum(float(it.get("amount") or 0) for it in (v.get("expense_items") or []))
        await db.vehicles.update_one(
            {"id": v["id"], "dealership_id": current["dealership_id"]},
            {"$set": {"expenses": new_total}},
        )
    await db.post_sales.delete_one({"id": ps_id, "dealership_id": current["dealership_id"]})
    return {"deleted": True}



# ============================================================
# CUSTOMER DATABASE — aggregated buyers from sold vehicles
# ============================================================
@api_router.get("/customers")
async def list_customers(current: dict = Depends(get_current_user)):
    """Aggregate every buyer across all sold vehicles. Stripped of cost fields
    when called by salesperson (they only see their own customers)."""
    require_tab(current, "customers")
    q = {"dealership_id": current["dealership_id"], "status": "sold"}
    if is_salesperson(current):
        q["salesperson_id"] = current.get("salesperson_id") or "_none_"
    sold = await db.vehicles.find(q, {"_id": 0}).sort("sold_at", -1).to_list(2000)
    by_key = {}
    for v in sold:
        name = (v.get("buyer_name") or "").strip()
        phone = (v.get("buyer_phone") or "").strip()
        if not name and not phone:
            continue
        # Group by phone when present, else by lowercased name
        key = phone or name.lower()
        if key not in by_key:
            by_key[key] = {
                "key": key,
                "name": name or "—",
                "phone": phone,
                "vehicles_count": 0,
                "total_spent": 0.0,
                "last_purchase_at": None,
                "salespeople": set(),
                "vehicles": [],
            }
        c = by_key[key]
        c["vehicles_count"] += 1
        c["total_spent"] += float(v.get("sold_price") or v.get("sale_price") or 0)
        if v.get("salesperson_name"):
            c["salespeople"].add(v["salesperson_name"])
        sold_at = v.get("sold_at") or v.get("delivered_at") or v.get("created_at") or ""
        if not c["last_purchase_at"] or sold_at > c["last_purchase_at"]:
            c["last_purchase_at"] = sold_at
            if name and not c["name"]:
                c["name"] = name
        c["vehicles"].append({
            "id": v.get("id"),
            "year": v.get("year"),
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "color": v.get("color", ""),
            "sold_price": float(v.get("sold_price") or 0),
            "sold_at": sold_at,
            "salesperson_name": v.get("salesperson_name", ""),
            "image": (v.get("images") or [None])[0],
            "delivery_step": v.get("delivery_step") or 0,
        })
    out = []
    for c in by_key.values():
        c["salespeople"] = sorted(c["salespeople"])
        c["vehicles"].sort(key=lambda x: x["sold_at"] or "", reverse=True)
        out.append(c)
    out.sort(key=lambda c: c["last_purchase_at"] or "", reverse=True)
    return out


# ============================================================
# IMPORT INVENTORY PAGE — extract list of vehicles from a dealer listing page
# (uses ScraperAPI). Returns links + thumbnails so user can pick which to import.
# ============================================================
class ImportInventoryPagePayload(BaseModel):
    url: str


def _extract_vehicles_from_listing(html_text: str, base_url: str):
    """Best-effort: pulls every '/details/...' anchor from the listing along with
    the closest <img> + nearby price."""
    import re as _re
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin

    soup = BeautifulSoup(html_text, "html.parser")
    seen = set()
    items = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/details/" not in href:
            continue
        full = urljoin(base_url, href)
        if full in seen:
            continue
        seen.add(full)
        # Title from anchor text or img alt
        title = (a.get_text() or "").strip().replace("\n", " ")
        title = _re.sub(r"\s+", " ", title)[:120]
        img = a.find("img") or (a.find_parent() and a.find_parent().find("img"))
        thumb = ""
        if img:
            thumb = img.get("src") or img.get("data-src") or img.get("data-lazy-src") or ""
            if thumb.startswith("//"):
                thumb = "https:" + thumb
            elif thumb.startswith("/"):
                thumb = urljoin(base_url, thumb)
            if not title:
                title = (img.get("alt") or "").strip()[:120]
        # Try to find a price near the link (within parent)
        price = 0
        parent_text = (a.find_parent() or a).get_text(" ", strip=True) if a.find_parent() else ""
        m = _re.search(r"\$\s*([\d,]+(?:\.\d{2})?)", parent_text or "")
        if m:
            try:
                v = float(m.group(1).replace(",", ""))
                if 1000 <= v <= 500000:
                    price = v
            except Exception:
                pass
        # Try to extract year/make/model from the slug ('used-2019-honda-civic')
        slug_m = _re.search(r"/details/(?:new-|used-)?(\d{4})-([a-z0-9-]+)", href.lower())
        year = int(slug_m.group(1)) if slug_m else None
        make = ""
        model = ""
        if slug_m:
            rest = slug_m.group(2).split("-")
            if rest:
                make = rest[0].title()
                model = " ".join(p.title() for p in rest[1:5])
        items.append({
            "url": full,
            "title": title or f"{year or ''} {make} {model}".strip(),
            "thumbnail": thumb,
            "year": year,
            "make": make,
            "model": model,
            "price": price,
        })
        if len(items) >= 200:
            break
    return items


@api_router.post("/vehicles/import-inventory-page")
async def import_inventory_page(payload: ImportInventoryPagePayload, current: dict = Depends(get_current_user)):
    """Scrape a dealer listing page and return all detail-page URLs found.

    The user can then pick which ones to import individually using the existing
    /vehicles/import-url endpoint.
    """
    require_owner(current)
    import requests
    import os as _os

    url = (payload.url or "").strip()
    if not url.startswith("http"):
        raise HTTPException(400, "Please provide a full URL")

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/127.0"}

    r = None
    last_error = None
    scraper_key = _os.environ.get("SCRAPERAPI_KEY", "").strip()
    if scraper_key:
        try:
            r = requests.get(
                "https://api.scraperapi.com",
                params={"api_key": scraper_key, "url": url, "country_code": "us"},
                timeout=70,
            )
            if r.status_code != 200:
                last_error = f"scraperapi {r.status_code}"
                r = None
        except Exception as e:
            last_error = str(e)
            r = None
    if r is None:
        try:
            r = requests.get(url, headers=headers, timeout=20)
        except Exception as e:
            raise HTTPException(400, f"Could not fetch URL: {last_error or e}")
    if r is None or r.status_code != 200:
        raise HTTPException(400, f"Could not fetch URL: {last_error or r.status_code if r else 'no response'}")

    items = _extract_vehicles_from_listing(r.text, url)
    return {"count": len(items), "items": items}




# ============================================================
# DELIVERY STEP FILE ATTACHMENTS
# ============================================================
class StepFileUpload(BaseModel):
    name: str
    type: str  # MIME type
    data_url: str  # base64 data URL
    size: int = 0


@api_router.post("/vehicles/{vid}/step-files/{step}")
async def upload_step_file(vid: str, step: int, payload: StepFileUpload, current: dict = Depends(get_current_user)):
    if step < 1 or step > 8:
        raise HTTPException(400, "Invalid step")
    # Reject files larger than 8MB (encoded base64 is ~33% larger than raw)
    if len(payload.data_url) > 11_000_000:
        raise HTTPException(413, "File too large (max 8MB)")
    vehicle = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    file_doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "type": payload.type,
        "data_url": payload.data_url,
        "size": payload.size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vehicles.update_one(
        {"id": vid, "dealership_id": current["dealership_id"]},
        {"$push": {f"step_files.{step}": file_doc}}
    )
    return {"file": {k: v for k, v in file_doc.items() if k != "data_url"}}


@api_router.delete("/vehicles/{vid}/step-files/{step}/{file_id}")
async def delete_step_file(vid: str, step: int, file_id: str, current: dict = Depends(get_current_user)):
    res = await db.vehicles.update_one(
        {"id": vid, "dealership_id": current["dealership_id"]},
        {"$pull": {f"step_files.{step}": {"id": file_id}}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Vehicle not found")
    return {"deleted": True}


@api_router.post("/vehicles/import-url")
async def import_vehicle_from_url(payload: dict, current: dict = Depends(get_current_user)):
    """Scrape a vehicle listing URL and extract image, title, year, make/model.

    Returns extracted fields for the user to confirm/edit before saving.
    Does NOT save the vehicle automatically.
    """
    require_owner(current)
    url = (payload or {}).get("url", "").strip()
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "Provide a valid http(s) URL")

    import os
    import requests
    import cloudscraper
    from bs4 import BeautifulSoup
    import re as _re

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        "Upgrade-Insecure-Requests": "1",
    }

    r = None
    last_error = None

    # 1) Try ScraperAPI (handles most anti-bot pages — even on free plan)
    scraper_key = os.environ.get("SCRAPERAPI_KEY", "").strip()
    if scraper_key:
        try:
            r = requests.get(
                "https://api.scraperapi.com",
                params={
                    "api_key": scraper_key,
                    "url": url,
                    "country_code": "us",
                },
                timeout=70,
            )
            if r.status_code != 200:
                last_error = f"scraperapi {r.status_code}: {r.text[:120]}"
                r = None
        except Exception as e:
            last_error = f"scraperapi: {e}"
            r = None

    # 2) Fallback: plain requests
    if r is None:
        try:
            r = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
            if r.status_code != 200:
                r = None
        except Exception as e:
            last_error = str(e)

    # 3) Fallback: cloudscraper (handles Cloudflare JS challenges)
    if r is None:
        try:
            scraper = cloudscraper.create_scraper(
                browser={"browser": "chrome", "platform": "darwin", "mobile": False}
            )
            r = scraper.get(url, headers=headers, timeout=30, allow_redirects=True)
            r.raise_for_status()
        except Exception as e:
            last_error = str(e)
            r = None

    if r is None or r.status_code != 200:
        raise HTTPException(400, f"Could not fetch URL: {last_error or 'site blocked the request'}"[:200])

    soup = BeautifulSoup(r.text, "lxml")

    def meta(name):
        for sel in [
            ("property", name),
            ("name", name),
            ("itemprop", name),
        ]:
            tag = soup.find("meta", {sel[0]: sel[1]})
            if tag and tag.get("content"):
                return tag["content"].strip()
        return ""

    image = meta("og:image") or meta("twitter:image") or meta("image")
    title = meta("og:title") or meta("twitter:title") or (soup.title.string.strip() if soup.title and soup.title.string else "")
    description = meta("og:description") or meta("description") or ""

    # Collect a gallery of additional images from the page (most dealer sites have 10+ photos)
    images = []
    if image:
        images.append(image)
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src") or ""
        if not src or src.startswith("data:"):
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            from urllib.parse import urljoin
            src = urljoin(url, src)
        # Keep only image-like URLs and skip tiny icons
        if any(x in src.lower() for x in [".jpg", ".jpeg", ".png", ".webp"]) and src not in images:
            # Heuristic: skip logos/icons (often have "logo" or "icon" in path)
            if not any(b in src.lower() for b in ["logo", "icon", "favicon", "sprite"]):
                images.append(src)
        if len(images) >= 30:
            break

    # Fallback: first <img> with reasonable size (kept for legacy single-image flow)
    if not image and images:
        image = images[0]

    # Try to extract year + make + model from title (e.g. "2022 Honda Civic LX - Inter Car")
    year = 0
    make = ""
    model = ""
    if title:
        m = _re.match(r"\s*(\d{4})\s+([A-Za-z\-]+)\s+(.+?)(?:\s+[-|·•]\s+|$)", title)
        if m:
            year = int(m.group(1))
            make = m.group(2).strip()
            model = m.group(3).strip()
        else:
            # Try just year
            ym = _re.search(r"\b(19|20)\d{2}\b", title)
            if ym:
                year = int(ym.group(0))

    # Try to find a price like $12,345 or $12345 in the page (largest plausible $ amount)
    price = 0
    candidates = []
    for m in _re.finditer(r"\$\s*([\d,]+(?:\.\d{2})?)", r.text):
        try:
            v = float(m.group(1).replace(",", ""))
        except Exception:
            continue
        # Plausible vehicle price range
        if 1000 <= v <= 500000:
            candidates.append(v)
    if candidates:
        # Most pages mention the asking price multiple times — pick the most common (mode), then highest
        from collections import Counter
        most_common = Counter(candidates).most_common(1)[0][0]
        price = most_common

    # Try to find VIN (17 alphanumeric chars, no I/O/Q)
    vin = ""
    vin_m = _re.search(r"\b([A-HJ-NPR-Z0-9]{17})\b", r.text)
    if vin_m:
        vin = vin_m.group(1)

    return {
        "extracted": {
            "image": image or "",
            "images": images,
            "title": title,
            "description": description[:500],
            "year": year,
            "make": make,
            "model": model,
            "price": price,
            "vin": vin,
            "source_url": url,
        }
    }


@api_router.get("/cloudinary/signature")
async def cloudinary_signature(
    folder: str = "uploads",
    current: dict = Depends(get_current_user),
):
    """Generate a signed upload signature for the frontend.

    Frontend uses signed uploads → API secret never leaves the backend.
    Allowed folder prefixes (per dealership): 'vehicles/', 'delivery/', 'profiles/'.
    Front may also pass the bare prefix (e.g. 'profiles/') and we'll namespace it.
    """
    dealership_id = current["dealership_id"]
    # Allow only namespaced folders by dealership
    allowed_prefixes = (
        f"vehicles/{dealership_id}/",
        f"delivery/{dealership_id}/",
        f"profiles/{dealership_id}/",
    )
    # Auto-namespace bare prefixes
    bare_to_ns = {
        "profiles/": f"profiles/{dealership_id}/",
        "vehicles/": f"vehicles/{dealership_id}/",
        "delivery/": f"delivery/{dealership_id}/",
    }
    if folder in bare_to_ns:
        folder = bare_to_ns[folder]
    if not folder.startswith(allowed_prefixes):
        # Default to vehicles folder for this dealership
        folder = f"vehicles/{dealership_id}/"

    timestamp = int(datetime.now(timezone.utc).timestamp())
    params = {"timestamp": timestamp, "folder": folder}
    signature = cloudinary.utils.api_sign_request(params, os.environ["CLOUDINARY_API_SECRET"])
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.environ["CLOUDINARY_CLOUD_NAME"],
        "api_key": os.environ["CLOUDINARY_API_KEY"],
        "folder": folder,
    }


@api_router.delete("/cloudinary/asset")
async def cloudinary_delete(public_id: str = Query(...), current: dict = Depends(get_current_user)):
    """Delete an asset from Cloudinary.
    Backend-only operation. Validates the public_id belongs to this dealership's folder."""
    dealership_id = current["dealership_id"]
    if not (public_id.startswith(f"vehicles/{dealership_id}/") or public_id.startswith(f"delivery/{dealership_id}/")):
        raise HTTPException(403, "Forbidden")
    try:
        cloudinary.uploader.destroy(public_id, invalidate=True)
        return {"deleted": True}
    except Exception as e:
        raise HTTPException(500, f"Cloudinary error: {str(e)[:200]}")


@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.vehicles.delete_one({"id": vid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Vehicle not found")
    return {"deleted": True}


# ============================================================
# DASHBOARD STATS
# ============================================================
@api_router.get("/stats")
async def stats(current: dict = Depends(get_current_user)):
    did = current["dealership_id"]
    total = await db.vehicles.count_documents({"dealership_id": did})
    in_stock = await db.vehicles.count_documents({"dealership_id": did, "status": "in_stock"})
    reserved = await db.vehicles.count_documents({"dealership_id": did, "status": "reserved"})
    sold = await db.vehicles.count_documents({"dealership_id": did, "status": "sold"})

    pipeline_stock = [
        {"$match": {"dealership_id": did, "status": {"$ne": "sold"}}},
        {"$group": {"_id": None, "invested": {"$sum": "$purchase_price"}, "expenses": {"$sum": "$expenses"}}}
    ]
    s_stock = await db.vehicles.aggregate(pipeline_stock).to_list(1)

    pipeline_sold = [
        {"$match": {"dealership_id": did, "status": "sold"}},
        {"$group": {"_id": None,
                    "revenue": {"$sum": "$sold_price"},
                    "cost": {"$sum": {"$add": ["$purchase_price", "$expenses"]}}}}
    ]
    s_sold = await db.vehicles.aggregate(pipeline_sold).to_list(1)

    invested = s_stock[0]["invested"] if s_stock else 0
    expenses = s_stock[0]["expenses"] if s_stock else 0
    revenue = s_sold[0]["revenue"] if s_sold else 0
    cost = s_sold[0]["cost"] if s_sold else 0
    profit = revenue - cost
    avg_ticket = (revenue / sold) if sold else 0

    # Sales by month (last 6 months)
    sold_vehicles = await db.vehicles.find(
        {"dealership_id": did, "status": "sold", "sold_at": {"$ne": None}},
        {"_id": 0, "sold_at": 1, "sold_price": 1, "purchase_price": 1, "expenses": 1}
    ).to_list(2000)
    monthly = {}
    for v in sold_vehicles:
        if not v.get("sold_at"):
            continue
        try:
            dt = datetime.fromisoformat(v["sold_at"].replace("Z", "+00:00"))
            key = dt.strftime("%Y-%m")
            m = monthly.setdefault(key, {"month": key, "revenue": 0, "profit": 0, "count": 0})
            m["revenue"] += v.get("sold_price", 0)
            m["profit"] += v.get("sold_price", 0) - v.get("purchase_price", 0) - v.get("expenses", 0)
            m["count"] += 1
        except Exception:
            pass
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"])[-6:]

    if is_salesperson(current):
        # Hide aggregate cost/revenue/profit numbers from salespeople
        return {
            "total_vehicles": total,
            "in_stock": in_stock,
            "reserved": reserved,
            "sold": sold,
            "monthly_sales": [{"month": m["month"], "count": m["count"]} for m in monthly_list],
        }

    return {
        "total_vehicles": total,
        "in_stock": in_stock,
        "reserved": reserved,
        "sold": sold,
        "invested_in_stock": invested,
        "expenses_in_stock": expenses,
        "stock_total_cost": invested + expenses,
        "total_revenue": revenue,
        "total_profit": profit,
        "avg_ticket": avg_ticket,
        "monthly_sales": monthly_list,
    }


# ============================================================
# DEALERSHIP (settings + API token)
# ============================================================
@api_router.get("/dealership")
async def get_dealership(current: dict = Depends(get_current_user)):
    d = await db.dealerships.find_one({"id": current["dealership_id"]}, {"_id": 0})
    return d


# ============================================================
# SALESPEOPLE
# ============================================================
class SalespersonBase(BaseModel):
    name: str
    commission_amount: float = 0
    phone: str = ""
    email: str = ""
    active: bool = True


class Salesperson(SalespersonBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dealership_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    photo_url: str = ""
    photo_public_id: str = ""


class SalespersonUpdate(BaseModel):
    name: Optional[str] = None
    commission_amount: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    active: Optional[bool] = None


@api_router.get("/salespeople", response_model=List[Salesperson])
async def list_salespeople(current: dict = Depends(get_current_user)):
    # Anyone with any tab access except pure BDC needs salespeople list (used in lead form). 
    # Allow if salespeople tab OR leads tab (since leads form needs salespeople dropdown).
    if not (user_can_access(current, "salespeople") or user_can_access(current, "leads")):
        raise HTTPException(403, "No access")
    items = await db.salespeople.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(500)
    return items


@api_router.get("/salespeople/credentials")
async def list_salesperson_credentials(current: dict = Depends(get_current_user)):
    """Map of salesperson_id -> {has_login: bool, login_email: str} for the owner UI."""
    require_owner(current)
    users = await db.users.find(
        {"dealership_id": current["dealership_id"], "role": "salesperson"},
        {"_id": 0, "salesperson_id": 1, "email": 1}
    ).to_list(500)
    return {u["salesperson_id"]: {"has_login": True, "login_email": u["email"]} for u in users if u.get("salesperson_id")}


class SalespersonCredentials(BaseModel):
    email: EmailStr
    password: str


@api_router.post("/salespeople/{sid}/credentials")
async def set_salesperson_credentials(sid: str, payload: SalespersonCredentials, current: dict = Depends(get_current_user)):
    """Owner sets/replaces login credentials for a salesperson."""
    require_owner(current)
    sp = await db.salespeople.find_one({"id": sid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not sp:
        raise HTTPException(404, "Salesperson not found")
    email = payload.email.lower()
    # Reject if email belongs to a different user (different dealership or different salesperson)
    existing = await db.users.find_one({"email": email})
    if existing and not (
        existing.get("role") == "salesperson"
        and existing.get("dealership_id") == current["dealership_id"]
        and existing.get("salesperson_id") == sid
    ):
        raise HTTPException(400, "Email already in use")
    # Upsert: one login per salesperson
    user_doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": sp.get("name", ""),
        "dealership_id": current["dealership_id"],
        "role": "salesperson",
        "salesperson_id": sid,
    }
    found = await db.users.find_one({"dealership_id": current["dealership_id"], "salesperson_id": sid, "role": "salesperson"})
    if found:
        await db.users.update_one({"id": found["id"]}, {"$set": user_doc})
    else:
        user_doc["id"] = str(uuid.uuid4())
        user_doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.insert_one(user_doc)
    return {"ok": True, "login_email": email}


@api_router.delete("/salespeople/{sid}/credentials")
async def revoke_salesperson_credentials(sid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.users.delete_one({
        "dealership_id": current["dealership_id"],
        "salesperson_id": sid,
        "role": "salesperson",
    })
    return {"deleted": res.deleted_count}


# ---------- BDC users (owner-only management) ----------
class BdcUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str


@api_router.get("/bdc-users")
async def list_bdc_users(current: dict = Depends(get_current_user)):
    require_owner(current)
    users = await db.users.find(
        {"dealership_id": current["dealership_id"], "role": "bdc"},
        {"_id": 0, "password_hash": 0}
    ).sort("full_name", 1).to_list(100)
    return users


@api_router.post("/bdc-users")
async def create_bdc_user(payload: BdcUserCreate, current: dict = Depends(get_current_user)):
    require_owner(current)
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already in use")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "dealership_id": current["dealership_id"],
        "role": "bdc",
        "salesperson_id": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    out = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return out


@api_router.delete("/bdc-users/{uid}")
async def delete_bdc_user(uid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.users.delete_one({"id": uid, "dealership_id": current["dealership_id"], "role": "bdc"})
    if res.deleted_count == 0:
        raise HTTPException(404, "BDC user not found")
    return {"deleted": True}


# ============================================================
# UNIFIED TEAM MANAGEMENT (owner only)
# Centralized place to create/edit/permission salespeople and BDCs.
# ============================================================
class TeamMemberCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str  # "salesperson" | "bdc"
    salesperson_id: str = ""  # required when role=salesperson — links to salespeople collection
    permissions: Optional[List[str]] = None  # if None, role defaults are used
    photo_url: str = ""
    photo_public_id: str = ""


class TeamMemberUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None  # if provided, replaces the password
    permissions: Optional[List[str]] = None


@api_router.get("/team/photo-map")
async def team_photo_map(current: dict = Depends(get_current_user)):
    """Lightweight map of full_name → photo_url for everyone in the dealership.

    Available to ALL authenticated users (not just owner) so we can show avatars
    alongside names anywhere a name appears (sales, leads, history, maintenance).
    """
    rows = await db.users.find(
        {"dealership_id": current["dealership_id"], "role": {"$in": ["owner", "salesperson", "bdc", "gerente", "geral"]}},
        {"_id": 0, "full_name": 1, "photo_url": 1}
    ).to_list(500)
    out = {}
    for u in rows:
        name = (u.get("full_name") or "").strip()
        if name:
            out[name] = u.get("photo_url") or ""
    # Also include salespeople records (covers historical sales where the user
    # was deleted but salesperson record remains)
    sps = await db.salespeople.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0, "name": 1, "photo_url": 1}
    ).to_list(500)
    for s in sps:
        name = (s.get("name") or "").strip()
        if name and not out.get(name):
            out[name] = s.get("photo_url") or ""
    return out


@api_router.get("/team")
async def list_team(current: dict = Depends(get_current_user)):
    """List all non-owner users in this dealership with their permissions."""
    require_owner(current)
    users = await db.users.find(
        {"dealership_id": current["dealership_id"], "role": {"$in": ["owner", "salesperson", "bdc", "gerente", "geral"]}},
        {"_id": 0, "password_hash": 0}
    ).sort("full_name", 1).to_list(500)
    # Resolve salesperson_name when role=salesperson
    sps = {sp["id"]: sp for sp in await db.salespeople.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0}
    ).to_list(500)}
    out = []
    for u in users:
        item = {**u, "effective_permissions": effective_permissions(u)}
        if u.get("salesperson_id") and u["salesperson_id"] in sps:
            item["salesperson_name"] = sps[u["salesperson_id"]].get("name", "")
        out.append(item)
    return {
        "members": out,
        "all_permissions": ALL_TAB_PERMISSIONS,
        "role_defaults": ROLE_DEFAULT_PERMISSIONS,
    }


@api_router.post("/team")
async def create_team_member(payload: TeamMemberCreate, current: dict = Depends(get_current_user)):
    require_owner(current)
    if payload.role not in ("owner", "salesperson", "bdc", "gerente", "geral"):
        raise HTTPException(400, "role must be owner, salesperson, bdc, gerente or geral")
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already in use")

    # For salesperson role: auto-create a matching salespeople record when no salesperson_id is provided.
    # If salesperson_id IS provided, link to that existing salesperson (no duplicate login).
    sp_id = ""
    if payload.role == "salesperson":
        if payload.salesperson_id:
            sp = await db.salespeople.find_one(
                {"id": payload.salesperson_id, "dealership_id": current["dealership_id"]}, {"_id": 0}
            )
            if not sp:
                raise HTTPException(400, "Salesperson record not found")
            existing = await db.users.find_one({
                "dealership_id": current["dealership_id"],
                "salesperson_id": payload.salesperson_id,
                "role": "salesperson",
            })
            if existing:
                raise HTTPException(400, "This salesperson already has a login")
            sp_id = payload.salesperson_id
        else:
            # Auto-create a salespeople record so the user can add someone here without visiting Vendedores tab
            new_sp = Salesperson(
                dealership_id=current["dealership_id"],
                name=payload.full_name,
                email=email,
                phone="",
                commission_amount=0,
                active=True,
            )
            await db.salespeople.insert_one(new_sp.model_dump())
            sp_id = new_sp.id

    perms = payload.permissions if payload.permissions is not None else None
    if perms is not None:
        perms = [p for p in perms if p in ALL_TAB_PERMISSIONS]

    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "dealership_id": current["dealership_id"],
        "role": payload.role,
        "salesperson_id": sp_id,
        "permissions": perms,
        "photo_url": payload.photo_url or "",
        "photo_public_id": payload.photo_public_id or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    # Mirror photo to the linked salespeople doc so avatars surface everywhere immediately.
    if payload.role == "salesperson" and sp_id and (payload.photo_url or payload.photo_public_id):
        await db.salespeople.update_one(
            {"id": sp_id, "dealership_id": current["dealership_id"]},
            {"$set": {"photo_url": payload.photo_url or "", "photo_public_id": payload.photo_public_id or ""}},
        )
    out = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    out["effective_permissions"] = effective_permissions(user)
    return out


@api_router.put("/team/{uid}")
async def update_team_member(uid: str, payload: TeamMemberUpdate, current: dict = Depends(get_current_user)):
    require_owner(current)
    if uid == current.get("id"):
        # Owners manage their own profile via /me endpoints, not /team
        raise HTTPException(403, "Cannot edit yourself via the team endpoint")
    user = await db.users.find_one({"id": uid, "dealership_id": current["dealership_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "Team member not found")

    upd = {}
    if payload.full_name is not None:
        upd["full_name"] = payload.full_name
    if payload.email is not None:
        new_email = payload.email.lower()
        # Check email collision (allow keeping own email)
        clash = await db.users.find_one({"email": new_email})
        if clash and clash.get("id") != uid:
            raise HTTPException(400, "Email already in use")
        upd["email"] = new_email
    if payload.password:
        upd["password_hash"] = hash_password(payload.password)
    if payload.permissions is not None:
        upd["permissions"] = [p for p in payload.permissions if p in ALL_TAB_PERMISSIONS]

    if not upd:
        raise HTTPException(400, "Nothing to update")
    await db.users.update_one({"id": uid}, {"$set": upd})
    refreshed = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    refreshed["effective_permissions"] = effective_permissions(refreshed)
    return refreshed


@api_router.delete("/team/{uid}")
async def delete_team_member(uid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    if uid == current.get("id"):
        raise HTTPException(403, "Cannot delete yourself")
    res = await db.users.delete_one({
        "id": uid,
        "dealership_id": current["dealership_id"],
        "role": {"$in": ["owner", "salesperson", "bdc", "gerente", "geral"]},
    })
    if res.deleted_count == 0:
        raise HTTPException(404, "Team member not found")
    return {"deleted": True}


# ---------- Photo management for team members ----------
class PhotoPayload(BaseModel):
    photo_url: str = ""
    photo_public_id: str = ""


async def _set_user_photo(user_id: str, dealership_id: str, photo_url: str, photo_public_id: str):
    """Sets photo on user doc AND mirrors to salespeople collection if linked."""
    await db.users.update_one(
        {"id": user_id, "dealership_id": dealership_id},
        {"$set": {"photo_url": photo_url, "photo_public_id": photo_public_id}},
    )
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "salesperson_id": 1, "role": 1})
    if user and user.get("role") == "salesperson" and user.get("salesperson_id"):
        await db.salespeople.update_one(
            {"id": user["salesperson_id"], "dealership_id": dealership_id},
            {"$set": {"photo_url": photo_url, "photo_public_id": photo_public_id}},
        )


@api_router.put("/me/photo")
async def update_my_photo(payload: PhotoPayload, current: dict = Depends(get_current_user)):
    """Any logged-in user can update their own photo."""
    await _set_user_photo(current["id"], current["dealership_id"], payload.photo_url, payload.photo_public_id)
    return {"ok": True, "photo_url": payload.photo_url}


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/me/change-password")
async def change_my_password(payload: ChangePasswordPayload, current: dict = Depends(get_current_user)):
    """Any logged-in user can change their own password.

    Requires the current password for confirmation. Minimum new password length: 6.
    """
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0, "password_hash": 1})
    if not user or not verify_password(payload.current_password, user.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(400, "New password must be different from the current one")
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True}



@api_router.put("/team/{uid}/photo")
async def set_team_photo(uid: str, payload: PhotoPayload, current: dict = Depends(get_current_user)):
    """Owner sets photo for any team member. Owners manage their own photo via /me/photo."""
    require_owner(current)
    if uid == current.get("id"):
        raise HTTPException(403, "Use /me/photo to set your own photo")
    user = await db.users.find_one({"id": uid, "dealership_id": current["dealership_id"]}, {"_id": 0, "id": 1, "role": 1})
    if not user:
        raise HTTPException(404, "Team member not found")
    await _set_user_photo(uid, current["dealership_id"], payload.photo_url, payload.photo_public_id)
    return {"ok": True, "photo_url": payload.photo_url}


@api_router.post("/salespeople", response_model=Salesperson)
async def create_salesperson(payload: SalespersonBase, current: dict = Depends(get_current_user)):
    require_owner(current)
    sp = Salesperson(dealership_id=current["dealership_id"], **payload.model_dump())
    await db.salespeople.insert_one(sp.model_dump())
    return sp


@api_router.put("/salespeople/{sid}", response_model=Salesperson)
async def update_salesperson(sid: str, payload: SalespersonUpdate, current: dict = Depends(get_current_user)):
    require_owner(current)
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.salespeople.update_one(
        {"id": sid, "dealership_id": current["dealership_id"]}, {"$set": upd}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Salesperson not found")
    # Sync salesperson_name on existing sold vehicles if name changed
    if "name" in upd:
        await db.vehicles.update_many(
            {"dealership_id": current["dealership_id"], "salesperson_id": sid},
            {"$set": {"salesperson_name": upd["name"]}}
        )
    return await db.salespeople.find_one({"id": sid}, {"_id": 0})


@api_router.delete("/salespeople/{sid}")
async def delete_salesperson(sid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.salespeople.delete_one({"id": sid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Salesperson not found")
    # Also revoke login (if any)
    await db.users.delete_one({
        "dealership_id": current["dealership_id"],
        "salesperson_id": sid,
        "role": "salesperson",
    })
    # Vehicles keep snapshot of salesperson_name; only clear the FK
    await db.vehicles.update_many(
        {"dealership_id": current["dealership_id"], "salesperson_id": sid},
        {"$set": {"salesperson_id": ""}}
    )
    return {"deleted": True}


@api_router.get("/sales-report")
async def sales_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current: dict = Depends(get_current_user),
):
    """All sold vehicles with salesperson details. Optional year/month filter.
    Salespeople only see their own sales and don't get profit/cost data.
    """
    q = {"dealership_id": current["dealership_id"], "status": "sold"}
    # Filter to own sales when role=salesperson
    if is_salesperson(current):
        q["salesperson_id"] = current.get("salesperson_id") or "__none__"
    sales = await db.vehicles.find(q, {"_id": 0}).sort("sold_at", -1).to_list(2000)

    def parse_dt(iso: str):
        if not iso:
            return None
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except Exception:
            return None

    sp_view = is_salesperson(current)
    rows = []
    for v in sales:
        dt = parse_dt(v.get("sold_at"))
        if year and (not dt or dt.year != year):
            continue
        if month and (not dt or dt.month != month):
            continue
        sale_amt = float(v.get("sold_price") or v.get("sale_price") or 0)
        cost = float(v.get("purchase_price") or 0) + float(v.get("expenses") or 0)
        profit = sale_amt - cost
        row = {
            "vehicle_id": v["id"],
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "year": v.get("year", 0),
            "buyer_name": v.get("buyer_name", ""),
            "sold_at": v.get("sold_at", ""),
            "day": dt.day if dt else None,
            "month": dt.month if dt else None,
            "year_sold": dt.year if dt else None,
            "sold_price": sale_amt,
            "salesperson_id": v.get("salesperson_id", ""),
            "salesperson_name": v.get("salesperson_name", "") or "—",
            "commission_amount": float(v.get("commission_amount") or 0),
            "commission_paid": bool(v.get("commission_paid", False)),
            "image": (v.get("images") or [None])[0] if v.get("images") else None,
        }
        if not sp_view:
            row["profit"] = profit
        rows.append(row)

    # Aggregate by salesperson
    by_sp = {}
    for r in rows:
        key = r["salesperson_id"] or "unassigned"
        bucket = by_sp.setdefault(key, {
            "salesperson_id": r["salesperson_id"],
            "salesperson_name": r["salesperson_name"],
            "count": 0,
            "total_revenue": 0.0,
            "total_profit": 0.0,
            "commission_total": 0.0,
            "commission_paid_total": 0.0,
            "commission_pending_total": 0.0,
            "commission_paid_count": 0,
            "commission_pending_count": 0,
        })
        bucket["count"] += 1
        bucket["total_revenue"] += r["sold_price"]
        bucket["total_profit"] += r.get("profit", 0)
        bucket["commission_total"] += r["commission_amount"]
        if r["commission_paid"]:
            bucket["commission_paid_total"] += r["commission_amount"]
            bucket["commission_paid_count"] += 1
        else:
            bucket["commission_pending_total"] += r["commission_amount"]
            bucket["commission_pending_count"] += 1

    response = {
        "rows": rows,
        "by_salesperson": list(by_sp.values()),
        "total_sales": len(rows),
        "total_commission": sum(r["commission_amount"] for r in rows),
        "total_commission_paid": sum(r["commission_amount"] for r in rows if r["commission_paid"]),
        "total_commission_pending": sum(r["commission_amount"] for r in rows if not r["commission_paid"]),
    }
    if not sp_view:
        response["total_revenue"] = sum(r["sold_price"] for r in rows)
        response["total_profit"] = sum(r.get("profit", 0) for r in rows)
        # strip total_profit from per-salesperson aggregates? keep it, owner only sees this anyway
    else:
        # Strip aggregate totals that reveal owner financials
        for b in response["by_salesperson"]:
            b.pop("total_revenue", None)
            b.pop("total_profit", None)
    return response


@api_router.post("/dealership/regenerate-token")
async def regen_token(current: dict = Depends(get_current_user)):
    require_owner(current)
    new_token = secrets.token_urlsafe(24)
    await db.dealerships.update_one({"id": current["dealership_id"]}, {"$set": {"api_token": new_token}})
    return {"api_token": new_token}


# ============================================================
# LEADERBOARD + WEEKLY PROMOTION (visible to all roles)
# ============================================================
@api_router.get("/leaderboard")
async def leaderboard(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current: dict = Depends(get_current_user),
):
    """Salesperson ranking by car count for the period. Includes revenue for owner only."""
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    start, end = _month_range(y, m)
    did = current["dealership_id"]
    sps = await db.salespeople.find({"dealership_id": did}, {"_id": 0}).to_list(500)
    sold = await db.vehicles.find(
        {"dealership_id": did, "status": "sold", "sold_at": {"$gte": f"{start}T00:00:00", "$lt": f"{end}T00:00:00"}},
        {"_id": 0}
    ).to_list(2000)
    by_sp = {}
    for v in sold:
        sp_id = v.get("salesperson_id")
        if not sp_id:
            continue  # Don't show unassigned sales in leaderboard
        bucket = by_sp.setdefault(sp_id, {"salesperson_id": sp_id, "salesperson_name": v.get("salesperson_name", "") or "", "count": 0, "revenue": 0.0, "photo_url": ""})
        bucket["count"] += 1
        bucket["revenue"] += float(v.get("sold_price") or 0)
    # Add salespeople with zero sales (and attach photo_url for everyone)
    sp_by_id = {sp["id"]: sp for sp in sps}
    for sp in sps:
        if sp["id"] not in by_sp:
            by_sp[sp["id"]] = {"salesperson_id": sp["id"], "salesperson_name": sp.get("name", ""), "count": 0, "revenue": 0.0, "photo_url": sp.get("photo_url", "") or ""}
    for sp_id_key, bucket in by_sp.items():
        if sp_id_key in sp_by_id:
            bucket["photo_url"] = sp_by_id[sp_id_key].get("photo_url", "") or ""
    rows = sorted(by_sp.values(), key=lambda r: (-r["count"], -r["revenue"], r["salesperson_name"]))
    # Strip revenue for salesperson role (keep photo_url so they see avatars)
    if is_salesperson(current):
        rows = [{"salesperson_id": r["salesperson_id"], "salesperson_name": r["salesperson_name"], "count": r["count"], "photo_url": r.get("photo_url", "")} for r in rows]
    # Assign ranks (1-based, ties share rank)
    last_count = None
    last_rank = 0
    for i, r in enumerate(rows):
        if r["count"] != last_count:
            last_rank = i + 1
            last_count = r["count"]
        r["rank"] = last_rank
    return {"year": y, "month": m, "rows": rows, "total_sold": sum(r["count"] for r in rows)}


class PromotionUpdate(BaseModel):
    title: str = ""
    description: str = ""
    image_url: str = ""
    valid_until: str = ""  # YYYY-MM-DD optional


@api_router.get("/promotion")
async def get_promotion(current: dict = Depends(get_current_user)):
    """Current weekly promotion for the dealership (visible to all roles)."""
    d = await db.dealerships.find_one({"id": current["dealership_id"]}, {"_id": 0, "promotion": 1})
    promo = (d or {}).get("promotion") or {"title": "", "description": "", "image_url": "", "valid_until": ""}
    return promo


@api_router.put("/promotion")
async def update_promotion(payload: PromotionUpdate, current: dict = Depends(get_current_user)):
    require_owner(current)
    promo = {
        "title": payload.title or "",
        "description": payload.description or "",
        "image_url": payload.image_url or "",
        "valid_until": payload.valid_until or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current.get("full_name") or current.get("email") or "",
    }
    await db.dealerships.update_one({"id": current["dealership_id"]}, {"$set": {"promotion": promo}})
    return promo


# ============================================================
# OPERATIONAL EXPENSES (owner only)
# ============================================================
class OperationalExpenseBase(BaseModel):
    date: str  # YYYY-MM-DD
    category: str = "other"
    description: str = ""
    amount: float = 0
    attachment_url: str = ""
    attachment_public_id: str = ""


class OperationalExpense(OperationalExpenseBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dealership_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OperationalExpenseUpdate(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    attachment_url: Optional[str] = None
    attachment_public_id: Optional[str] = None


def _month_range(year: int, month: int) -> tuple:
    """Returns (start_date_str, end_date_str_exclusive) in YYYY-MM-DD for the given month."""
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


@api_router.get("/expenses", response_model=List[OperationalExpense])
async def list_expenses(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current: dict = Depends(get_current_user),
):
    require_owner(current)
    q = {"dealership_id": current["dealership_id"]}
    if year and month:
        start, end = _month_range(year, month)
        q["date"] = {"$gte": start, "$lt": end}
    items = await db.operational_expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return items


@api_router.post("/expenses", response_model=OperationalExpense)
async def create_expense(payload: OperationalExpenseBase, current: dict = Depends(get_current_user)):
    require_owner(current)
    e = OperationalExpense(dealership_id=current["dealership_id"], **payload.model_dump())
    await db.operational_expenses.insert_one(e.model_dump())
    return e


@api_router.put("/expenses/{eid}", response_model=OperationalExpense)
async def update_expense(eid: str, payload: OperationalExpenseUpdate, current: dict = Depends(get_current_user)):
    require_owner(current)
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.operational_expenses.update_one(
        {"id": eid, "dealership_id": current["dealership_id"]}, {"$set": upd}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Expense not found")
    return await db.operational_expenses.find_one({"id": eid}, {"_id": 0})


@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.operational_expenses.delete_one({"id": eid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"deleted": True}


# ============================================================
# LOST SALES — when a sale fell through and the car returns to inventory
# ============================================================
class RevertSaleRequest(BaseModel):
    reason: str = "other"  # financing_denied | client_changed_mind | mechanical_issue | price_disagreement | found_better_deal | other
    notes: str = ""


@api_router.post("/vehicles/{vid}/revert-sale")
async def revert_sale(vid: str, payload: RevertSaleRequest, current: dict = Depends(get_current_user)):
    """Roll back a sold vehicle to in_stock and log a lost_sale audit record."""
    require_owner(current)
    v = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if v.get("status") != "sold":
        raise HTTPException(400, "Vehicle is not sold")

    # Snapshot the sale details before clearing them
    log = {
        "id": str(uuid.uuid4()),
        "dealership_id": current["dealership_id"],
        "vehicle_id": vid,
        "make": v.get("make", ""),
        "model": v.get("model", ""),
        "year": v.get("year", 0),
        "image": (v.get("images") or [None])[0] if v.get("images") else None,
        "sold_price": float(v.get("sold_price") or 0),
        "buyer_name": v.get("buyer_name", ""),
        "salesperson_id": v.get("salesperson_id", ""),
        "salesperson_name": v.get("salesperson_name", "") or "",
        "delivery_step_when_lost": int(v.get("delivery_step") or 0),
        "sold_at": v.get("sold_at", ""),
        "reason": payload.reason or "other",
        "notes": payload.notes or "",
        "lost_at": datetime.now(timezone.utc).isoformat(),
        "date": datetime.now(timezone.utc).date().isoformat(),
        "reverted_by": current.get("id", ""),
        "reverted_by_name": current.get("full_name", "") or current.get("email", ""),
    }
    await db.lost_sales.insert_one(log)
    # Strip mongo's injected _id so the response stays JSON-serializable
    log.pop("_id", None)

    # Reset the vehicle (preserve purchase_price + expense_items)
    reset_fields = {
        "status": "in_stock",
        "sold_price": 0,
        "sold_at": None,
        "delivered_at": None,
        "delivery_step": 0,
        "buyer_name": "",
        "buyer_phone": "",
        "payment_method": "",
        "bank_name": "",
        "salesperson_id": "",
        "salesperson_name": "",
        "commission_amount": 0,
        "commission_paid": False,
    }
    await db.vehicles.update_one({"id": vid}, {"$set": reset_fields})
    log.pop("dealership_id", None)
    return {"ok": True, "lost_sale": log}


@api_router.get("/lost-sales")
async def list_lost_sales(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current: dict = Depends(get_current_user),
):
    require_owner(current)
    q = {"dealership_id": current["dealership_id"]}
    if year and month:
        start, end = _month_range(year, month)
        q["date"] = {"$gte": start, "$lt": end}
    rows = await db.lost_sales.find(q, {"_id": 0, "dealership_id": 0}).sort("lost_at", -1).to_list(2000)
    # Group by reason
    by_reason = {}
    for r in rows:
        reason = r.get("reason") or "other"
        bucket = by_reason.setdefault(reason, {"reason": reason, "count": 0, "lost_revenue": 0.0})
        bucket["count"] += 1
        bucket["lost_revenue"] += float(r.get("sold_price") or 0)
    return {
        "rows": rows,
        "by_reason": list(by_reason.values()),
        "total_count": len(rows),
        "total_lost_revenue": sum(float(r.get("sold_price") or 0) for r in rows),
    }


# ============================================================
# FINANCIAL DASHBOARD (owner only)
# ============================================================
@api_router.get("/financial/closing")
async def financial_closing(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current: dict = Depends(get_current_user),
):
    """Monthly closing: gross profit from cars sold − operational expenses − paid commissions = net profit.

    If year/month not provided, defaults to current month (UTC).
    """
    require_owner(current)
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    start, end = _month_range(y, m)
    did = current["dealership_id"]

    # Vehicles sold in the month (use sold_at date)
    sold_q = {
        "dealership_id": did,
        "status": "sold",
        "sold_at": {"$gte": f"{start}T00:00:00", "$lt": f"{end}T00:00:00"},
    }
    sold = await db.vehicles.find(sold_q, {"_id": 0}).to_list(2000)
    sold_rows = []
    total_revenue = 0.0
    total_cost = 0.0
    paid_commissions = 0.0
    for v in sold:
        rev = float(v.get("sold_price") or v.get("sale_price") or 0)
        purchase = float(v.get("purchase_price") or 0)
        exp = float(v.get("expenses") or 0)
        cost = purchase + exp
        commission_amt = float(v.get("commission_amount") or 0)
        commission_paid_flag = bool(v.get("commission_paid", False))
        commission_deduction = commission_amt if commission_paid_flag else 0.0
        profit = rev - cost - commission_deduction
        total_revenue += rev
        total_cost += cost
        if commission_paid_flag:
            paid_commissions += commission_amt
        sold_rows.append({
            "vehicle_id": v["id"],
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "year": v.get("year", 0),
            "buyer_name": v.get("buyer_name", ""),
            "salesperson_name": v.get("salesperson_name", "") or "—",
            "sold_at": v.get("sold_at", ""),
            "sold_price": rev,
            "purchase_price": purchase,
            "expenses": exp,
            "cost": cost,
            "commission_amount": commission_amt,
            "commission_paid": commission_paid_flag,
            "profit": profit,
            "image": (v.get("images") or [None])[0] if v.get("images") else None,
        })
    gross_profit = total_revenue - total_cost

    # Operational expenses in the month
    exp_items = await db.operational_expenses.find(
        {"dealership_id": did, "date": {"$gte": start, "$lt": end}}, {"_id": 0}
    ).sort("date", -1).to_list(2000)
    operational_total = sum(float(e.get("amount") or 0) for e in exp_items)

    net_profit = gross_profit - operational_total - paid_commissions

    return {
        "year": y,
        "month": m,
        "vehicles_sold": sold_rows,
        "vehicles_count": len(sold_rows),
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "operational_expenses": exp_items,
        "operational_total": operational_total,
        "paid_commissions": paid_commissions,
        "net_profit": net_profit,
    }



# ============================================================
# MONTHLY CLOSING ARCHIVE — generates a PDF snapshot of the month
# (KPIs + cars sold + maintenance + operational expenses) and
# saves it to Cloudinary so the user can re-download anytime.
# Optional: marks all that month's commissions as paid in one click.
# ============================================================
class MonthlyCloseRequest(BaseModel):
    year: int
    month: int
    mark_commissions_paid: bool = False


_MONTHS_PT = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _build_closing_pdf(dealership_name: str, snapshot: dict) -> bytes:
    """Build a printable PDF of the monthly closing. Returns raw bytes."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=18, textColor=colors.HexColor("#D92D20"), spaceAfter=4)
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#666666"), spaceAfter=18)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#222222"), spaceAfter=6, spaceBefore=14)
    body = styles["Normal"]

    def money(n):
        try:
            return f"R$ {float(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return "R$ 0,00"

    elements = []
    elements.append(Paragraph(dealership_name or "—", title_style))
    elements.append(Paragraph(
        f"Fechamento mensal · {_MONTHS_PT[snapshot['month']]} de {snapshot['year']}",
        sub_style,
    ))

    # KPIs
    kpi_data = [
        ["Lucro bruto dos carros", money(snapshot["gross_profit"])],
        ["Despesas operacionais", money(snapshot["operational_total"])],
        ["Comissões pagas", money(snapshot["paid_commissions"])],
        ["LUCRO LÍQUIDO", money(snapshot["net_profit"])],
    ]
    kpi_table = Table(kpi_data, colWidths=[10 * cm, 6 * cm])
    kpi_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF1F0")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#D92D20")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(kpi_table)

    # Cars sold
    elements.append(Paragraph(f"Veículos vendidos ({snapshot['vehicles_count']})", h2))
    if snapshot["vehicles_sold"]:
        rows = [["Veículo", "Comprador", "Vendedor", "Vendido por", "Lucro"]]
        for v in snapshot["vehicles_sold"]:
            rows.append([
                f"{v.get('year','')} {v.get('make','')} {v.get('model','')}".strip(),
                v.get("buyer_name") or "—",
                v.get("salesperson_name") or "—",
                money(v.get("sold_price")),
                money(v.get("profit")),
            ])
        t = Table(rows, colWidths=[5.5 * cm, 3.5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#eeeeee")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("Nenhum veículo vendido neste mês.", body))

    # Operational expenses
    elements.append(Paragraph(f"Despesas operacionais ({len(snapshot['operational_expenses'])})", h2))
    if snapshot["operational_expenses"]:
        rows = [["Data", "Categoria", "Descrição", "Valor"]]
        for e in snapshot["operational_expenses"]:
            rows.append([
                e.get("date") or "—",
                e.get("category") or "—",
                (e.get("description") or "")[:60],
                money(e.get("amount")),
            ])
        t = Table(rows, colWidths=[2.5 * cm, 3 * cm, 8.5 * cm, 3 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#eeeeee")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("Sem despesas operacionais neste mês.", body))

    # Footer
    elements.append(Spacer(1, 0.8 * cm))
    elements.append(Paragraph(
        f"Fechado em {snapshot.get('closed_at','')[:19].replace('T',' ')} por {snapshot.get('closed_by','')}",
        ParagraphStyle("foot", parent=body, fontSize=8, textColor=colors.HexColor("#999999"), alignment=TA_RIGHT),
    ))

    doc.build(elements)
    return buf.getvalue()


@api_router.get("/financial/closings")
async def list_closings(current: dict = Depends(get_current_user)):
    require_owner(current)
    rows = await db.monthly_closings.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0, "snapshot": 0, "pdf_b64": 0}
    ).sort([("year", -1), ("month", -1)]).to_list(500)
    return rows


@api_router.post("/financial/closings")
async def create_closing(payload: MonthlyCloseRequest, current: dict = Depends(get_current_user)):
    """Generate a PDF snapshot of the given month and archive it.

    If a closing for the same year+month already exists, it is replaced.
    """
    require_owner(current)
    did = current["dealership_id"]

    # Reuse the read-only computation
    snap = await financial_closing(year=payload.year, month=payload.month, current=current)

    # Optionally mark commissions as paid for that month's sold vehicles
    marked = 0
    if payload.mark_commissions_paid and snap["vehicles_sold"]:
        ids = [v["vehicle_id"] for v in snap["vehicles_sold"] if not v["commission_paid"] and v["commission_amount"] > 0]
        if ids:
            res = await db.vehicles.update_many(
                {"id": {"$in": ids}, "dealership_id": did},
                {"$set": {"commission_paid": True}, "$push": {"history": {
                    "type": "commission_paid",
                    "at": datetime.now(timezone.utc).isoformat(),
                    "by": current.get("full_name") or current.get("email") or "",
                    "via": "monthly_closing",
                }}},
            )
            marked = res.modified_count
        # Recompute snapshot with the new paid commissions for the saved PDF
        snap = await financial_closing(year=payload.year, month=payload.month, current=current)

    closed_at = datetime.now(timezone.utc).isoformat()
    closed_by = current.get("full_name") or current.get("email") or ""
    snap_full = {**snap, "closed_at": closed_at, "closed_by": closed_by}

    # Build PDF (kept as base64 in Mongo so we don't depend on Cloudinary's
    # PDF delivery being enabled — raw PDFs there are blocked by default).
    dealership = await db.dealerships.find_one({"id": did}, {"_id": 0, "name": 1})
    pdf_bytes = _build_closing_pdf((dealership or {}).get("name", "Inter Car"), snap_full)
    pdf_b64 = base64.b64encode(pdf_bytes).decode("ascii")

    # Replace any prior closing for the same month
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "dealership_id": did,
        "year": payload.year,
        "month": payload.month,
        "closed_at": closed_at,
        "closed_by": closed_by,
        "pdf_size": len(pdf_bytes),
        "pdf_b64": pdf_b64,
        "vehicles_count": snap["vehicles_count"],
        "total_revenue": snap["total_revenue"],
        "gross_profit": snap["gross_profit"],
        "operational_total": snap["operational_total"],
        "paid_commissions": snap["paid_commissions"],
        "net_profit": snap["net_profit"],
        "commissions_marked_paid": marked,
        "snapshot": snap_full,
    }
    await db.monthly_closings.delete_many({"dealership_id": did, "year": payload.year, "month": payload.month})
    await db.monthly_closings.insert_one(doc)
    out = {k: v for k, v in doc.items() if k not in ("snapshot", "_id", "pdf_b64")}
    return out


@api_router.get("/financial/closings/{cid}/pdf")
async def download_closing_pdf(cid: str, current: dict = Depends(get_current_user)):
    """Stream the archived PDF back to the user."""
    require_owner(current)
    doc = await db.monthly_closings.find_one(
        {"id": cid, "dealership_id": current["dealership_id"]}, {"_id": 0, "pdf_b64": 1, "year": 1, "month": 1}
    )
    if not doc or not doc.get("pdf_b64"):
        raise HTTPException(404, "Closing PDF not found")
    pdf_bytes = base64.b64decode(doc["pdf_b64"])
    filename = f"fechamento-{doc['year']:04d}-{doc['month']:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api_router.delete("/financial/closings/{cid}")
async def delete_closing(cid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.monthly_closings.delete_one({"id": cid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Closing not found")
    return {"deleted": True}



# ============================================================
# FLOOR PLANS — dealership inventory financing tracker
# ============================================================
class FloorPlanPayload(BaseModel):
    name: str
    color: str = "#D92D20"


class FloorPlanPaymentPayload(BaseModel):
    floor_plan_id: str
    vehicle_id: str = ""
    amount: float
    due_date: str  # ISO date YYYY-MM-DD
    notes: str = ""
    paid: bool = False


@api_router.get("/floor-plans")
async def list_floor_plans(current: dict = Depends(get_current_user)):
    require_owner(current)
    rows = await db.floor_plans.find(
        {"dealership_id": current["dealership_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return rows


@api_router.post("/floor-plans")
async def create_floor_plan(payload: FloorPlanPayload, current: dict = Depends(get_current_user)):
    require_owner(current)
    fp = {
        "id": str(uuid.uuid4()),
        "dealership_id": current["dealership_id"],
        "name": payload.name.strip() or "Floor Plan",
        "color": payload.color or "#D92D20",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.floor_plans.insert_one(fp)
    return {k: v for k, v in fp.items() if k != "_id"}


@api_router.put("/floor-plans/{fp_id}")
async def update_floor_plan(fp_id: str, payload: FloorPlanPayload, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.floor_plans.update_one(
        {"id": fp_id, "dealership_id": current["dealership_id"]},
        {"$set": {"name": payload.name.strip(), "color": payload.color}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Floor plan not found")
    return {"ok": True}


@api_router.delete("/floor-plans/{fp_id}")
async def delete_floor_plan(fp_id: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    # Cascade-delete its payments
    await db.floor_plan_payments.delete_many({"floor_plan_id": fp_id, "dealership_id": current["dealership_id"]})
    res = await db.floor_plans.delete_one({"id": fp_id, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Floor plan not found")
    return {"deleted": True}


@api_router.get("/floor-plans/payments")
async def list_floor_plan_payments(
    year: int = 0, month: int = 0,
    current: dict = Depends(get_current_user),
):
    """Returns payments for a given month. If year/month omitted, returns the current month."""
    require_owner(current)
    if not year or not month:
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month
    prefix = f"{year:04d}-{month:02d}"
    rows = await db.floor_plan_payments.find(
        {"dealership_id": current["dealership_id"], "due_date": {"$regex": f"^{prefix}"}},
        {"_id": 0}
    ).sort("due_date", 1).to_list(500)
    return rows


@api_router.post("/floor-plans/payments")
async def create_payment(payload: FloorPlanPaymentPayload, current: dict = Depends(get_current_user)):
    require_owner(current)
    fp = await db.floor_plans.find_one({"id": payload.floor_plan_id, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not fp:
        raise HTTPException(400, "Invalid floor plan")
    pay = {
        "id": str(uuid.uuid4()),
        "dealership_id": current["dealership_id"],
        "floor_plan_id": payload.floor_plan_id,
        "floor_plan_name": fp["name"],
        "floor_plan_color": fp.get("color", "#D92D20"),
        "vehicle_id": payload.vehicle_id or "",
        "amount": float(payload.amount or 0),
        "due_date": payload.due_date,
        "notes": payload.notes or "",
        "paid": bool(payload.paid),
        "paid_at": datetime.now(timezone.utc).isoformat() if payload.paid else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "dealership_id": current["dealership_id"]}, {"_id": 0, "make": 1, "model": 1, "year": 1})
        if v:
            pay["vehicle_label"] = f"{v.get('year','')} {v.get('make','')} {v.get('model','')}".strip()
    await db.floor_plan_payments.insert_one(pay)
    return {k: v for k, v in pay.items() if k != "_id"}


@api_router.put("/floor-plans/payments/{pid}")
async def update_payment(pid: str, payload: FloorPlanPaymentPayload, current: dict = Depends(get_current_user)):
    require_owner(current)
    fp = await db.floor_plans.find_one({"id": payload.floor_plan_id, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not fp:
        raise HTTPException(400, "Invalid floor plan")
    upd = {
        "floor_plan_id": payload.floor_plan_id,
        "floor_plan_name": fp["name"],
        "floor_plan_color": fp.get("color", "#D92D20"),
        "vehicle_id": payload.vehicle_id or "",
        "amount": float(payload.amount or 0),
        "due_date": payload.due_date,
        "notes": payload.notes or "",
        "paid": bool(payload.paid),
        "paid_at": datetime.now(timezone.utc).isoformat() if payload.paid else None,
    }
    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "dealership_id": current["dealership_id"]}, {"_id": 0, "make": 1, "model": 1, "year": 1})
        if v:
            upd["vehicle_label"] = f"{v.get('year','')} {v.get('make','')} {v.get('model','')}".strip()
    res = await db.floor_plan_payments.update_one(
        {"id": pid, "dealership_id": current["dealership_id"]},
        {"$set": upd},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Payment not found")
    return {"ok": True}


@api_router.post("/floor-plans/payments/{pid}/toggle")
async def toggle_paid(pid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    p = await db.floor_plan_payments.find_one(
        {"id": pid, "dealership_id": current["dealership_id"]}, {"_id": 0, "paid": 1}
    )
    if not p:
        raise HTTPException(404, "Payment not found")
    new_paid = not bool(p.get("paid"))
    await db.floor_plan_payments.update_one(
        {"id": pid, "dealership_id": current["dealership_id"]},
        {"$set": {"paid": new_paid, "paid_at": datetime.now(timezone.utc).isoformat() if new_paid else None}},
    )
    return {"ok": True, "paid": new_paid}


@api_router.delete("/floor-plans/payments/{pid}")
async def delete_payment(pid: str, current: dict = Depends(get_current_user)):
    require_owner(current)
    res = await db.floor_plan_payments.delete_one({"id": pid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Payment not found")
    return {"deleted": True}


@api_router.get("/floor-plans/alerts")
async def floor_plan_alerts(current: dict = Depends(get_current_user)):
    """In-app alerts for upcoming + overdue Floor Plan payments.

    Owner + gerente only. Returns 3 buckets:
      - overdue: due_date < today AND not paid
      - today: due_date == today AND not paid
      - tomorrow: due_date == today+1 AND not paid
    """
    role = (current or {}).get("role") or "owner"
    if role not in ("owner", "gerente"):
        return {"overdue": [], "today": [], "tomorrow": [], "total": 0}
    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)
    today_iso = today.isoformat()
    tomorrow_iso = tomorrow.isoformat()
    rows = await db.floor_plan_payments.find(
        {"dealership_id": current["dealership_id"], "paid": False, "due_date": {"$lte": tomorrow_iso}},
        {"_id": 0}
    ).sort("due_date", 1).to_list(500)
    overdue, today_b, tomorrow_b = [], [], []
    for p in rows:
        d = p.get("due_date") or ""
        if d < today_iso:
            try:
                p["days_late"] = (today - datetime.fromisoformat(d).date()).days
            except Exception:
                p["days_late"] = 0
            overdue.append(p)
        elif d == today_iso:
            today_b.append(p)
        elif d == tomorrow_iso:
            tomorrow_b.append(p)
    return {
        "overdue": overdue,
        "today": today_b,
        "tomorrow": tomorrow_b,
        "total": len(overdue) + len(today_b) + len(tomorrow_b),
    }




@api_router.get("/financial/sold-vehicles")
async def financial_sold_all(current: dict = Depends(get_current_user)):
    """All-time sold vehicles with purchase_price and sale_price for owner editing."""
    require_owner(current)
    sold = await db.vehicles.find(
        {"dealership_id": current["dealership_id"], "status": "sold"},
        {"_id": 0}
    ).sort("sold_at", -1).to_list(2000)
    rows = []
    for v in sold:
        rev = float(v.get("sold_price") or v.get("sale_price") or 0)
        purchase = float(v.get("purchase_price") or 0)
        exp = float(v.get("expenses") or 0)
        commission_amt = float(v.get("commission_amount") or 0)
        commission_paid_flag = bool(v.get("commission_paid", False))
        commission_deduction = commission_amt if commission_paid_flag else 0.0
        rows.append({
            "vehicle_id": v["id"],
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "year": v.get("year", 0),
            "buyer_name": v.get("buyer_name", ""),
            "salesperson_name": v.get("salesperson_name", "") or "—",
            "sold_at": v.get("sold_at", ""),
            "sold_price": rev,
            "purchase_price": purchase,
            "expenses": exp,
            "commission_amount": commission_amt,
            "commission_paid": commission_paid_flag,
            "profit": rev - purchase - exp - commission_deduction,
            "image": (v.get("images") or [None])[0] if v.get("images") else None,
        })
    return rows


@api_router.get("/financial/monthly")
async def financial_monthly(months: int = 6, current: dict = Depends(get_current_user)):
    """Last N months net profit summary for owner chart."""
    require_owner(current)
    did = current["dealership_id"]
    now = datetime.now(timezone.utc)
    out = []
    for i in range(months - 1, -1, -1):
        # Compute target month/year going back i months from current
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        start, end = _month_range(y, m)
        sold = await db.vehicles.find(
            {"dealership_id": did, "status": "sold", "sold_at": {"$gte": f"{start}T00:00:00", "$lt": f"{end}T00:00:00"}},
            {"_id": 0, "sold_price": 1, "purchase_price": 1, "expenses": 1, "commission_amount": 1, "commission_paid": 1}
        ).to_list(2000)
        rev = sum(float(v.get("sold_price") or 0) for v in sold)
        cost = sum(float(v.get("purchase_price") or 0) + float(v.get("expenses") or 0) for v in sold)
        gross = rev - cost
        commissions = sum(float(v.get("commission_amount") or 0) for v in sold if v.get("commission_paid"))
        opex_items = await db.operational_expenses.find(
            {"dealership_id": did, "date": {"$gte": start, "$lt": end}}, {"_id": 0, "amount": 1}
        ).to_list(2000)
        opex = sum(float(e.get("amount") or 0) for e in opex_items)
        out.append({
            "year": y,
            "month": m,
            "label": f"{y:04d}-{m:02d}",
            "revenue": rev,
            "gross_profit": gross,
            "operational_expenses": opex,
            "paid_commissions": commissions,
            "net_profit": gross - opex - commissions,
            "vehicles_count": len(sold),
        })
    return out


# ============================================================
# LEADS — BDC dashboard (BDC adds, salespeople claim)
# ============================================================
LEAD_STATUSES = [
    "new", "in_progress", "hot_lead", "follow_up", "cold",
    "no_answer", "wrong_number", "deal_closed", "lost", "future"
]
LEAD_SOURCES = [
    "facebook", "instagram", "google_ads", "cargurus", "carfax",
    "craigslist", "walk_in", "referral", "phone", "other"
]


class LeadBase(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    source: str = "other"
    status: str = "new"
    interest_make_model: str = ""
    budget: float = 0
    payment_type: str = ""  # cash | financing
    notes: str = ""
    language: str = ""
    last_contact_at: str = ""  # YYYY-MM-DD
    salesperson_id: str = ""
    salesperson_name: str = ""
    attachments: List[dict] = Field(default_factory=list)


class Lead(LeadBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dealership_id: str
    created_by_id: str = ""
    created_by_name: str = ""
    monday_item_id: str = ""  # external reference if imported
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    interest_make_model: Optional[str] = None
    budget: Optional[float] = None
    payment_type: Optional[str] = None
    notes: Optional[str] = None
    language: Optional[str] = None
    last_contact_at: Optional[str] = None
    salesperson_id: Optional[str] = None
    salesperson_name: Optional[str] = None
    attachments: Optional[List[dict]] = None


@api_router.get("/leads")
async def list_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned: Optional[str] = None,  # "yes" | "no" | "mine"
    search: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    require_tab(current, "leads")
    q = {"dealership_id": current["dealership_id"]}
    if status:
        q["status"] = status
    if source:
        q["source"] = source
    if assigned == "yes":
        q["salesperson_id"] = {"$nin": ["", None]}
    elif assigned == "no":
        q["$or"] = [{"salesperson_id": ""}, {"salesperson_id": None}, {"salesperson_id": {"$exists": False}}]
    elif assigned == "mine":
        q["salesperson_id"] = current.get("salesperson_id") or "__none__"
    # Salespeople only see unassigned + their own leads (no other people's leads)
    if is_salesperson(current):
        sp_id = current.get("salesperson_id") or ""
        q["$or"] = [
            {"salesperson_id": sp_id},
            {"salesperson_id": ""},
            {"salesperson_id": None},
            {"salesperson_id": {"$exists": False}},
        ]
    if search:
        rx = {"$regex": search, "$options": "i"}
        q.setdefault("$and", []).append({"$or": [{"name": rx}, {"phone": rx}, {"email": rx}, {"notes": rx}]})
    items = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@api_router.post("/leads", response_model=Lead)
async def create_lead(payload: LeadBase, current: dict = Depends(get_current_user)):
    require_owner_or_bdc(current)
    lead = Lead(
        dealership_id=current["dealership_id"],
        created_by_id=current.get("id", ""),
        created_by_name=current.get("full_name", "") or current.get("email", ""),
        **payload.model_dump(),
    )
    await db.leads.insert_one(lead.model_dump())
    return lead


@api_router.put("/leads/{lid}", response_model=Lead)
async def update_lead(lid: str, payload: LeadUpdate, current: dict = Depends(get_current_user)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Salespeople can only update their own leads (or unassigned that they then claim)
    if is_salesperson(current):
        existing = await db.leads.find_one({"id": lid, "dealership_id": current["dealership_id"]}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Lead not found")
        my_sp = current.get("salesperson_id") or ""
        if existing.get("salesperson_id") and existing.get("salesperson_id") != my_sp:
            raise HTTPException(403, "Not your lead")
    if "salesperson_id" in upd:
        if upd["salesperson_id"]:
            sp = await db.salespeople.find_one(
                {"id": upd["salesperson_id"], "dealership_id": current["dealership_id"]}, {"_id": 0}
            )
            upd["salesperson_name"] = (sp or {}).get("name", "")
        else:
            upd["salesperson_name"] = ""
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.leads.update_one({"id": lid, "dealership_id": current["dealership_id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Lead not found")
    return await db.leads.find_one({"id": lid}, {"_id": 0})


@api_router.post("/leads/{lid}/claim")
async def claim_lead(lid: str, current: dict = Depends(get_current_user)):
    """Salesperson claims an unassigned lead."""
    if not is_salesperson(current):
        raise HTTPException(403, "Only salespeople can claim leads")
    sp_id = current.get("salesperson_id") or ""
    if not sp_id:
        raise HTTPException(400, "No salesperson profile linked to your account")
    lead = await db.leads.find_one({"id": lid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("salesperson_id"):
        raise HTTPException(400, "Lead already assigned")
    sp = await db.salespeople.find_one({"id": sp_id, "dealership_id": current["dealership_id"]}, {"_id": 0})
    await db.leads.update_one(
        {"id": lid},
        {"$set": {"salesperson_id": sp_id, "salesperson_name": (sp or {}).get("name", "")}},
    )
    return await db.leads.find_one({"id": lid}, {"_id": 0})


@api_router.delete("/leads/{lid}")
async def delete_lead(lid: str, current: dict = Depends(get_current_user)):
    require_owner_or_bdc(current)
    res = await db.leads.delete_one({"id": lid, "dealership_id": current["dealership_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Lead not found")
    return {"deleted": True}


@api_router.get("/leads-stats")
async def leads_stats(current: dict = Depends(get_current_user)):
    """Counts by status and source for the BDC dashboard."""
    did = current["dealership_id"]
    base_q = {"dealership_id": did}
    if is_salesperson(current):
        sp_id = current.get("salesperson_id") or ""
        base_q["$or"] = [{"salesperson_id": sp_id}, {"salesperson_id": ""}, {"salesperson_id": None}]
    total = await db.leads.count_documents(base_q)
    unassigned = await db.leads.count_documents({**base_q, "$and": [{"$or": [{"salesperson_id": ""}, {"salesperson_id": None}, {"salesperson_id": {"$exists": False}}]}]})
    by_status = {}
    by_source = {}
    cursor = db.leads.find(base_q, {"_id": 0, "status": 1, "source": 1})
    async for ld in cursor:
        by_status[ld.get("status") or "new"] = by_status.get(ld.get("status") or "new", 0) + 1
        by_source[ld.get("source") or "other"] = by_source.get(ld.get("source") or "other", 0) + 1
    return {"total": total, "unassigned": unassigned, "by_status": by_status, "by_source": by_source}


# ---------- Monday.com import ----------
MONDAY_BOARD_LEADS_ID = "9835447209"
MONDAY_STATUS_MAP = {
    # Monday label -> our status
    "Em progresso": "in_progress", "Fechou": "deal_closed", "comprou": "deal_closed",
    "Já comprou": "deal_closed", "New Leads": "new", "Hot lead": "hot_lead",
    "Quente": "hot_lead", "Frio": "cold", "Indeciso": "cold", "Futuro": "future",
    "Fazer FOLLOW-UP": "follow_up", "Não Atendeu": "no_answer", "Desligou na Cara": "no_answer",
    "Número fora de serviço": "wrong_number", "parou de responder": "lost", "Perdido": "lost",
    "caiu": "lost", "bad credit/not approved": "lost",
}
MONDAY_SOURCE_MAP = {
    "Facebook": "facebook", "instagram": "instagram", "Walk-In": "walk_in",
    "Indicaçao": "referral", "CarGurus": "cargurus", "Carfax": "carfax",
    "Craiglist": "craigslist", "Carzing": "other", "car for sale": "other",
    "Cars for sales": "other", "Arquivo": "other",
}


@api_router.post("/leads/import-monday")
async def import_monday_leads(payload: dict = None, current: dict = Depends(get_current_user)):
    """One-shot importer that pulls all leads from Monday.com Leads board into our DB.

    Owner only. Idempotent: existing items (matched by monday_item_id) are updated, not duplicated.
    """
    require_owner(current)
    import httpx
    token = os.environ.get("MONDAY_API_TOKEN", "")
    if not token:
        raise HTTPException(500, "Monday token not configured on server")
    board_id = (payload or {}).get("board_id") or MONDAY_BOARD_LEADS_ID
    did = current["dealership_id"]
    imported = 0
    updated = 0
    cursor = None
    pages = 0

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            pages += 1
            if cursor:
                query = '''query ($cursor: String!) { next_items_page(cursor: $cursor, limit: 100) { cursor items { id name created_at column_values { id text type } } } }'''
                variables = {"cursor": cursor}
                r = await client.post("https://api.monday.com/v2", headers={"Authorization": token, "Content-Type": "application/json", "API-Version": "2024-01"}, json={"query": query, "variables": variables})
                data = (r.json() or {}).get("data", {}) or {}
                page = data.get("next_items_page") or {}
            else:
                query = '''query ($board: ID!) { boards(ids: [$board]) { items_page(limit: 100) { cursor items { id name created_at column_values { id text type } } } } }'''
                variables = {"board": board_id}
                r = await client.post("https://api.monday.com/v2", headers={"Authorization": token, "Content-Type": "application/json", "API-Version": "2024-01"}, json={"query": query, "variables": variables})
                data = (r.json() or {}).get("data", {}) or {}
                boards = data.get("boards") or []
                if not boards:
                    raise HTTPException(400, f"Monday board {board_id} not found or no access")
                page = boards[0].get("items_page") or {}

            items = page.get("items") or []
            cursor = page.get("cursor")

            for it in items:
                mid = str(it.get("id"))
                name = it.get("name", "") or ""
                created = it.get("created_at", "") or ""
                col_by_id = {c["id"]: c for c in (it.get("column_values") or [])}
                phone = (col_by_id.get("phone_mktx71tz") or {}).get("text") or ""
                email = (col_by_id.get("email_mktxjh32") or {}).get("text") or ""
                src_text = (col_by_id.get("color_mktx43yz") or {}).get("text") or ""
                status_text = (col_by_id.get("status") or {}).get("text") or ""
                notes = (col_by_id.get("long_text_mktxhctt") or {}).get("text") or ""
                last_contact = (col_by_id.get("data") or {}).get("text") or ""
                language = (col_by_id.get("dropdown_mkvnz5nr") or {}).get("text") or ""

                doc = {
                    "name": name.strip() or "—",
                    "phone": phone,
                    "email": email,
                    "source": MONDAY_SOURCE_MAP.get(src_text, "other"),
                    "status": MONDAY_STATUS_MAP.get(status_text, "new"),
                    "interest_make_model": "",
                    "budget": 0,
                    "payment_type": "",
                    "notes": notes,
                    "language": language,
                    "last_contact_at": last_contact,
                    "salesperson_id": "",
                    "salesperson_name": "",
                    "attachments": [],
                    "monday_item_id": mid,
                    "dealership_id": did,
                    "created_by_id": current.get("id", ""),
                    "created_by_name": "Monday import",
                    "created_at": created or datetime.now(timezone.utc).isoformat(),
                }
                existing = await db.leads.find_one({"dealership_id": did, "monday_item_id": mid}, {"_id": 0, "id": 1})
                if existing:
                    await db.leads.update_one({"id": existing["id"]}, {"$set": {k: v for k, v in doc.items() if k not in ("created_at",)}})
                    updated += 1
                else:
                    doc["id"] = str(uuid.uuid4())
                    await db.leads.insert_one(doc)
                    imported += 1

            if not cursor or not items:
                break
            if pages > 50:  # safety cap (50 * 100 = 5000)
                break

    return {"imported": imported, "updated": updated, "pages": pages}


# ============================================================
# PUBLIC API (for external website integration)
# ============================================================
@public_router.get("/inventory")
async def public_inventory(token: str = Query(...)):
    """Public endpoint for external sites to pull dealership inventory.

    Usage: GET /api/public/inventory?token=YOUR_API_TOKEN
    Returns vehicles that are NOT sold.
    """
    dealership = await db.dealerships.find_one({"api_token": token}, {"_id": 0})
    if not dealership:
        raise HTTPException(401, "Invalid API token")
    vehicles = await db.vehicles.find(
        {"dealership_id": dealership["id"], "status": {"$ne": "sold"}},
        {"_id": 0, "purchase_price": 0, "expenses": 0, "buyer_name": 0, "buyer_phone": 0, "payment_method": 0}
    ).sort("created_at", -1).to_list(500)
    return {
        "dealership": {"name": dealership["name"]},
        "count": len(vehicles),
        "vehicles": vehicles,
    }


@api_router.get("/")
async def root():
    return {"name": "Inter Car Auto Manager API", "status": "online"}


# ============================================================
# REGISTER + CORS
# ============================================================
app.include_router(api_router)
app.include_router(public_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
