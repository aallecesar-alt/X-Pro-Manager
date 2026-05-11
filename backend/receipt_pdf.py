"""Generates a professional Deposit Receipt PDF for INTERCAR Auto Sales.

Replaces the old typewriter-style receipt with a clean, branded layout:
  - Centered INTERCAR logo + brand on the left
  - Store contact info on the right
  - Receipt number + date in a colored band
  - Billed To: customer fields
  - Vehicle / VIN description with deposit amount
  - Deposit legal text + signature blocks
  - Non-refundable warning footer

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
LINE = colors.HexColor("#D5D5D5")
BRAND_RED = colors.HexColor("#B91C1C")
BAND_BG = colors.HexColor("#0F0F10")

DEFAULT_STORE = {
    "address": "70 Chelsea St, Everett MA 02149",
    "phone": "(617) 718-0342",
    "email": "intercarmotor@gmail.com",
    "website": "www.intercarautosales.com",
}

DEFAULT_DEPOSIT_TEXT = (
    "The deposit secures your commitment to purchase and ensures that the car "
    "is held for you. Upon receiving the deposit, the dealership will promptly "
    "request the title to proceed with the necessary paperwork and complete "
    "the sale. Thank you for your cooperation and prompt attention."
)


def _fmt_money(v) -> str:
    if v is None or v == "":
        return ""
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


def render_receipt(receipt: Optional[dict] = None) -> bytes:
    r = receipt or {}
    store = {**DEFAULT_STORE, **(r.get("store") or {})}

    buf = io.BytesIO()
    PW, PH = LETTER
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    c.setTitle(f"Receipt — {r.get('customer_name','INTERCAR')}")

    MARGIN = 0.55 * inch
    inner_w = PW - 2 * MARGIN

    # Outer border
    c.setStrokeColor(INK)
    c.setLineWidth(0.7)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== HEADER ============================================================
    HEADER_H = 88
    htop = PH - MARGIN - 8
    hbottom = htop - HEADER_H

    # Logo + brand (left)
    logo_h = 54
    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(
                LOGO_PATH,
                MARGIN + 12,
                htop - logo_h - 4,
                width=logo_h,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    brand_x = MARGIN + 12 + logo_h + 12
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(INK)
    c.drawString(brand_x, htop - 26, "INTERCAR")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    c.drawString(brand_x, htop - 40, "AUTO SALES")
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawString(brand_x, htop - 56, store["address"])

    # Store contact (right side)
    cx_right = MARGIN + inner_w - 10
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(cx_right, htop - 16, "PHONE")
    c.setFont("Helvetica", 9)
    c.setFillColor(INK)
    c.drawRightString(cx_right, htop - 28, store["phone"])

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(cx_right, htop - 42, "EMAIL")
    c.setFont("Helvetica", 9)
    c.setFillColor(INK)
    c.drawRightString(cx_right, htop - 54, store["email"])

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(cx_right, htop - 68, "WEB")
    c.setFont("Helvetica", 9)
    c.setFillColor(INK)
    c.drawRightString(cx_right, htop - 80, store["website"])

    # Red accent line
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(2)
    c.line(MARGIN + 8, hbottom, MARGIN + inner_w - 8, hbottom)

    # ===== RECEIPT title band ================================================
    cursor_y = hbottom - 28
    band_h = 36
    c.setFillColor(BAND_BG)
    c.rect(MARGIN + 8, cursor_y - band_h, inner_w - 16, band_h, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(MARGIN + 24, cursor_y - 25, "RECEIPT")

    # Invoice # + Date + Sales Rep (right side of band)
    info_x = MARGIN + inner_w - 18
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.HexColor("#B0B0B0"))
    c.drawRightString(info_x, cursor_y - 10, "RECEIPT Nº")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.white)
    c.drawRightString(info_x, cursor_y - 22, str(r.get("invoice_no") or "—"))

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.HexColor("#B0B0B0"))
    c.drawRightString(info_x - 120, cursor_y - 10, "DATE")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.white)
    c.drawRightString(info_x - 120, cursor_y - 22, _fmt_date(r.get("date")))

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.HexColor("#B0B0B0"))
    c.drawRightString(info_x - 240, cursor_y - 10, "SALES REP")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.white)
    c.drawRightString(info_x - 240, cursor_y - 22, str(r.get("sales_rep") or "—"))

    cursor_y -= band_h + 16

    # ===== BILLED TO =========================================================
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_RED)
    c.drawString(MARGIN + 14, cursor_y, "BILLED TO")

    cursor_y -= 16

    def billed_line(label_txt, value_txt, y):
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(GREY)
        c.drawString(MARGIN + 14, y + 12, label_txt.upper())
        c.setStrokeColor(LINE)
        c.setLineWidth(0.4)
        c.line(MARGIN + 14, y, MARGIN + inner_w - 14, y)
        if value_txt:
            c.setFont("Helvetica", 10.5)
            c.setFillColor(INK)
            c.drawString(MARGIN + 16, y + 2, str(value_txt))

    billed_line("Name", r.get("customer_name"), cursor_y)
    cursor_y -= 26
    billed_line("Phone", r.get("customer_phone"), cursor_y)
    cursor_y -= 26
    billed_line("Address", r.get("customer_address"), cursor_y)

    cursor_y -= 26

    # ===== Description + Amount table ========================================
    tbl_top = cursor_y
    tbl_h = 230
    amt_col_w = 150
    desc_col_w = inner_w - 28 - amt_col_w

    # Header band
    c.setFillColor(BAND_BG)
    c.rect(MARGIN + 14, tbl_top - 18, inner_w - 28, 18, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(MARGIN + 22, tbl_top - 12, "DESCRIPTION")
    c.drawString(MARGIN + 14 + desc_col_w + 10, tbl_top - 12, "AMOUNT")

    # Body box
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.rect(MARGIN + 14, tbl_top - tbl_h, inner_w - 28, tbl_h - 18, fill=0, stroke=1)
    # Column divider
    c.setStrokeColor(LINE)
    c.line(MARGIN + 14 + desc_col_w, tbl_top - tbl_h, MARGIN + 14 + desc_col_w, tbl_top - 18)

    # Description content
    dx = MARGIN + 22
    dy = tbl_top - 36
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK)
    c.drawString(dx, dy, f"Vehicle:  {r.get('vehicle','') or ''}")
    dy -= 16
    c.drawString(dx, dy, f"VIN:  {r.get('vin','') or ''}")

    # Optional extras (year + color + mileage)
    extras = []
    if r.get("year"):
        extras.append(f"Year {r['year']}")
    if r.get("color"):
        extras.append(r["color"])
    if r.get("mileage"):
        extras.append(f"{r['mileage']} mi")
    if extras:
        dy -= 16
        c.setFont("Helvetica", 9)
        c.setFillColor(GREY)
        c.drawString(dx, dy, " · ".join(extras))

    # Deposit legal text (italic, smaller, wrapped manually inside the column)
    dy -= 36
    text = r.get("deposit_text") or DEFAULT_DEPOSIT_TEXT
    c.setFont("Helvetica-Oblique", 8.5)
    c.setFillColor(colors.HexColor("#444444"))
    # Simple word wrap
    max_w = desc_col_w - 18
    words = text.split()
    line = ""
    line_y = dy
    for w in words:
        candidate = (line + " " + w).strip() if line else w
        if c.stringWidth(candidate, "Helvetica-Oblique", 8.5) > max_w:
            c.drawString(dx, line_y, line)
            line_y -= 11
            line = w
        else:
            line = candidate
    if line:
        c.drawString(dx, line_y, line)

    # Amount column
    ax = MARGIN + 14 + desc_col_w + 10
    ay = tbl_top - 36
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(INK)
    c.drawString(ax, ay, _fmt_money(r.get("amount")))

    # Total row at the bottom
    total_y = tbl_top - tbl_h - 22
    c.setFillColor(BRAND_RED)
    c.rect(MARGIN + 14, total_y, inner_w - 28, 24, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN + 22, total_y + 7, "TOTAL")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(MARGIN + inner_w - 22, total_y + 7, _fmt_money(r.get("amount")) or "$ 0.00")

    # ===== Signatures ========================================================
    sig_y = total_y - 60
    half = (inner_w - 60) / 2
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(MARGIN + 18, sig_y, MARGIN + 18 + half, sig_y)
    c.line(MARGIN + 18 + half + 30, sig_y, MARGIN + 18 + half * 2 + 30, sig_y)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(GREY)
    c.drawString(MARGIN + 18, sig_y - 12, "CUSTOMER'S SIGNATURE")
    c.drawString(MARGIN + 18 + half + 30, sig_y - 12, "SALES REPRESENTATIVE")

    # ===== Non-refundable footer ============================================
    fy = MARGIN + 6
    c.setFillColor(BAND_BG)
    c.rect(MARGIN + 8, fy, inner_w - 16, 22, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.5)
    nonref_amt = r.get("non_refundable_amount", 499)
    txt = f"DOWN PAYMENT AND SECURITY DEPOSIT (${nonref_amt:,.2f}) NON-REFUNDABLE UNDER ANY CIRCUMSTANCES."
    # Center it inside the footer band
    tw = c.stringWidth(txt, "Helvetica-Bold", 8.5)
    c.drawString(MARGIN + 8 + (inner_w - 16 - tw) / 2, fy + 7, txt)

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
        "color": "Silver",
        "mileage": "38,500",
        "amount": 6750.00,
        "non_refundable_amount": 499,
    }
    with open("/tmp/receipt_sample.pdf", "wb") as f:
        f.write(render_receipt(sample))
    print("Wrote /tmp/receipt_sample.pdf")
