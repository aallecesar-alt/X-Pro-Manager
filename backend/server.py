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

import cloudinary
import cloudinary.utils
import cloudinary.uploader

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
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
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def is_salesperson(user: dict) -> bool:
    return user.get("role") == "salesperson"


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
    return {
        "access_token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user.get("full_name", ""),
            "dealership_id": user["dealership_id"],
            "role": user.get("role", "owner"),
            "salesperson_id": user.get("salesperson_id", ""),
        },
        "dealership": dealership,
    }


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    dealership = await db.dealerships.find_one({"id": current["dealership_id"]}, {"_id": 0})
    return {"user": current, "dealership": dealership}


# ============================================================
# VEHICLES (multi-tenant)
# ============================================================
@api_router.get("/vehicles")
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
    # Auto-set sold_at and start delivery pipeline at step 1 when transitioning to sold
    if upd.get("status") == "sold":
        existing = await db.vehicles.find_one({"id": vid, "dealership_id": current["dealership_id"]}, {"_id": 0})
        if existing and existing.get("status") != "sold":
            upd["sold_at"] = datetime.now(timezone.utc).isoformat()
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
    # Auto-set delivered_at when reaching step 8
    if upd.get("delivery_step") == 8:
        upd["delivered_at"] = datetime.now(timezone.utc).isoformat()
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.vehicles.update_one({"id": vid, "dealership_id": current["dealership_id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Vehicle not found")
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if is_salesperson(current):
        v = strip_vehicle_for_salesperson(v)
    return v


@api_router.get("/delivery")
async def list_delivery(current: dict = Depends(get_current_user)):
    """Vehicles currently in the delivery pipeline (sold but not delivered)."""
    items = await db.vehicles.find(
        {"dealership_id": current["dealership_id"], "status": "sold", "delivery_step": {"$gte": 1, "$lte": 8}},
        {"_id": 0}
    ).sort("sold_at", -1).to_list(500)
    if is_salesperson(current):
        items = [strip_vehicle_for_salesperson(v) for v in items]
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

    # Try plain requests first
    try:
        r = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            r = None
    except Exception as e:
        last_error = str(e)

    # Fallback to cloudscraper (handles Cloudflare JS challenges)
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

    # Fallback: first <img> with reasonable size
    if not image:
        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src") or ""
            if src and not src.startswith("data:") and any(x in src.lower() for x in [".jpg", ".jpeg", ".png", ".webp"]):
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    from urllib.parse import urljoin
                    src = urljoin(url, src)
                image = src
                break

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

    # Try to find a price like $12,345 or $12345 in the page
    price = 0
    price_m = _re.search(r"\$\s*([\d,]+(?:\.\d{2})?)", r.text)
    if price_m:
        try:
            price = float(price_m.group(1).replace(",", ""))
        except Exception:
            pass

    return {
        "extracted": {
            "image": image or "",
            "title": title,
            "description": description[:500],
            "year": year,
            "make": make,
            "model": model,
            "price": price,
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
    Allowed folder prefixes: 'vehicles/' or 'delivery/'.
    """
    dealership_id = current["dealership_id"]
    # Allow only namespaced folders by dealership
    allowed_prefixes = (f"vehicles/{dealership_id}/", f"delivery/{dealership_id}/")
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


class SalespersonUpdate(BaseModel):
    name: Optional[str] = None
    commission_amount: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    active: Optional[bool] = None


@api_router.get("/salespeople", response_model=List[Salesperson])
async def list_salespeople(current: dict = Depends(get_current_user)):
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
        sp_id = v.get("salesperson_id") or "__unassigned__"
        bucket = by_sp.setdefault(sp_id, {"salesperson_id": sp_id, "salesperson_name": v.get("salesperson_name", "") or "Unassigned", "count": 0, "revenue": 0.0})
        bucket["count"] += 1
        bucket["revenue"] += float(v.get("sold_price") or 0)
    # Add salespeople with zero sales
    for sp in sps:
        if sp["id"] not in by_sp:
            by_sp[sp["id"]] = {"salesperson_id": sp["id"], "salesperson_name": sp.get("name", ""), "count": 0, "revenue": 0.0}
    rows = sorted(by_sp.values(), key=lambda r: (-r["count"], -r["revenue"], r["salesperson_name"]))
    # Strip revenue for salesperson role
    if is_salesperson(current):
        rows = [{"salesperson_id": r["salesperson_id"], "salesperson_name": r["salesperson_name"], "count": r["count"]} for r in rows]
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
