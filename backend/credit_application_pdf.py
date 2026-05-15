"""Generates a printable Credit Application PDF mirroring the customer's
submission (CreditApplicationPublic). Multi-page, includes ID photos, bank
statements, and digital signature."""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional, List

import requests
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.utils import ImageReader

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "intercar-logo.png")

INK = colors.HexColor("#0F0F10")
GREY = colors.HexColor("#6B6B6B")
LIGHT_GREY = colors.HexColor("#F4F4F4")
SOFT = colors.HexColor("#FAFAFA")
LINE = colors.HexColor("#D5D5D5")
BRAND_RED = colors.HexColor("#B91C1C")
GREEN = colors.HexColor("#15803D")


# ---------- Status meta (must mirror frontend) ----------
STATUS_META = {
    "new":      ("NEW",      colors.HexColor("#0EA5E9")),
    "review":   ("IN REVIEW", colors.HexColor("#D97706")),
    "approved": ("APPROVED", GREEN),
    "rejected": ("REJECTED", BRAND_RED),
    "closed":   ("CLOSED",   GREY),
}


def _money(s: str) -> str:
    if not s:
        return "—"
    return str(s)


def _safe(value, default: str = "—") -> str:
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


def _load_remote_image(url: str) -> Optional[ImageReader]:
    """Best-effort fetch of an external image (Cloudinary URL). Returns None on failure."""
    if not url:
        return None
    try:
        r = requests.get(url, timeout=8)
        if r.status_code == 200:
            return ImageReader(io.BytesIO(r.content))
    except Exception:
        return None
    return None


def _load_data_url_image(data_url: str) -> Optional[ImageReader]:
    """Decode a `data:image/png;base64,...` URL into an ImageReader."""
    if not data_url or not data_url.startswith("data:"):
        return None
    try:
        import base64
        _, b64 = data_url.split(",", 1)
        return ImageReader(io.BytesIO(base64.b64decode(b64)))
    except Exception:
        return None


def render_credit_application(app: dict, store: Optional[dict] = None) -> bytes:
    """Render the credit application PDF as raw bytes.

    `app` is the dict stored in `credit_applications` (matches CreditApplicationPayload + status/timestamps).
    `store` is the dealership profile (name, logo_path, address, phone, email, website).
    """
    store = store or {}
    dealer_name = (store.get("name") or "INTERCAR AUTO SALES").upper()

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    w, h = LETTER
    margin = 0.6 * inch
    cursor = {"y": h - margin}  # mutable via _new_page / _need

    def _header():
        # Logo + dealership info
        try:
            logo_src = store.get("logo_path") or (LOGO_PATH if os.path.exists(LOGO_PATH) else None)
            if logo_src and os.path.exists(logo_src):
                c.drawImage(logo_src, margin, cursor["y"] - 50, width=60, height=50,
                            preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(margin + 70, cursor["y"] - 12, dealer_name)
        c.setFillColor(GREY)
        c.setFont("Helvetica", 8.5)
        c.drawString(margin + 70, cursor["y"] - 26, store.get("address", "") or "")
        c.drawString(margin + 70, cursor["y"] - 38, f"{store.get('phone','')}  ·  {store.get('email','')}")
        cursor["y"] -= 70

        # Title stripe
        c.setFillColor(BRAND_RED)
        c.rect(margin, cursor["y"] - 34, w - 2 * margin, 34, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(margin + 14, cursor["y"] - 22, "CREDIT APPLICATION")
        c.setFont("Helvetica", 8.5)
        meta_lines = []
        if app.get("created_at"):
            try:
                d = datetime.fromisoformat(app["created_at"].replace("Z", "+00:00"))
                meta_lines.append(f"Submitted  {d.strftime('%m/%d/%Y %H:%M')}")
            except Exception:
                meta_lines.append(f"Submitted  {app['created_at']}")
        st = STATUS_META.get(app.get("status") or "new", ("NEW", colors.HexColor("#0EA5E9")))
        meta_lines.append(f"Status:  {st[0]}")
        for i, ln in enumerate(meta_lines):
            c.drawRightString(w - margin - 12, cursor["y"] - 14 - (i * 12), ln)
        cursor["y"] -= 50

    def _footer(page_no: int):
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7.5)
        c.drawCentredString(w / 2, margin / 2, f"{dealer_name} · Credit Application · Page {page_no}")

    page_no = [1]

    def _new_page():
        _footer(page_no[0])
        c.showPage()
        page_no[0] += 1
        cursor["y"] = h - margin
        _header()

    def _need(space: float):
        """Ensure at least `space` points remain on the current page."""
        if cursor["y"] - space < margin + 30:
            _new_page()

    def _section(title: str):
        _need(40)
        c.setFillColor(BRAND_RED)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, cursor["y"], title.upper())
        c.setStrokeColor(BRAND_RED)
        c.setLineWidth(0.7)
        c.line(margin, cursor["y"] - 4, w - margin, cursor["y"] - 4)
        cursor["y"] -= 18

    def _row(label: str, value: str):
        if value in (None, "", "—"):
            return
        _need(20)
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(margin, cursor["y"], label.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica", 10)
        # value with wrap (rough)
        max_chars = 70
        text = str(value)
        chunks = [text[i:i + max_chars] for i in range(0, len(text), max_chars)] or [""]
        for i, chunk in enumerate(chunks):
            if i > 0:
                _need(14)
            c.drawString(margin + 130, cursor["y"], chunk)
            if i < len(chunks) - 1:
                cursor["y"] -= 12
        cursor["y"] -= 14

    def _two_images(label_a: str, url_a: str, label_b: str, url_b: str, height: float = 130):
        """Side-by-side image pair (used for ID front/back)."""
        if not url_a and not url_b:
            return
        _need(height + 24)
        col_w = (w - 2 * margin - 14) / 2
        for idx, (lbl, url) in enumerate([(label_a, url_a), (label_b, url_b)]):
            if not url:
                continue
            x = margin + idx * (col_w + 14)
            img = _load_remote_image(url)
            if img:
                try:
                    c.drawImage(img, x, cursor["y"] - height, width=col_w, height=height,
                                preserveAspectRatio=True, mask="auto")
                except Exception:
                    pass
            c.setFillColor(GREY)
            c.setFont("Helvetica", 7.5)
            c.drawString(x, cursor["y"] - height - 10, lbl)
        cursor["y"] -= height + 22

    def _image_grid(urls: List[str], height: float = 110, cols: int = 3):
        if not urls:
            return
        col_w = (w - 2 * margin - (cols - 1) * 10) / cols
        i = 0
        while i < len(urls):
            _need(height + 18)
            for j in range(cols):
                if i >= len(urls):
                    break
                url = urls[i]
                x = margin + j * (col_w + 10)
                img = _load_remote_image(url)
                if img:
                    try:
                        c.drawImage(img, x, cursor["y"] - height, width=col_w, height=height,
                                    preserveAspectRatio=True, mask="auto")
                    except Exception:
                        pass
                i += 1
            cursor["y"] -= height + 14

    # ---------- BUILD ----------
    _header()

    _section("Customer summary")
    _row("Name", _safe(app.get("full_name")))
    _row("Email", _safe(app.get("email")))
    _row("Phone", _safe(app.get("phone")))
    _row("Language", _safe(app.get("language")))

    _section("Vehicle of interest")
    _row("Vehicle", _safe(app.get("vehicle_interest")))
    _row("Down payment", _money(app.get("down_payment")))

    _section("Identification")
    _row("Date of birth", _safe(app.get("date_of_birth")))
    _row("Marital status", _safe(app.get("marital_status")))
    _row("Driver license", _safe(app.get("license_status")))
    _row("DL number", _safe(app.get("license_number")))
    _row("Document type", _safe(app.get("document_type")))
    _row("Document #", _safe(app.get("document_number")))

    _two_images(
        "Document front", app.get("document_photo_front_url") or "",
        "Document back",  app.get("document_photo_back_url") or "",
        height=130,
    )

    _section("Address")
    addr = " · ".join([x for x in [
        app.get("address_line"), app.get("city"), app.get("state"), app.get("zipcode"),
    ] if x])
    _row("Address", _safe(addr))
    _row("Time at address", _safe(app.get("time_at_address")))
    _row("Home status", _safe(app.get("home_status")))
    _row("Rent", _money(app.get("rent_amount")))
    _row("Previous address", _safe(app.get("previous_address")))

    _section("Employment & income")
    _row("Employment", _safe(app.get("employment_type")))
    _row("Company", _safe(app.get("company_name")))
    _row("Profession", _safe(app.get("profession")))
    _row("Time in profession", _safe(app.get("time_in_profession")))
    income = " · ".join([x for x in [app.get("income_amount"), app.get("income_period")] if x])
    _row("Income", _safe(income))
    ref = " · ".join([x for x in [app.get("company_reference_name"), app.get("company_reference_phone")] if x])
    _row("Reference", _safe(ref))

    bank_urls = app.get("bank_statements_urls") or []
    if bank_urls:
        _section(f"Bank statements ({len(bank_urls)})")
        _image_grid(bank_urls, height=110, cols=3)

    # Consent + Signature
    _section("Confirmations")
    _row("Credit check consent", "Authorized" if app.get("consent") else "Not authorized")
    _row("Truthful info", "Confirmed" if app.get("truthful") else "Not confirmed")

    sig = app.get("signature_data_url")
    if sig:
        _need(120)
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(margin, cursor["y"], "DIGITAL SIGNATURE")
        cursor["y"] -= 8
        # White box for signature
        sig_h = 80
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.rect(margin, cursor["y"] - sig_h, w - 2 * margin, sig_h, fill=1, stroke=1)
        sig_img = _load_data_url_image(sig)
        if sig_img:
            try:
                c.drawImage(sig_img, margin + 12, cursor["y"] - sig_h + 6,
                            width=w - 2 * margin - 24, height=sig_h - 12,
                            preserveAspectRatio=True, mask="auto")
            except Exception:
                pass
        cursor["y"] -= sig_h + 4
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7.5)
        sig_when = ""
        if app.get("created_at"):
            try:
                d = datetime.fromisoformat(app["created_at"].replace("Z", "+00:00"))
                sig_when = d.strftime("%m/%d/%Y %H:%M")
            except Exception:
                sig_when = app["created_at"]
        c.drawString(margin, cursor["y"], f"Digitally signed on {sig_when}")
        cursor["y"] -= 16

    _footer(page_no[0])
    c.save()
    return buf.getvalue()
