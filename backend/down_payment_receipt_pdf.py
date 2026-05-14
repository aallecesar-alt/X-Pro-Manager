"""Generates a Down Payment Receipt PDF (mirror of installment_receipt_pdf,
but specifically for partial payments toward the agreed down payment).

Title: "DOWN PAYMENT RECEIPT". Shows "Payment X of N", amount, paid date,
method and the running balance against the agreed down_payment.
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
GREEN = colors.HexColor("#15803D")

DEFAULT_STORE = {
    "address": "70 Chelsea St, Everett MA 02149",
    "phone": "(617) 718-0342",
    "email": "intercarmotor@gmail.com",
    "website": "www.intercarautosales.com",
}


def _money(n: Optional[float]) -> str:
    try:
        return f"US$ {float(n or 0):,.2f}"
    except Exception:
        return "US$ 0.00"


def _fmt_date(s: Optional[str]) -> str:
    if not s:
        return "—"
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%m/%d/%Y")
    except Exception:
        return s


def _draw_chip(c: pdfcanvas.Canvas, x: float, y: float, text: str, color, fg=colors.white):
    w = c.stringWidth(text, "Helvetica-Bold", 8) + 14
    c.setFillColor(color)
    c.roundRect(x, y - 2, w, 16, 3, fill=1, stroke=0)
    c.setFillColor(fg)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 7, y + 2, text)


def render_down_payment_receipt(
    *,
    payment: dict,
    vehicle: dict,
    customer: dict,
    summary: dict,
    payment_index: int,
    payment_total: int,
    store: Optional[dict] = None,
    issued_by_name: Optional[str] = None,
) -> bytes:
    """Render the down-payment-receipt PDF as raw bytes.

    payment   : { amount, paid_at, payment_method, notes, payment_no }
    vehicle   : { year, make, model, vin, color }
    customer  : { name, phone }
    summary   : { agreed, paid, balance, fully_paid (bool) }
    payment_index / payment_total : ordinal for "X of N"
    """
    store = {**DEFAULT_STORE, **(store or {})}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    w, h = LETTER
    margin = 0.6 * inch
    y = h - margin

    # Pull dealership branding from the store dict (falls back to Intercar).
    dealer_name = (store.get("name") or "INTERCAR AUTO SALES").upper()

    # ---------- HEADER ----------
    try:
        logo_src = store.get("logo_path") or (LOGO_PATH if os.path.exists(LOGO_PATH) else None)
        if logo_src and os.path.exists(logo_src):
            c.drawImage(logo_src, margin, y - 50, width=60, height=50,
                        preserveAspectRatio=True, mask="auto")
    except Exception:
        pass

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin + 70, y - 14, dealer_name)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 9)
    c.drawString(margin + 70, y - 28, store.get("address") or "")
    c.drawString(margin + 70, y - 40, f"{store.get('phone','')}  ·  {store.get('email','')}")
    c.drawString(margin + 70, y - 52, store.get("website") or "")

    # ---------- HEADLINE STRIPE ----------
    y -= 80
    c.setFillColor(BRAND_RED)
    c.rect(margin, y - 38, w - 2 * margin, 38, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin + 14, y - 24, "DOWN PAYMENT RECEIPT")
    c.setFont("Helvetica", 9)
    paid_at = payment.get("paid_at") or datetime.utcnow().isoformat()
    info_lines = []
    if payment.get("payment_no"):
        info_lines.append(f"Receipt #  {payment.get('payment_no')}")
    info_lines.append(f"Date  {_fmt_date(paid_at)}")
    for i, line in enumerate(info_lines):
        c.drawRightString(w - margin - 12, y - 16 - (i * 12), line)

    # ---------- CUSTOMER + VEHICLE CARDS ----------
    y -= 60
    card_h = 86
    col_w = (w - 2 * margin - 14) / 2

    # Customer card
    c.setFillColor(SOFT)
    c.roundRect(margin, y - card_h, col_w, card_h, 6, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.roundRect(margin, y - card_h, col_w, card_h, 6, fill=0, stroke=1)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin + 10, y - 14, "ISSUED TO")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(margin + 10, y - 32, (customer.get("name") or "—")[:34])
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    cy = y - 48
    if customer.get("phone"):
        c.drawString(margin + 10, cy, f"Phone: {customer.get('phone')}")
        cy -= 12
    veh_label = f"{vehicle.get('year','') or ''} {vehicle.get('make','') or ''} {vehicle.get('model','') or ''}".strip()
    if veh_label:
        c.drawString(margin + 10, cy, f"Vehicle: {veh_label[:50]}")

    # Payment card
    col2_x = margin + col_w + 14
    c.setFillColor(SOFT)
    c.roundRect(col2_x, y - card_h, col_w, card_h, 6, fill=1, stroke=0)
    c.roundRect(col2_x, y - card_h, col_w, card_h, 6, fill=0, stroke=1)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(col2_x + 10, y - 14, "PAYMENT")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(col2_x + 10, y - 40, f"{payment_index} of {payment_total}")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    cy = y - 54
    c.drawString(col2_x + 10, cy, f"Paid on:    {_fmt_date(payment.get('paid_at'))}")
    if payment.get("payment_method"):
        cy -= 12
        c.drawString(col2_x + 10, cy, f"Method:     {payment.get('payment_method')}")
    if vehicle.get("vin"):
        cy -= 12
        c.drawString(col2_x + 10, cy, f"VIN:        {vehicle.get('vin')}")

    # ---------- AMOUNT BOX (HERO) ----------
    y -= card_h + 22
    amount_h = 80
    c.setFillColor(colors.HexColor("#FFF5F5"))
    c.roundRect(margin, y - amount_h, w - 2 * margin, amount_h, 6, fill=1, stroke=0)
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(1)
    c.roundRect(margin, y - amount_h, w - 2 * margin, amount_h, 6, fill=0, stroke=1)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin + 16, y - 18, "AMOUNT RECEIVED")
    c.setFillColor(BRAND_RED_DARK)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(margin + 16, y - 56, _money(payment.get("amount")))
    chip_text = "FULLY PAID" if summary.get("fully_paid") else "PAID"
    chip_color = GREEN if summary.get("fully_paid") else BRAND_RED
    chip_w = c.stringWidth(chip_text, "Helvetica-Bold", 8) + 16
    _draw_chip(c, w - margin - chip_w - 4, y - 38, chip_text, chip_color)

    # ---------- BALANCE SUMMARY ----------
    y -= amount_h + 18
    agreed = float(summary.get("agreed") or 0)
    paid = float(summary.get("paid") or 0)
    remaining = max(agreed - paid, 0)

    box_h = 70
    c.setFillColor(LIGHT_GREY)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=0, stroke=1)

    cell_w = (w - 2 * margin) / 4
    cells = [
        ("PAYMENTS MADE", f"{payment_index} of {payment_total}"),
        ("AGREED DOWN PAYMENT", _money(agreed)),
        ("PAID SO FAR", _money(paid)),
        ("REMAINING BALANCE", _money(remaining)),
    ]
    for i, (lbl, val) in enumerate(cells):
        cx = margin + i * cell_w
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(cx + 12, y - 16, lbl)
        c.setFillColor(INK if i != 3 else (GREEN if remaining == 0 else BRAND_RED_DARK))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(cx + 12, y - 40, val)

    # ---------- LEGAL / NOTE ----------
    y -= box_h + 22
    note_h = 38
    c.setFillColor(SOFT)
    c.roundRect(margin, y - note_h, w - 2 * margin, note_h, 4, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.roundRect(margin, y - note_h, w - 2 * margin, note_h, 4, fill=0, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8.5)
    note = (
        "This receipt certifies the payment of the amount above as part of the down payment "
        "agreed for the vehicle referenced. For any questions, please contact us."
    )
    words = note.split()
    lines, cur = [], ""
    for word in words:
        if c.stringWidth(cur + " " + word, "Helvetica", 8.5) < w - 2 * margin - 24:
            cur = (cur + " " + word).strip()
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    for i, line in enumerate(lines[:2]):
        c.drawString(margin + 12, y - 16 - i * 11, line)

    # Optional payment note
    if payment.get("notes"):
        y_note = y - note_h - 14
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 8.5)
        c.drawString(margin, y_note, f"Note: {str(payment.get('notes'))[:160]}")

    # ---------- SIGNATURE LINES ----------
    y -= note_h + 60
    line_w = (w - 2 * margin - 30) / 2
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    c.line(margin, y, margin + line_w, y)
    c.line(margin + line_w + 30, y, w - margin, y)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(margin, y - 12, "Customer Signature")
    c.drawString(margin + line_w + 30, y - 12, "Dealer / Cashier Signature")
    if issued_by_name:
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin + line_w + 30, y - 26, issued_by_name)

    # Footer
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, margin / 2, f"{dealer_name} · {store.get('website','')} · Electronically issued document")

    c.showPage()
    c.save()
    return buf.getvalue()
