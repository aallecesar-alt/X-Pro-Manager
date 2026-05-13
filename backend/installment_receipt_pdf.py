"""Generates a Payment Receipt PDF for an individual receivable installment.

Designed for moments when the customer pays a monthly installment and asks for
a printed receipt to take home. Letter portrait (8.5" × 11"). Returns raw bytes.

Layout mirrors the deposit-receipt design (same brand language) but the body
focuses on the installment details: number "X de Y", amount, due date, paid
date, payment method, and the running balance after this payment.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional, List

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


def render_installment_receipt(
    *,
    receivable: dict,
    installment: dict,
    store: Optional[dict] = None,
    receipt_no: Optional[str] = None,
    issued_by_name: Optional[str] = None,
) -> bytes:
    """Render the installment-receipt PDF as raw bytes.

    receivable: { customer_name, customer_phone, vehicle_label, total_amount,
                  installments: [...], notes, ... }
    installment: { number, amount, due_date, paid_at, payment_method, notes }
    """
    store = {**DEFAULT_STORE, **(store or {})}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    w, h = LETTER
    margin = 0.6 * inch
    y = h - margin

    # ---------- HEADER ----------
    try:
        if os.path.exists(LOGO_PATH):
            c.drawImage(LOGO_PATH, margin, y - 50, width=60, height=50,
                        preserveAspectRatio=True, mask="auto")
    except Exception:
        pass

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin + 70, y - 14, "INTERCAR AUTO SALES")
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
    c.drawString(margin + 14, y - 24, "RECIBO DE PAGAMENTO")
    # Right side: receipt no + date
    c.setFont("Helvetica", 9)
    paid_at = installment.get("paid_at") or datetime.utcnow().isoformat()
    info_lines = []
    if receipt_no:
        info_lines.append(f"Recibo Nº  {receipt_no}")
    info_lines.append(f"Data  {_fmt_date(paid_at)}")
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
    c.drawString(margin + 10, y - 14, "EMITIDO PARA")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(margin + 10, y - 32, (receivable.get("customer_name") or "—")[:34])
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    cy = y - 48
    if receivable.get("customer_phone"):
        c.drawString(margin + 10, cy, f"Tel: {receivable.get('customer_phone')}")
        cy -= 12
    if receivable.get("vehicle_label"):
        c.drawString(margin + 10, cy, f"Veículo: {receivable.get('vehicle_label')[:50]}")

    # Installment card
    col2_x = margin + col_w + 14
    c.setFillColor(SOFT)
    c.roundRect(col2_x, y - card_h, col_w, card_h, 6, fill=1, stroke=0)
    c.roundRect(col2_x, y - card_h, col_w, card_h, 6, fill=0, stroke=1)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(col2_x + 10, y - 14, "REFERENTE À PARCELA")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    total_parcels = len(receivable.get("installments") or []) or "—"
    inst_no = installment.get("number")
    c.drawString(col2_x + 10, y - 40, f"{inst_no} de {total_parcels}")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    cy = y - 54
    c.drawString(col2_x + 10, cy, f"Vencimento: {_fmt_date(installment.get('due_date'))}")
    cy -= 12
    c.drawString(col2_x + 10, cy, f"Pago em:    {_fmt_date(installment.get('paid_at'))}")
    if installment.get("payment_method"):
        cy -= 12
        c.drawString(col2_x + 10, cy, f"Pagamento:  {installment.get('payment_method')}")

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
    c.drawString(margin + 16, y - 18, "VALOR RECEBIDO")
    c.setFillColor(BRAND_RED_DARK)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(margin + 16, y - 56, _money(installment.get("amount")))
    # Status chip on right
    _draw_chip(c, w - margin - 80, y - 38, "QUITADA", GREEN)

    # ---------- BALANCE SUMMARY ----------
    y -= amount_h + 18
    insts = receivable.get("installments") or []
    paid_count = sum(1 for it in insts if it.get("status") == "paid" or it.get("paid_at"))
    total_amount = sum(float(it.get("amount") or 0) for it in insts) or float(receivable.get("total_amount") or 0)
    paid_amount = sum(float(it.get("amount") or 0) for it in insts if it.get("status") == "paid" or it.get("paid_at"))
    remaining = max(total_amount - paid_amount, 0)

    box_h = 70
    c.setFillColor(LIGHT_GREY)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=0, stroke=1)

    cell_w = (w - 2 * margin) / 4
    cells = [
        ("PARCELAS PAGAS", f"{paid_count} de {len(insts)}"),
        ("TOTAL DO CONTRATO", _money(total_amount)),
        ("PAGO ATÉ AGORA", _money(paid_amount)),
        ("SALDO RESTANTE", _money(remaining)),
    ]
    for i, (lbl, val) in enumerate(cells):
        cx = margin + i * cell_w
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(cx + 12, y - 16, lbl)
        c.setFillColor(INK if i != 3 else BRAND_RED_DARK)
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
        "Este recibo certifica o pagamento da parcela acima referente ao contrato firmado com o cliente. "
        "Em caso de dúvidas, entre em contato com a INTERCAR Auto Sales."
    )
    # naive word-wrap
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

    # ---------- SIGNATURE LINES ----------
    y -= note_h + 60
    line_w = (w - 2 * margin - 30) / 2
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    c.line(margin, y, margin + line_w, y)
    c.line(margin + line_w + 30, y, w - margin, y)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(margin, y - 12, "Assinatura do Cliente")
    c.drawString(margin + line_w + 30, y - 12, "Assinatura do Vendedor / Caixa")
    if issued_by_name:
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin + line_w + 30, y - 26, issued_by_name)

    # Footer
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, margin / 2, f"INTERCAR AUTO SALES · {store.get('website','')} · Documento emitido eletronicamente")

    c.showPage()
    c.save()
    return buf.getvalue()
