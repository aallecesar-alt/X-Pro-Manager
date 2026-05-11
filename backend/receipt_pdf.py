"""Generates a professional Deposit Receipt PDF for INTERCAR Auto Sales.

Designed from scratch — modern document layout with:
  - Strong branded header (logo + name + store info)
  - "DEPOSIT RECEIPT" headline + receipt number / date in a colored stripe
  - "Issued to" customer card (name, phone, address) — clean, well-spaced
  - "Vehicle" card with year/make/model + VIN + color + mileage
  - Big payment summary box (Deposit amount displayed prominently)
  - The required deposit statement (verbatim) styled as a legal block
  - Highlighted NON-REFUNDABLE notice with the $499 amount
  - Customer + Sales Rep signature lines
  - Date footer

Letter portrait (8.5" × 11"). Returns the rendered PDF as raw bytes.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdfcanvas

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "intercar-logo.png")

INK = colors.HexColor("#0F0F10")
GREY = colors.HexColor("#6B6B6B")
LIGHT_GREY = colors.HexColor("#F4F4F4")
SOFT = colors.HexColor("#FAFAFA")
LINE = colors.HexColor("#D5D5D5")
BRAND_RED = colors.HexColor("#B91C1C")
BRAND_RED_DARK = colors.HexColor("#7F1313")
WARN_BG = colors.HexColor("#FFF4E5")
WARN_BORDER = colors.HexColor("#B45309")

DEFAULT_STORE = {
    "address": "70 Chelsea St, Everett MA 02149",
    "phone": "(617) 718-0342",
    "email": "intercarmotor@gmail.com",
    "website": "www.intercarautosales.com",
}

# Required deposit statement — kept verbatim per the owner's request.
DEPOSIT_STATEMENT = (
    "The deposit secures your commitment to purchase and ensures that the car is held for you. "
    "Upon receiving the deposit, the dealership will promptly request the title to proceed with the "
    "necessary paperwork and complete the sale. Thank you for your cooperation and prompt attention."
)


def _fmt_money(v) -> str:
    if v is None or v == "":
        return "$ 0.00"
    return f"$ {float(v):,.2f}"


def _fmt_date(s: Optional[str]) -> str:
    if not s:
        return datetime.now().strftime("%m/%d/%Y")
    try:
        if "-" in s:
            y, m, d = s.split("-")
            return f"{m}/{d}/{y}"
    except Exception:
        pass
    return s


def _wrap_lines(c: pdfcanvas.Canvas, text: str, font: str, size: float, max_w: float) -> list[str]:
    words = text.split()
    lines, line = [], ""
    for w in words:
        cand = (line + " " + w).strip() if line else w
        if c.stringWidth(cand, font, size) > max_w:
            if line:
                lines.append(line)
            line = w
        else:
            line = cand
    if line:
        lines.append(line)
    return lines


def render_receipt(receipt: Optional[dict] = None) -> bytes:
    r = receipt or {}
    store = {**DEFAULT_STORE, **(r.get("store") or {})}

    buf = io.BytesIO()
    PW, PH = LETTER
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    c.setTitle(f"INTERCAR — Deposit Receipt — {r.get('customer_name','')}")

    MARGIN = 0.55 * inch
    inner_w = PW - 2 * MARGIN
    inner_left = MARGIN
    inner_right = MARGIN + inner_w

    # Outer page border
    c.setStrokeColor(INK)
    c.setLineWidth(0.7)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== HEADER ============================================================
    HEADER_H = 86
    htop = PH - MARGIN - 10
    hbottom = htop - HEADER_H

    # Logo on the left
    logo_h = 56
    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(
                LOGO_PATH,
                inner_left + 14,
                htop - logo_h - 4,
                width=logo_h,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    # Brand name beside logo
    brand_x = inner_left + 14 + logo_h + 14
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(INK)
    c.drawString(brand_x, htop - 26, "INTERCAR")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    c.drawString(brand_x, htop - 40, "AUTO SALES")
    c.setFont("Helvetica", 8.5)
    c.drawString(brand_x, htop - 56, store["address"])

    # Right side store contact, compact and aligned
    cx = inner_right - 12
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawRightString(cx, htop - 22, store["phone"])
    c.drawRightString(cx, htop - 36, store["email"])
    c.drawRightString(cx, htop - 50, store["website"])
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(cx, htop - 12, "CONTACT")

    # Red accent line under header
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(2)
    c.line(inner_left + 8, hbottom, inner_right - 8, hbottom)

    # ===== "DEPOSIT RECEIPT" stripe ==========================================
    cursor_y = hbottom - 22
    stripe_h = 50
    # Black main stripe
    c.setFillColor(INK)
    c.rect(inner_left + 8, cursor_y - stripe_h, inner_w - 16, stripe_h, fill=1, stroke=0)
    # Red accent corner (left)
    c.setFillColor(BRAND_RED)
    c.rect(inner_left + 8, cursor_y - stripe_h, 6, stripe_h, fill=1, stroke=0)

    # "DEPOSIT RECEIPT" title (left)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(inner_left + 30, cursor_y - 22, "DEPOSIT RECEIPT")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor("#B0B0B0"))
    c.drawString(inner_left + 30, cursor_y - 38, "Issued by INTERCAR Auto Sales · MA Dealer")

    # Right meta block — Date / Receipt # / Sales Rep
    meta_blocks = [
        ("DATE", _fmt_date(r.get("date"))),
        ("RECEIPT Nº", str(r.get("invoice_no") or "—")),
        ("SALES REP", str(r.get("sales_rep") or "—")),
    ]
    block_w = 110
    bx = inner_right - 18 - (len(meta_blocks) - 1) * block_w
    for i, (lbl, val) in enumerate(meta_blocks):
        x = inner_right - 18 - (len(meta_blocks) - 1 - i) * block_w
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.HexColor("#B0B0B0"))
        c.drawRightString(x, cursor_y - 14, lbl)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.white)
        c.drawRightString(x, cursor_y - 30, val)

    cursor_y -= stripe_h + 16

    # ===== Two cards side by side: ISSUED TO  ·  VEHICLE =====================
    card_h = 130
    half_w = (inner_w - 24) / 2
    left_x = inner_left + 8
    right_x = left_x + half_w + 8

    # --- Issued to card ---
    c.setFillColor(SOFT)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.rect(left_x, cursor_y - card_h, half_w, card_h, fill=1, stroke=1)
    # Title band
    c.setFillColor(INK)
    c.rect(left_x, cursor_y - 16, half_w, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(left_x + 10, cursor_y - 11, "ISSUED TO")

    # Fields
    fx = left_x + 14
    fy = cursor_y - 36

    def card_row(c, x, y, label_txt, value_txt, max_w):
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(GREY)
        c.drawString(x, y + 12, label_txt.upper())
        c.setStrokeColor(LINE)
        c.setLineWidth(0.4)
        c.line(x, y, x + max_w, y)
        if value_txt:
            c.setFont("Helvetica", 10)
            c.setFillColor(INK)
            c.drawString(x + 2, y + 2.5, str(value_txt))

    card_row(c, fx, fy, "Customer Name", r.get("customer_name"), half_w - 28)
    fy -= 26
    card_row(c, fx, fy, "Phone", r.get("customer_phone"), half_w - 28)
    fy -= 26
    card_row(c, fx, fy, "Address", r.get("customer_address"), half_w - 28)

    # --- Vehicle card ---
    c.setFillColor(SOFT)
    c.setStrokeColor(LINE)
    c.rect(right_x, cursor_y - card_h, half_w, card_h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.rect(right_x, cursor_y - 16, half_w, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(right_x + 10, cursor_y - 11, "VEHICLE")

    vx = right_x + 14
    vy = cursor_y - 36
    veh_label = r.get("vehicle") or ""
    if not veh_label and (r.get("year") or r.get("make") or r.get("model")):
        veh_label = f"{r.get('year','') or ''} {r.get('make','') or ''} {r.get('model','') or ''}".strip()
    card_row(c, vx, vy, "Year · Make · Model", veh_label, half_w - 28)
    vy -= 26
    card_row(c, vx, vy, "VIN", r.get("vin"), half_w - 28)
    vy -= 26
    extras = []
    if r.get("color"):
        extras.append(str(r["color"]))
    if r.get("mileage"):
        extras.append(f"{r['mileage']} mi")
    if r.get("stock_no"):
        extras.append(f"Stock #{r['stock_no']}")
    card_row(c, vx, vy, "Color · Mileage", "  ·  ".join(extras), half_w - 28)

    cursor_y -= card_h + 18

    # ===== PAYMENT SUMMARY box ===============================================
    # Big horizontal box with the deposit amount on the right
    pay_h = 70
    c.setFillColor(INK)
    c.rect(inner_left + 8, cursor_y - pay_h, inner_w - 16, pay_h, fill=1, stroke=0)
    # Left red strip
    c.setFillColor(BRAND_RED)
    c.rect(inner_left + 8, cursor_y - pay_h, 6, pay_h, fill=1, stroke=0)

    # Left label
    c.setFillColor(colors.HexColor("#B0B0B0"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(inner_left + 30, cursor_y - 22, "DEPOSIT AMOUNT RECEIVED")
    c.setFont("Helvetica", 8)
    c.drawString(inner_left + 30, cursor_y - 36, "Payment method:")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.white)
    pm = r.get("payment_method") or "—"
    c.drawString(inner_left + 122, cursor_y - 36, pm)

    # Right side — big amount
    c.setFont("Helvetica-Bold", 30)
    c.setFillColor(colors.white)
    c.drawRightString(inner_right - 22, cursor_y - 36, _fmt_money(r.get("amount")))

    cursor_y -= pay_h + 16

    # ===== Deposit statement =================================================
    # Small label header
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(BRAND_RED)
    c.drawString(inner_left + 14, cursor_y, "TERMS OF THE DEPOSIT")
    cursor_y -= 6
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(1)
    c.line(inner_left + 14, cursor_y, inner_left + 110, cursor_y)
    cursor_y -= 10

    # Statement body
    statement = r.get("deposit_statement") or DEPOSIT_STATEMENT
    c.setFont("Helvetica", 9.5)
    c.setFillColor(INK)
    body_x = inner_left + 14
    body_w = inner_w - 28
    lines = _wrap_lines(c, statement, "Helvetica", 9.5, body_w)
    for ln in lines:
        c.drawString(body_x, cursor_y, ln)
        cursor_y -= 13

    cursor_y -= 10

    # ===== NON-REFUNDABLE notice (highlighted) ===============================
    nonref = float(r.get("non_refundable_amount") or 499)
    notice_h = 56
    c.setFillColor(WARN_BG)
    c.setStrokeColor(WARN_BORDER)
    c.setLineWidth(1.2)
    c.rect(inner_left + 8, cursor_y - notice_h, inner_w - 16, notice_h, fill=1, stroke=1)
    # Left red strip
    c.setFillColor(BRAND_RED)
    c.rect(inner_left + 8, cursor_y - notice_h, 6, notice_h, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(BRAND_RED_DARK)
    c.drawString(inner_left + 24, cursor_y - 18, "IMPORTANT — NON-REFUNDABLE DEPOSIT")
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(INK)
    notice_txt = (
        f"The customer hereby acknowledges that a deposit in the amount of "
        f"$ {nonref:,.2f} is NON-REFUNDABLE under any circumstances."
    )
    nl = _wrap_lines(c, notice_txt, "Helvetica-Bold", 10, inner_w - 40)
    yn = cursor_y - 32
    for ln in nl:
        c.drawString(inner_left + 24, yn, ln)
        yn -= 12

    cursor_y -= notice_h + 22

    # ===== Signatures ========================================================
    # Two lines: customer + sales representative
    sig_h = 56
    half_sig = (inner_w - 60) / 2
    c.setStrokeColor(INK)
    c.setLineWidth(0.8)
    c.line(inner_left + 18, cursor_y - 12, inner_left + 18 + half_sig, cursor_y - 12)
    c.line(inner_left + 18 + half_sig + 30, cursor_y - 12,
           inner_left + 18 + half_sig * 2 + 30, cursor_y - 12)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(GREY)
    c.drawString(inner_left + 18, cursor_y - 24, "CUSTOMER SIGNATURE  ·  DATE")
    c.drawString(inner_left + 18 + half_sig + 30, cursor_y - 24, "SALES REPRESENTATIVE  ·  DATE")

    # ===== Footer ============================================================
    fy = MARGIN + 6
    c.setFillColor(INK)
    c.rect(inner_left + 8, fy, inner_w - 16, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(inner_left + 18, fy + 5,
                 f"INTERCAR AUTO SALES  ·  {store['address']}  ·  {store['phone']}")
    c.setFont("Helvetica", 7)
    c.drawRightString(inner_right - 18, fy + 5,
                      f"Generated {datetime.now().strftime('%m/%d/%Y %I:%M %p')}")

    c.showPage()
    c.save()
    return buf.getvalue()


if __name__ == "__main__":
    sample = {
        "invoice_no": "0001",
        "date": "2026-05-10",
        "sales_rep": "Carlos",
        "customer_name": "John Smith",
        "customer_phone": "+1 (555) 123-4567",
        "customer_address": "150 Main St, Everett MA 02149",
        "vehicle": "2022 Honda Civic Sport",
        "vin": "1HGBH41JXMN109186",
        "year": 2022,
        "make": "Honda",
        "model": "Civic Sport",
        "color": "Silver",
        "mileage": "38,500",
        "stock_no": "A-1042",
        "amount": 6750.00,
        "payment_method": "Cash",
        "non_refundable_amount": 499,
    }
    with open("/tmp/receipt_sample.pdf", "wb") as f:
        f.write(render_receipt(sample))
    print("Wrote /tmp/receipt_sample.pdf")
