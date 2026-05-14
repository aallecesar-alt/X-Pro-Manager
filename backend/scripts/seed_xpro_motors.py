"""One-shot script to create the X-Pro Motors dealership + owner login.

Runs once. Reads env vars from /app/backend/.env, uploads the logo to Cloudinary,
inserts a dealership document and an owner user. Idempotent: if the user already
exists, it just refreshes the dealership profile (logo + address + phone).
"""
import asyncio
import os
import sys
import uuid
import secrets
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

import cloudinary
import cloudinary.uploader


def _load_env():
    env_path = "/app/backend/.env"
    if not os.path.exists(env_path):
        print(f"ERR: missing {env_path}", file=sys.stderr)
        sys.exit(1)
    load_dotenv(env_path)


async def main():
    _load_env()
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
        secure=True,
    )
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    email = "jeffersonrmmotors@gmail.com"
    password = "102030"
    logo_path = "/tmp/xpro_logo.jpeg"

    # 1. Upload logo
    if not os.path.exists(logo_path):
        print("ERR: logo file not found at", logo_path)
        return
    upload = cloudinary.uploader.upload(
        logo_path,
        folder="dealership-logos",
        public_id="xpro-motors",
        overwrite=True,
    )
    logo_url = upload.get("secure_url")
    print(f"[OK] Logo uploaded: {logo_url}")

    # 2. Check if owner user already exists
    existing = await db.users.find_one({"email": email.lower()})
    if existing:
        await db.dealerships.update_one(
            {"id": existing["dealership_id"]},
            {"$set": {
                "logo_url": logo_url,
                "name": "X-Pro Motors",
                "address": "556 River St, Fitchburg MA 01420",
                "phone": "(978) 503-3869",
                "website": "https://www.xpromotors.com/",
                "email": email,
            }},
        )
        print(f"[OK] Updated existing dealership {existing['dealership_id']}")
        return

    # 3. Create dealership
    dealership_id = str(uuid.uuid4())
    api_token = secrets.token_urlsafe(24)
    await db.dealerships.insert_one({
        "id": dealership_id,
        "name": "X-Pro Motors",
        "logo_url": logo_url,
        "address": "556 River St, Fitchburg MA 01420",
        "phone": "(978) 503-3869",
        "website": "https://www.xpromotors.com/",
        "email": email,
        "api_token": api_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # 4. Create owner user
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id,
        "email": email.lower(),
        "password_hash": pwd_ctx.hash(password),
        "full_name": "Jefferson RM Motors",
        "dealership_id": dealership_id,
        "role": "owner",
        "salesperson_id": "",
        "permissions": None,  # owner gets all by default
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    print("=" * 60)
    print("X-Pro Motors created!")
    print(f"  Dealership ID: {dealership_id}")
    print(f"  Owner Email:   {email}")
    print(f"  Password:      {password}")
    print(f"  Logo URL:      {logo_url}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
