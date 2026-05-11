"""Generates the INTERCAR Auto Sales Deal Sheet (Negotiation Sheet) PDF.

Letter portrait (8.5" × 11") — standard printer paper.
Each section has its own color band so the page reads at a glance.
Logo sits beside the brand name in the top-left; store contact info on the right.

Returns the rendered PDF as raw bytes.
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

# Brand & section palette
INK = colors.HexColor("#0F0F10")
GREY = colors.HexColor("#6B6B6B")
LINE = colors.HexColor("#D5D5D5")

# Section colors — each band keeps its own identity at a glance
SEC_CUSTOMER = {"bg": colors.HexColor("#1E3A8A"), "tint": colors.HexColor("#EFF4FF")}   # navy / soft blue
SEC_FINANCE  = {"bg": colors.HexColor("#0E7C3A"), "tint": colors.HexColor("#EAF6EE")}   # green
SEC_TRADE    = {"bg": colors.HexColor("#B45309"), "tint": colors.HexColor("#FBF2E2")}   # amber
SEC_DEAL     = {"bg": colors.HexColor("#B91C1C"), "tint": colors.HexColor("#FDECEC")}   # red
SEC_FUTURE   = {"bg": colors.HexColor("#5B21B6"), "tint": colors.HexColor("#F1ECFA")}   # purple
SEC_SIGN     = {"bg": colors.HexColor("#0F0F10"), "tint": colors.HexColor("#F5F5F5")}   # black

# Store info — overridable via deal["store"] dict
DEFAULT_STORE = {
    "address": "[ STORE ADDRESS ]",
    "phone": "[ PHONE ]",
    "email": "[ EMAIL ]",
    "website": "[ WEBSITE / INSTAGRAM ]",
}


def _fmt(value, prefix="", suffix="") -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)):
        return f"{prefix}{value:,.2f}{suffix}"
    return f"{prefix}{value}{suffix}"


def _checkbox(c: pdfcanvas.Canvas, x: float, y: float, checked: bool, size: float = 9):
    c.setStrokeColor(INK)
    c.setLineWidth(0.7)
    c.rect(x, y, size, size, fill=0)
    if checked:
        c.setStrokeColor(SEC_DEAL["bg"])
        c.setLineWidth(1.6)
        c.line(x + 1.5, y + size / 2, x + size / 2 - 0.5, y + 1.5)
        c.line(x + size / 2 - 0.5, y + 1.5, x + size - 1, y + size - 1)
        c.setLineWidth(0.7)


def _labeled(c: pdfcanvas.Canvas, x: float, y: float, w: float, label: str, value: str = "",
             label_size: float = 6, value_size: float = 10):
    """Label above, value sitting on a light underline. More breathing room than v1."""
    c.setFont("Helvetica-Bold", label_size)
    c.setFillColor(GREY)
    c.drawString(x, y + 14, label.upper())
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(x, y, x + w, y)
    if value:
        c.setFont("Helvetica", value_size)
        c.setFillColor(INK)
        c.drawString(x + 2, y + 3, str(value))


def _section_band(c: pdfcanvas.Canvas, x: float, y: float, w: float, title: str, palette: dict, h: float = 16):
    c.setFillColor(palette["bg"])
    c.rect(x, y, w, h, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 8, y + 4.5, title.upper())


def _section_box(c: pdfcanvas.Canvas, x: float, y_top: float, w: float, h: float, title: str, palette: dict):
    """Draws the colored title band at the top + tinted body box below it.
    Returns the y coordinate of the inner content area (below the band)."""
    band_h = 16
    # Tinted body
    c.setFillColor(palette["tint"])
    c.setStrokeColor(palette["bg"])
    c.setLineWidth(0.6)
    c.rect(x, y_top - h, w, h, fill=1, stroke=1)
    # Title band overlaid on top
    _section_band(c, x, y_top - band_h, w, title, palette, h=band_h)
    return y_top - band_h - 4   # y where inner content can start


def render_deal_sheet(deal: Optional[dict] = None) -> bytes:
    deal = deal or {}
    store = {**DEFAULT_STORE, **(deal.get("store") or {})}
    buf = io.BytesIO()
    PW, PH = LETTER  # 612 × 792
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    c.setTitle("INTERCAR Auto Sales — Deal Sheet")

    MARGIN = 0.45 * inch
    inner_w = PW - 2 * MARGIN

    # Outer border
    c.setStrokeColor(INK)
    c.setLineWidth(0.8)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== HEADER: logo + brand side by side · store info right ==============
    HEADER_H = 70
    header_top = PH - MARGIN - 6
    header_bottom = header_top - HEADER_H

    # Logo on the LEFT
    logo_h = 48
    logo_x = MARGIN + 12
    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(
                LOGO_PATH,
                logo_x,
                header_top - logo_h - 6,
                width=logo_h,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    # Brand name BESIDE the logo (not below)
    brand_x = logo_x + logo_h + 12
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(INK)
    c.drawString(brand_x, header_top - 26, "INTERCAR")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    c.drawString(brand_x, header_top - 40, "AUTO SALES")

    # Right side: contact info
    contact_x_right = MARGIN + inner_w - 8
    contact_y = header_top - 14
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(contact_x_right, contact_y, "ADDRESS")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawRightString(contact_x_right, contact_y - 11, store["address"])

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(contact_x_right, contact_y - 24, "PHONE  ·  EMAIL")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawRightString(contact_x_right, contact_y - 35, f"{store['phone']}  ·  {store['email']}")

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawRightString(contact_x_right, contact_y - 48, "WEBSITE / SOCIAL")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawRightString(contact_x_right, contact_y - 59, store["website"])

    # Red accent line
    c.setStrokeColor(SEC_DEAL["bg"])
    c.setLineWidth(2)
    c.line(MARGIN + 8, header_bottom, MARGIN + inner_w - 8, header_bottom)

    # Sheet number (right) + Date (left) — small line below header
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawString(MARGIN + 12, header_bottom - 12, f"DATE   {deal.get('date') or datetime.now().strftime('%m/%d/%Y')}")
    c.drawRightString(MARGIN + inner_w - 12, header_bottom - 12,
                      f"SHEET Nº  {deal.get('sheet_no') or '___________'}")

    # ===== SECTION 1 · CUSTOMER + VEHICLE + SALES (BLUE) =====================
    cursor_y = header_bottom - 22
    sec1_h = 96
    inner_y = _section_box(c, MARGIN + 8, cursor_y, inner_w - 16, sec1_h,
                           "Customer · Vehicle · Salesperson", SEC_CUSTOMER)

    # Row 1: Customer Name · Phone · Salesperson
    row_x = MARGIN + 20
    row_w = inner_w - 40
    fields_r1 = [
        ("Customer Name", row_w * 0.45, _fmt(deal.get("name"))),
        ("Phone", row_w * 0.28, _fmt(deal.get("phone"))),
        ("Salesperson", row_w * 0.27 - 16, _fmt(deal.get("salesperson"))),
    ]
    x = row_x
    for label, w, val in fields_r1:
        _labeled(c, x, inner_y - 10, w, label, val)
        x += w + 12

    # Row 2: Year · Make · Model · Color · Mileage · Last 6 VIN
    fields_r2 = [
        ("Year", row_w * 0.08, _fmt(deal.get("year"))),
        ("Make", row_w * 0.15, _fmt(deal.get("make"))),
        ("Model", row_w * 0.22, _fmt(deal.get("model"))),
        ("Color", row_w * 0.13, _fmt(deal.get("color"))),
        ("Mileage", row_w * 0.12, _fmt(deal.get("mileage"))),
        ("Last 6 VIN", row_w * 0.30 - 60, _fmt(deal.get("last_vin_6"))),
    ]
    x = row_x
    for label, w, val in fields_r2:
        _labeled(c, x, inner_y - 38, w, label, val)
        x += w + 10

    # Row 3: Bank radios + Transfer Plate + Insurance
    by = inner_y - 64
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawString(row_x, by + 12, "BANK")
    bank = (deal.get("bank") or "").lower()
    bx = row_x
    for key, label in [("westlake", "WESTLAKE"), ("lendbuzz", "LENDBUZZ"), ("fh", "FH APP #")]:
        _checkbox(c, bx, by, bank == key)
        c.setFont("Helvetica", 8.5)
        c.setFillColor(INK)
        c.drawString(bx + 13, by + 1, label)
        bx += 13 + len(label) * 5.5 + 12
    _labeled(c, bx, by - 2, 80, "FH App Number", _fmt(deal.get("fh_app_number")))
    bx += 92

    # Transfer plate
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawString(bx, by + 12, "TRANSFER PLATE")
    tp = bool(deal.get("transfer_plate"))
    tp_explicit = deal.get("transfer_plate") is not None
    _checkbox(c, bx, by, tp)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawString(bx + 13, by + 1, "YES")
    _checkbox(c, bx + 42, by, not tp and tp_explicit)
    c.drawString(bx + 55, by + 1, "NO")
    bx += 82

    # Insurance
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawString(bx, by + 12, "INSURANCE")
    ins = bool(deal.get("insurance"))
    ins_explicit = deal.get("insurance") is not None
    _checkbox(c, bx, by, ins)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawString(bx + 13, by + 1, "YES")
    _checkbox(c, bx + 42, by, not ins and ins_explicit)
    c.drawString(bx + 55, by + 1, "NO")

    cursor_y -= sec1_h + 12

    # ===== SECTION 2 · FINANCE (GREEN) =======================================
    sec2_h = 130
    inner_y = _section_box(c, MARGIN + 8, cursor_y, inner_w - 16, sec2_h, "Finance", SEC_FINANCE)
    fx = MARGIN + 20
    fw = inner_w - 40
    half = (fw - 16) / 2

    # Two columns within Finance
    fy = inner_y - 10
    _labeled(c, fx, fy, half, "Car Price  ($)", _fmt(deal.get("car_price"), prefix="$ "), value_size=11)
    _labeled(c, fx + half + 16, fy, half, "(+) Doc Fee + Finance Fee  ($)", _fmt(deal.get("doc_fee"), prefix="$ "))
    fy -= 26
    _labeled(c, fx, fy, half, "(+) Warranty + Others  ($)", _fmt(deal.get("warranty"), prefix="$ "))
    _labeled(c, fx + half + 16, fy, half, "(−) Net Check  ($)", _fmt(deal.get("net_check"), prefix="$ "))

    # Highlighted Down Payment bar at the bottom of the Finance box
    fy -= 32
    c.setFillColor(SEC_FINANCE["bg"])
    c.rect(fx - 4, fy - 3, fw + 8, 20, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.white)
    c.drawString(fx + 4, fy + 5, "(=) DOWN PAYMENT  ($)")
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(fx + fw - 6, fy + 4, _fmt(deal.get("down_payment"), prefix="$ ") or "_______________")

    # Payment Amount + Frequency + Term + Rate row
    fy -= 26
    _labeled(c, fx, fy, half * 0.55, "Payment Amount  ($)", _fmt(deal.get("payment_amount"), prefix="$ "), value_size=11)
    # Frequency chips
    fcx = fx + half * 0.55 + 14
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawString(fcx, fy + 14, "FREQUENCY")
    freq = (deal.get("payment_frequency") or "").lower()
    _checkbox(c, fcx, fy, freq == "weekly", size=8)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(INK)
    c.drawString(fcx + 12, fy + 1, "WEEKLY")
    _checkbox(c, fcx + 65, fy, freq == "monthly", size=8)
    c.drawString(fcx + 77, fy + 1, "MONTHLY")
    # Term + rate
    rx = fx + half + 16
    _labeled(c, rx, fy, half * 0.5, "Loan Term (Months)", _fmt(deal.get("loan_period_months")))
    _labeled(c, rx + half * 0.5 + 12, fy, half - half * 0.5 - 12, "Rate (%)", _fmt(deal.get("loan_rate"), suffix="%"))

    cursor_y -= sec2_h + 12

    # ===== SECTION 3 · TRADE-IN (AMBER) ======================================
    sec3_h = 100
    inner_y = _section_box(c, MARGIN + 8, cursor_y, inner_w - 16, sec3_h, "Trade-In  ·  Optional", SEC_TRADE)
    tx = MARGIN + 20
    tw = inner_w - 40
    tcol = (tw - 30) / 4   # 4 columns

    ty = inner_y - 10
    _labeled(c, tx, ty, tcol, "Year", _fmt(deal.get("trade_year")))
    _labeled(c, tx + (tcol + 10), ty, tcol, "Make", _fmt(deal.get("trade_make")))
    _labeled(c, tx + (tcol + 10) * 2, ty, tcol, "Model", _fmt(deal.get("trade_model")))
    _labeled(c, tx + (tcol + 10) * 3, ty, tcol, "Mileage", _fmt(deal.get("trade_mileage")))
    ty -= 26
    _labeled(c, tx, ty, tw * 0.55, "VIN", _fmt(deal.get("trade_vin")))
    _labeled(c, tx + tw * 0.55 + 10, ty, tw - tw * 0.55 - 10, "Bank", _fmt(deal.get("trade_bank")))
    ty -= 26
    _labeled(c, tx, ty, tcol, "Payoff  ($)", _fmt(deal.get("trade_payoff"), prefix="$ "))
    _labeled(c, tx + (tcol + 10), ty, tcol, "Evaluation  ($)", _fmt(deal.get("trade_evaluation"), prefix="$ "))
    _labeled(c, tx + (tcol + 10) * 2, ty, tcol * 2 + 10, "Credits  ($)", _fmt(deal.get("trade_credits"), prefix="$ "))

    cursor_y -= sec3_h + 12

    # ===== SECTION 4 · DEAL NEGOTIATION (RED) ================================
    sec4_h = 165
    inner_y = _section_box(c, MARGIN + 8, cursor_y, inner_w - 16, sec4_h, "Deal Negotiation", SEC_DEAL)
    dx = MARGIN + 20
    dw = inner_w - 40
    col_w = (dw - 14) / 2
    dx_l = dx
    dx_r = dx + col_w + 14

    # Headers
    c.setFillColor(SEC_DEAL["bg"])
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(dx_l, inner_y - 6, "DEBITS")
    c.drawString(dx_r, inner_y - 6, "CREDITS")

    # DEBITS column
    dy = inner_y - 26
    _labeled(c, dx_l, dy, col_w, "Down Payment  ($)", _fmt(deal.get("down_payment"), prefix="$ "))
    dy -= 24
    _labeled(c, dx_l, dy, col_w, "First Payment  ($)", _fmt(deal.get("first_payment"), prefix="$ "))
    dy -= 24
    _labeled(c, dx_l, dy, col_w, "Tax + Reg + Plate + Others  ($)", _fmt(deal.get("tax_reg_plate"), prefix="$ "))
    dy -= 18
    c.setStrokeColor(GREY)
    c.setLineWidth(0.4)
    c.line(dx_l, dy, dx_l + col_w, dy)
    dy -= 18
    _labeled(c, dx_l, dy, col_w, "TOTAL DEBITS  ($)", _fmt(deal.get("total_debits"), prefix="$ "), value_size=12)

    # CREDITS column — 3 amount/date pairs
    cy = inner_y - 26
    for i in range(3):
        amt = deal.get(f"credit_{i+1}")
        dt = deal.get(f"credit_{i+1}_date")
        _labeled(c, dx_r, cy, col_w - 90, f"Amount {i+1}  ($)", _fmt(amt, prefix="$ "))
        _labeled(c, dx_r + col_w - 86, cy, 86, "Date", _fmt(dt))
        cy -= 24
    cy -= 0   # alignment
    c.setStrokeColor(GREY)
    c.setLineWidth(0.4)
    c.line(dx_r, dy, dx_r + col_w, dy)   # same y as debits divider
    _labeled(c, dx_r, dy - 18, col_w, "TOTAL CREDITS  ($)", _fmt(deal.get("total_credits"), prefix="$ "), value_size=12)

    # TOTAL BALANCE — big red bar across the bottom of the Deal box
    tb_y = cursor_y - sec4_h + 4
    c.setFillColor(SEC_DEAL["bg"])
    c.rect(MARGIN + 8, tb_y, inner_w - 16, 22, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN + 18, tb_y + 7, "TOTAL BALANCE")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(MARGIN + inner_w - 18, tb_y + 6, f"$ {_fmt(deal.get('total_balance')) or '________________'}")

    cursor_y -= sec4_h + 12

    # ===== SECTION 5 · FUTURE CREDITS (PURPLE) ===============================
    future_w = (inner_w - 28) / 2

    # Future credits box
    fut_h = 96
    inner_y = _section_box(c, MARGIN + 8, cursor_y, future_w, fut_h, "Future Credits", SEC_FUTURE)
    fcx = MARGIN + 20
    fcy = inner_y - 10
    fc = deal.get("future_credits") or [{}] * 4
    fc = (fc + [{}] * 4)[:4]
    for i, item in enumerate(fc):
        _labeled(c, fcx, fcy, future_w - 24 - 76, "Amount  ($)", _fmt(item.get("amount"), prefix="$ "))
        _labeled(c, fcx + future_w - 96, fcy, 76, "Date", _fmt(item.get("date")))
        fcy -= 20

    # ===== SECTION 6 · SIGNATURES (BLACK) ====================================
    sig_x = MARGIN + 8 + future_w + 12
    inner_y2 = _section_box(c, sig_x, cursor_y, future_w, fut_h, "Notes & Signatures", SEC_SIGN)
    sx = sig_x + 12
    sy = inner_y2 - 10
    _labeled(c, sx, sy, future_w - 24, "Referral", _fmt(deal.get("referral")))
    sy -= 24
    half_sig = (future_w - 36) / 2
    _labeled(c, sx, sy, half_sig, "Sales Note", _fmt(deal.get("sales_notes")))
    _labeled(c, sx + half_sig + 12, sy, half_sig, "Delivery Note", _fmt(deal.get("delivery_notes")))
    sy -= 30
    _labeled(c, sx, sy, half_sig, "Buyer Signature", _fmt(deal.get("buyer_signature_name")), value_size=10)
    _labeled(c, sx + half_sig + 12, sy, half_sig, "Manager Signature", _fmt(deal.get("manager_signature_name")), value_size=10)

    # ===== Footer agreement strip ============================================
    fy = MARGIN + 6
    c.setFillColor(INK)
    c.rect(MARGIN + 8, fy, inner_w - 16, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(MARGIN + 18, fy + 5, "I AGREE TO THE TERMS OF THIS NEGOTIATION.")
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawRightString(MARGIN + inner_w - 18, fy + 5,
                      "DEPOSITS ARE NON-REFUNDABLE  ·  $30 FEE PER RETURNED CHECK")

    c.showPage()
    c.save()
    return buf.getvalue()


if __name__ == "__main__":
    sample = {
        "name": "John Smith",
        "phone": "+1 (555) 123-4567",
        "last_vin_6": "ABC123",
        "year": 2022,
        "make": "Honda",
        "model": "Civic Sport",
        "color": "Silver",
        "mileage": 38500,
        "salesperson": "Carlos",
        "bank": "westlake",
        "car_price": 22500,
        "doc_fee": 599,
        "warranty": 1500,
        "net_check": 18000,
        "down_payment": 5000,
        "payment_amount": 320,
        "payment_frequency": "weekly",
        "loan_period_months": 60,
        "loan_rate": 14.5,
        "trade_year": 2018,
        "trade_make": "Toyota",
        "trade_model": "Corolla",
        "trade_vin": "1HGBH41JXMN109186",
        "trade_mileage": 92000,
        "trade_payoff": 6500,
        "trade_bank": "Capital One",
        "trade_evaluation": 12000,
        "trade_credits": 5500,
        "transfer_plate": True,
        "insurance": True,
        "first_payment": 320,
        "tax_reg_plate": 1130,
        "total_debits": 6450,
        "credit_1": 2000, "credit_1_date": "05/15/2026",
        "credit_2": 2000, "credit_2_date": "05/22/2026",
        "credit_3": 1000, "credit_3_date": "05/29/2026",
        "total_credits": 5000,
        "total_balance": 1450,
        "future_credits": [
            {"amount": 500, "date": "06/05/2026"},
            {"amount": 500, "date": "06/12/2026"},
            {"amount": 450, "date": "06/19/2026"},
        ],
        "referral": "Pedro M.",
        "sales_notes": "Delivery Fri 2 PM",
        "delivery_notes": "Pickup at counter",
        "sheet_no": "0001",
    }
    with open("/tmp/deal_sheet_sample.pdf", "wb") as f:
        f.write(render_deal_sheet(sample))
    print("Wrote /tmp/deal_sheet_sample.pdf")
