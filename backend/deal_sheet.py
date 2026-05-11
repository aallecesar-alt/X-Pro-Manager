"""Generates the professional Deal Sheet (Negotiation Sheet) PDF for INTERCAR Auto Sales.

Letter portrait (8.5" × 11") — standard sulfite paper for office printers.
No header title — the logo speaks for itself. All labels in English.

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

# Brand palette
BRAND_RED = colors.HexColor("#D92D20")
BRAND_DARK = colors.HexColor("#0F0F10")
BRAND_GREY = colors.HexColor("#6B6B6B")
BRAND_LIGHT = colors.HexColor("#F8F8F8")
BRAND_BORDER = colors.HexColor("#222222")
BRAND_LINE = colors.HexColor("#D5D5D5")


def _fmt(value, prefix="", suffix="") -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)):
        return f"{prefix}{value:,.2f}{suffix}"
    return f"{prefix}{value}{suffix}"


def _checkbox(c: pdfcanvas.Canvas, x: float, y: float, checked: bool, size: float = 8):
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.7)
    c.rect(x, y, size, size, fill=0)
    if checked:
        c.setStrokeColor(BRAND_RED)
        c.setLineWidth(1.5)
        c.line(x + 1.5, y + size / 2, x + size / 2 - 0.5, y + 1.5)
        c.line(x + size / 2 - 0.5, y + 1.5, x + size - 1, y + size - 1)
        c.setLineWidth(0.7)


def _labeled_field(c: pdfcanvas.Canvas, x: float, y: float, width: float, label: str, value: str = "", label_size: float = 5.8, value_size: float = 9):
    """Tiny grey label above, value sitting on a thin grey underline."""
    c.setFont("Helvetica-Bold", label_size)
    c.setFillColor(BRAND_GREY)
    c.drawString(x, y + 12, label.upper())
    c.setStrokeColor(BRAND_LINE)
    c.setLineWidth(0.5)
    c.line(x, y, x + width, y)
    if value:
        c.setFont("Helvetica", value_size)
        c.setFillColor(BRAND_DARK)
        c.drawString(x + 2, y + 2.5, str(value))


def _section_bar(c: pdfcanvas.Canvas, x: float, y: float, width: float, text: str, height: float = 13):
    c.setFillColor(BRAND_DARK)
    c.rect(x, y, width, height, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 6, y + 3.5, text.upper())


def render_deal_sheet(deal: Optional[dict] = None) -> bytes:
    deal = deal or {}
    buf = io.BytesIO()
    PW, PH = LETTER  # 612 × 792 (8.5" × 11")
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    c.setTitle("INTERCAR Auto Sales — Deal Sheet")

    MARGIN = 0.45 * inch
    inner_w = PW - 2 * MARGIN

    # ===== Outer page border =================================================
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.8)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== Header: centered logo + brand name ================================
    HEADER_H = 90
    header_top = PH - MARGIN - 8
    header_bottom = header_top - HEADER_H

    if os.path.exists(LOGO_PATH):
        try:
            logo_h = 56
            c.drawImage(
                LOGO_PATH,
                PW / 2 - logo_h / 2,
                header_top - logo_h - 4,
                width=logo_h,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    # Brand name + tagline centered below the logo
    c.setFont("Helvetica-Bold", 17)
    c.setFillColor(BRAND_DARK)
    c.drawCentredString(PW / 2, header_bottom + 18, "INTERCAR")
    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_GREY)
    c.drawCentredString(PW / 2, header_bottom + 7, "AUTO SALES")

    # Red horizontal accent line below the header
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(1.5)
    c.line(MARGIN + 8, header_bottom - 2, PW - MARGIN - 8, header_bottom - 2)

    # ===== Customer / Vehicle row ============================================
    cursor_y = header_bottom - 22
    today_str = deal.get("date") or datetime.now().strftime("%m/%d/%Y")

    # Row 1: Date · Customer Name · Phone · Salesperson
    row_x = MARGIN + 8
    row_w = inner_w - 16
    fields_row1 = [
        ("Date", 65, _fmt(today_str)),
        ("Customer Name", 200, _fmt(deal.get("name"))),
        ("Phone", 110, _fmt(deal.get("phone"))),
        ("Salesperson", row_w - 65 - 200 - 110 - 18, _fmt(deal.get("salesperson"))),
    ]
    x = row_x
    for label, w, val in fields_row1:
        _labeled_field(c, x, cursor_y, w, label, val)
        x += w + 6

    # Row 2: Last 6 VIN · Year · Make · Model · Color · Mileage
    cursor_y -= 26
    fields_row2 = [
        ("Last 6 VIN", 70, _fmt(deal.get("last_vin_6"))),
        ("Year", 45, _fmt(deal.get("year"))),
        ("Make", 95, _fmt(deal.get("make"))),
        ("Model", 130, _fmt(deal.get("model"))),
        ("Color", 70, _fmt(deal.get("color"))),
        ("Mileage", row_w - 70 - 45 - 95 - 130 - 70 - 30, _fmt(deal.get("mileage"))),
    ]
    x = row_x
    for label, w, val in fields_row2:
        _labeled_field(c, x, cursor_y, w, label, val)
        x += w + 6

    # Row 3: Bank radios + Transfer Plate + Insurance
    cursor_y -= 22
    c.setFont("Helvetica-Bold", 6)
    c.setFillColor(BRAND_GREY)
    c.drawString(row_x, cursor_y + 12, "BANK")
    bank = (deal.get("bank") or "").lower()
    bx = row_x
    by_box = cursor_y - 1
    options = [("westlake", "WESTLAKE"), ("lendbuzz", "LENDBUZZ"), ("fh", "FH APP #")]
    for key, label in options:
        _checkbox(c, bx, by_box, bank == key)
        c.setFont("Helvetica", 8)
        c.setFillColor(BRAND_DARK)
        c.drawString(bx + 12, by_box + 0.5, label)
        bx += 12 + len(label) * 5 + 10
    # FH app number field
    _labeled_field(c, bx, cursor_y, 95, "FH App Number", _fmt(deal.get("fh_app_number")))
    bx += 95 + 16

    # Transfer plate
    c.setFont("Helvetica-Bold", 6)
    c.setFillColor(BRAND_GREY)
    c.drawString(bx, cursor_y + 12, "TRANSFER PLATE")
    tp = bool(deal.get("transfer_plate"))
    tp_explicit = deal.get("transfer_plate") is not None
    _checkbox(c, bx, by_box, tp)
    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_DARK)
    c.drawString(bx + 12, by_box + 0.5, "YES")
    _checkbox(c, bx + 38, by_box, not tp and tp_explicit)
    c.drawString(bx + 50, by_box + 0.5, "NO")
    bx += 76

    # Insurance
    c.setFont("Helvetica-Bold", 6)
    c.setFillColor(BRAND_GREY)
    c.drawString(bx, cursor_y + 12, "INSURANCE")
    ins = bool(deal.get("insurance"))
    ins_explicit = deal.get("insurance") is not None
    _checkbox(c, bx, by_box, ins)
    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_DARK)
    c.drawString(bx + 12, by_box + 0.5, "YES")
    _checkbox(c, bx + 38, by_box, not ins and ins_explicit)
    c.drawString(bx + 50, by_box + 0.5, "NO")

    cursor_y -= 8

    # ===== FINANCE + TRADE side by side =====================================
    cursor_y -= 10
    col_w = (inner_w - 22) / 2
    fin_x = MARGIN + 8
    trade_x = fin_x + col_w + 6

    fin_h = 132

    # FINANCE box
    c.setFillColor(BRAND_LIGHT)
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.6)
    c.rect(fin_x, cursor_y - fin_h, col_w, fin_h, fill=1, stroke=1)
    _section_bar(c, fin_x, cursor_y - 13, col_w, "Finance")
    fy = cursor_y - 30
    _labeled_field(c, fin_x + 8, fy, col_w - 16, "Car Price  ($)", _fmt(deal.get("car_price"), prefix="$ "), value_size=10)
    fy -= 22
    _labeled_field(c, fin_x + 8, fy, col_w - 16, "(+) Doc Fee + Finance Fee  ($)", _fmt(deal.get("doc_fee"), prefix="$ "))
    fy -= 20
    _labeled_field(c, fin_x + 8, fy, col_w - 16, "(+) Warranty + Others  ($)", _fmt(deal.get("warranty"), prefix="$ "))
    fy -= 20
    _labeled_field(c, fin_x + 8, fy, col_w - 16, "(−) Net Check  ($)", _fmt(deal.get("net_check"), prefix="$ "))
    fy -= 22
    # Highlighted Down Payment line
    c.setFillColor(BRAND_RED)
    c.rect(fin_x + 4, fy - 3, col_w - 8, 16, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.white)
    c.drawString(fin_x + 10, fy + 3.5, "(=) DOWN PAYMENT  ($)")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(fin_x + col_w - 8, fy + 3.5, _fmt(deal.get("down_payment"), prefix="$ ") or "_____________")

    # TRADE box
    c.setFillColor(BRAND_LIGHT)
    c.setStrokeColor(BRAND_BORDER)
    c.rect(trade_x, cursor_y - fin_h, col_w, fin_h, fill=1, stroke=1)
    _section_bar(c, trade_x, cursor_y - 13, col_w, "Trade-In")
    ty = cursor_y - 30
    half = (col_w - 22) / 2
    _labeled_field(c, trade_x + 8, ty, half - 4, "Year", _fmt(deal.get("trade_year")))
    _labeled_field(c, trade_x + 8 + half + 6, ty, half - 4, "Make", _fmt(deal.get("trade_make")))
    ty -= 22
    _labeled_field(c, trade_x + 8, ty, half - 4, "Model", _fmt(deal.get("trade_model")))
    _labeled_field(c, trade_x + 8 + half + 6, ty, half - 4, "Mileage", _fmt(deal.get("trade_mileage")))
    ty -= 22
    _labeled_field(c, trade_x + 8, ty, col_w - 16, "VIN", _fmt(deal.get("trade_vin")))
    ty -= 22
    _labeled_field(c, trade_x + 8, ty, half - 4, "Payoff  ($)", _fmt(deal.get("trade_payoff"), prefix="$ "))
    _labeled_field(c, trade_x + 8 + half + 6, ty, half - 4, "Bank", _fmt(deal.get("trade_bank")))
    ty -= 22
    _labeled_field(c, trade_x + 8, ty, half - 4, "Evaluation  ($)", _fmt(deal.get("trade_evaluation"), prefix="$ "))
    _labeled_field(c, trade_x + 8 + half + 6, ty, half - 4, "Credits  ($)", _fmt(deal.get("trade_credits"), prefix="$ "))

    # ===== Payment terms row (full width) ===================================
    cursor_y = cursor_y - fin_h - 16
    pay_x = MARGIN + 8
    pay_w = inner_w - 16
    pay_box_h = 38
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.6)
    c.rect(pay_x, cursor_y - pay_box_h, pay_w, pay_box_h, fill=0)

    # Payment amount + frequency chips + loan term + rate
    py = cursor_y - 26
    _labeled_field(c, pay_x + 10, py, 150, "Payment Amount  ($)", _fmt(deal.get("payment_amount"), prefix="$ "), value_size=10)

    # Frequency chips
    freq = (deal.get("payment_frequency") or "").lower()
    fbx = pay_x + 170
    c.setFont("Helvetica-Bold", 6)
    c.setFillColor(BRAND_GREY)
    c.drawString(fbx, py + 12, "FREQUENCY")
    _checkbox(c, fbx, py - 1, freq == "weekly", size=7)
    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_DARK)
    c.drawString(fbx + 11, py - 0.5, "WEEKLY")
    _checkbox(c, fbx + 58, py - 1, freq == "monthly", size=7)
    c.drawString(fbx + 69, py - 0.5, "MONTHLY")

    fbx = pay_x + 320
    _labeled_field(c, fbx, py, 100, "Loan Period (Months)", _fmt(deal.get("loan_period_months")))
    _labeled_field(c, fbx + 110, py, pay_w - 320 - 110 - 16, "Rate (%)", _fmt(deal.get("loan_rate"), suffix="%"))

    # ===== Deal Negotiation: DEBITS · CREDITS · TOTAL BALANCE ===============
    cursor_y -= pay_box_h + 12
    dn_h = 142
    _section_bar(c, MARGIN + 8, cursor_y - 13, inner_w - 16, "Deal Negotiation")
    c.setFillColor(BRAND_LIGHT)
    c.setStrokeColor(BRAND_BORDER)
    c.rect(MARGIN + 8, cursor_y - dn_h, inner_w - 16, dn_h - 13, fill=1, stroke=1)

    half_w = (inner_w - 32) / 2
    dx_l = MARGIN + 16
    dx_r = dx_l + half_w + 10
    dy_top = cursor_y - 28

    c.setFillColor(BRAND_RED)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(dx_l, dy_top + 4, "DEBITS")
    c.drawString(dx_r, dy_top + 4, "CREDITS")

    # DEBITS column
    _labeled_field(c, dx_l, dy_top - 16, half_w - 6, "Down Payment  ($)", _fmt(deal.get("down_payment"), prefix="$ "))
    _labeled_field(c, dx_l, dy_top - 36, half_w - 6, "First Payment  ($)", _fmt(deal.get("first_payment"), prefix="$ "))
    _labeled_field(c, dx_l, dy_top - 56, half_w - 6, "Tax + Reg + Plate + Others  ($)", _fmt(deal.get("tax_reg_plate"), prefix="$ "))
    # Divider
    c.setStrokeColor(BRAND_GREY)
    c.setLineWidth(0.5)
    c.line(dx_l, dy_top - 70, dx_l + half_w - 6, dy_top - 70)
    _labeled_field(c, dx_l, dy_top - 84, half_w - 6, "Total Debits  ($)", _fmt(deal.get("total_debits"), prefix="$ "), value_size=11)

    # CREDITS column (3 amount+date rows + total)
    cy = dy_top - 16
    for i in range(3):
        amt_key = f"credit_{i+1}"
        date_key = f"credit_{i+1}_date"
        _labeled_field(c, dx_r, cy, half_w - 6 - 80, f"Amount {i+1}  ($)", _fmt(deal.get(amt_key), prefix="$ "))
        _labeled_field(c, dx_r + half_w - 80, cy, 74, "Date", _fmt(deal.get(date_key)))
        cy -= 20
    # Divider
    c.setStrokeColor(BRAND_GREY)
    c.setLineWidth(0.5)
    c.line(dx_r, dy_top - 70, dx_r + half_w - 6, dy_top - 70)
    _labeled_field(c, dx_r, dy_top - 84, half_w - 6, "Total Credits  ($)", _fmt(deal.get("total_credits"), prefix="$ "), value_size=11)

    # TOTAL BALANCE — big red bar at bottom of the box
    tb_y = cursor_y - dn_h + 4
    c.setFillColor(BRAND_RED)
    c.rect(MARGIN + 8, tb_y, inner_w - 16, 18, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN + 16, tb_y + 5.5, "TOTAL BALANCE")
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(MARGIN + inner_w - 16, tb_y + 4.5, f"$ {_fmt(deal.get('total_balance')) or '________________'}")

    # ===== Future Credits + Signatures + Notes ==============================
    cursor_y = tb_y - 14
    foot_h = 130
    fn_w = (inner_w - 24) / 2
    fn_x = MARGIN + 8
    sig_x = fn_x + fn_w + 8

    # Left: Future Credits
    _section_bar(c, fn_x, cursor_y - 13, fn_w, "Future Credits")
    c.setStrokeColor(BRAND_BORDER)
    c.rect(fn_x, cursor_y - foot_h, fn_w, foot_h - 13, fill=0)
    fcy = cursor_y - 28
    fc = deal.get("future_credits") or [{}] * 4
    for i in range(4):
        item = fc[i] if i < len(fc) else {}
        _labeled_field(c, fn_x + 10, fcy, fn_w - 20 - 80, f"Amount  ($)", _fmt(item.get("amount"), prefix="$ "))
        _labeled_field(c, fn_x + fn_w - 90, fcy, 80, "Date", _fmt(item.get("date")))
        fcy -= 20

    # Right: Notes + Signatures
    _section_bar(c, sig_x, cursor_y - 13, fn_w, "Notes & Signatures")
    c.setStrokeColor(BRAND_BORDER)
    c.rect(sig_x, cursor_y - foot_h, fn_w, foot_h - 13, fill=0)
    sy = cursor_y - 28
    half = (fn_w - 24) / 2
    _labeled_field(c, sig_x + 10, sy, fn_w - 20, "Referral", _fmt(deal.get("referral")))
    sy -= 20
    _labeled_field(c, sig_x + 10, sy, half - 4, "Sales Note", _fmt(deal.get("sales_notes")))
    _labeled_field(c, sig_x + 10 + half + 4, sy, half - 4, "Delivery Note", _fmt(deal.get("delivery_notes")))
    sy -= 30
    _labeled_field(c, sig_x + 10, sy, half - 4, "Buyer Signature", _fmt(deal.get("buyer_signature_name")), value_size=10)
    _labeled_field(c, sig_x + 10 + half + 4, sy, half - 4, "Manager Signature", _fmt(deal.get("manager_signature_name")), value_size=10)

    # ===== Footer agreement strip ============================================
    fy = MARGIN + 6
    c.setFillColor(BRAND_DARK)
    c.rect(MARGIN + 8, fy, inner_w - 16, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(MARGIN + 16, fy + 5, "I AGREE TO THE TERMS OF THIS NEGOTIATION.")
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawRightString(MARGIN + inner_w - 16, fy + 5, "DEPOSITS ARE NON-REFUNDABLE  ·  $30 FEE PER RETURNED CHECK")

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
        "delivery_notes": "Customer pickup at counter",
        "buyer_signature_name": "",
        "manager_signature_name": "",
    }
    with open("/tmp/deal_sheet_sample.pdf", "wb") as f:
        f.write(render_deal_sheet(sample))
    print("Wrote /tmp/deal_sheet_sample.pdf")
