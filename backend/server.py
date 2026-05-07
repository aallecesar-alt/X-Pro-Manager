from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import secrets
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

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
    bank_name: str = ""
    delivery_notes: str = ""
    delivered_at: Optional[str] = None
    # Files attached per step. Keys are step numbers as strings ("1".."8").
    # Each file: { id, name, type, data_url, size, uploaded_at }
    step_files: Dict[str, List[Dict]] = Field(default_factory=dict)


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
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


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
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    token = create_token(user_id, dealership_id, email)
    return {
        "access_token": token,
        "user": {"id": user_id, "email": email, "full_name": payload.full_name, "dealership_id": dealership_id},
        "dealership": {"id": dealership_id, "name": payload.dealership_name, "api_token": api_token},
    }


@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    dealership = await db.dealerships.find_one({"id": user["dealership_id"]}, {"_id": 0})
    token = create_token(user["id"], user["dealership_id"], user["email"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"], "full_name": user.get("full_name", ""), "dealership_id": user["dealership_id"]},
        "dealership": dealership,
    }


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    dealership = await db.dealerships.find_one({"id": current["dealership_id"]}, {"_id": 0})
    return {"user": current, "dealership": dealership}


# ============================================================
# VEHICLES (multi-tenant)
# ============================================================
@api_router.get("/vehicles", response_model=List[Vehicle])
async def list_vehicles(
    status: Optional[str] = None,
    search: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    q = {"dealership_id": current["dealership_id"]}
    if status:
        q["status"] = status
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"make": rx}, {"model": rx}, {"plate": rx}, {"vin": rx}]
    items = await db.vehicles.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(payload: VehicleCreate, current: dict = Depends(get_current_user)):
    v = Vehicle(dealership_id=current["dealership_id"], **payload.model_dump())
    await db.vehicles.insert_one(v.model_dump())
    return v


@api_router.get("/vehicles/{vid}", response_model=Vehicle)
async def get_vehicle(vid: str, current: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vehicle not found")
    return v


@api_router.put("/vehicles/{vid}", response_model=Vehicle)
async def update_vehicle(vid: str, payload: VehicleUpdate, current: dict = Depends(get_current_user)):
    upd = {k: val for k, val in payload.model_dump().items() if val is not None}
    # Auto-set sold_at and start delivery pipeline at step 1 when transitioning to sold
    if upd.get("status") == "sold":
        existing = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
        if existing and existing.get("status") != "sold":
            upd["sold_at"] = datetime.now(timezone.utc).isoformat()
            # Force delivery_step = 1 on first transition to sold (override any 0/None payload value)
            if (existing.get("delivery_step") or 0) == 0 and (upd.get("delivery_step") or 0) == 0:
                upd["delivery_step"] = 1
    # Auto-set delivered_at when reaching step 8
    if upd.get("delivery_step") == 8:
        upd["delivered_at"] = datetime.now(timezone.utc).isoformat()
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.vehicles.update_one({"id": vid, "dealership_id": current["dealership_id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Vehicle not found")
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})


@api_router.get("/delivery", response_model=List[Vehicle])
async def list_delivery(current: dict = Depends(get_current_user)):
    """Vehicles currently in the delivery pipeline (sold but not delivered)."""
    items = await db.vehicles.find(
        {"dealership_id": current["dealership_id"], "status": "sold", "delivery_step": {"$gte": 1, "$lte": 8}},
        {"_id": 0}
    ).sort("sold_at", -1).to_list(500)
    return items


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


@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, current: dict = Depends(get_current_user)):
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


@api_router.post("/dealership/regenerate-token")
async def regen_token(current: dict = Depends(get_current_user)):
    new_token = secrets.token_urlsafe(24)
    await db.dealerships.update_one({"id": current["dealership_id"]}, {"$set": {"api_token": new_token}})
    return {"api_token": new_token}


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
