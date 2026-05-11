"""Generates a professional Deal Sheet (Folha de Negociação) PDF for Inter Car.

Re-creates the structure of the dealership's existing paper form, but with:
  - Centered Inter Car logo
  - Cleaner typography (Helvetica)
  - Auto-filled values from a `deal` dict (Python kwargs)
  - All fields blank by default (returns a blank form when no data is passed)
  - A 4-step signature block at the bottom

Returns the rendered PDF as raw bytes.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import Paragraph

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "intercar-logo.png")

# Brand palette — mirror the app's red + dark UI but stay print-friendly.
BRAND_RED = colors.HexColor("#D92D20")
BRAND_DARK = colors.HexColor("#0F0F10")
BRAND_GREY = colors.HexColor("#5A5A5A")
BRAND_LIGHT = colors.HexColor("#F5F5F5")
BRAND_BORDER = colors.HexColor("#1F1F1F")


def _fmt(value, prefix="", suffix="") -> str:
    """Pretty-format a value for display on the form. None / "" → blank."""
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)):
        return f"{prefix}{value:,.2f}{suffix}"
    return f"{prefix}{value}{suffix}"


def _checkbox(c: pdfcanvas.Canvas, x: float, y: float, checked: bool, size: float = 9):
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.8)
    c.rect(x, y, size, size, fill=0)
    if checked:
        c.setFillColor(BRAND_RED)
        c.setLineWidth(1.5)
        # Draw a check mark inside
        c.line(x + 1.5, y + size / 2, x + size / 2 - 0.5, y + 1.5)
        c.line(x + size / 2 - 0.5, y + 1.5, x + size - 1, y + size - 1)
        c.setLineWidth(0.8)


def _field(c: pdfcanvas.Canvas, x: float, y: float, width: float, label: str, value: str = "", label_size: float = 6, value_size: float = 9):
    """Draws a horizontal field with label above and a value on top of an underline."""
    # Label (small, grey, uppercase)
    c.setFont("Helvetica-Bold", label_size)
    c.setFillColor(BRAND_GREY)
    c.drawString(x, y + 11, label.upper())
    # Underline
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.5)
    c.line(x, y, x + width, y)
    # Value (above the underline, near the bottom)
    if value:
        c.setFont("Helvetica", value_size)
        c.setFillColor(BRAND_DARK)
        c.drawString(x + 2, y + 2, str(value))


def _section_header(c: pdfcanvas.Canvas, x: float, y: float, width: float, text: str):
    """Black bar with white uppercase text."""
    c.setFillColor(BRAND_DARK)
    c.rect(x, y, width, 14, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x + 6, y + 3.5, text.upper())


def render_deal_sheet(deal: Optional[dict] = None) -> bytes:
    """Generates the deal-sheet PDF. Pass any of these keys in `deal`:
        date, name, phone, address, last_vin_6, year, make, model, color, mileage,
        salesperson, bank ('westlake'|'lendbuzz'|'fh'), fh_app_number,
        car_price, doc_fee, warranty, net_check, down_payment,
        payment_amount, payment_frequency ('weekly'|'monthly'), loan_period_months, loan_rate,
        trade_year, trade_make, trade_model, trade_vin, trade_mileage,
        trade_payoff, trade_bank, trade_evaluation, trade_credits, trade_on_buyer_behalf (bool),
        transfer_plate (bool), insurance (bool),
        first_payment, tax_reg_plate, total_debits,
        credit_1, credit_1_date, credit_2, credit_2_date, credit_3, credit_3_date,
        total_credits, total_balance, additional_info,
        future_credits (list of {amount, date}),
        referral, sales_notes, delivery_notes,
        checks_agreed_amount, total_balance_check, check_count,
        buyer_signature_name, manager_signature_name,
    """
    deal = deal or {}
    buf = io.BytesIO()
    PAGE = landscape(LETTER)  # 11" × 8.5"
    PW, PH = PAGE
    c = pdfcanvas.Canvas(buf, pagesize=PAGE)
    c.setTitle("Folha de Negociação — Inter Car Auto Sales")

    MARGIN = 0.35 * inch
    inner_w = PW - 2 * MARGIN

    # ===== Page border =========================================================
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(1)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== Header band =========================================================
    HEADER_H = 60
    header_y = PH - MARGIN - HEADER_H
    # Logo (left, scaled to header height)
    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(
                LOGO_PATH,
                MARGIN + 6,
                header_y + 4,
                width=HEADER_H - 8,
                height=HEADER_H - 8,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass
    # Brand title beside the logo
    title_x = MARGIN + HEADER_H + 4
    c.setFillColor(BRAND_DARK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(title_x, header_y + HEADER_H - 22, "INTER CAR")
    c.setFont("Helvetica", 10)
    c.setFillColor(BRAND_GREY)
    c.drawString(title_x, header_y + HEADER_H - 36, "AUTO SALES")

    # Right-aligned: doc title + filling instructions
    c.setFillColor(BRAND_RED)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(MARGIN + inner_w - 6, header_y + HEADER_H - 22, "FOLHA DE NEGOCIAÇÃO")
    c.setFillColor(BRAND_GREY)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(MARGIN + inner_w - 6, header_y + HEADER_H - 35, "DEALER NEGOTIATION SHEET")
    c.setFont("Helvetica-Oblique", 7)
    c.drawRightString(MARGIN + inner_w - 6, header_y + HEADER_H - 47, "Original: Cliente · Cópia: Inter Car")

    # Separator below header
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(2)
    c.line(MARGIN, header_y, MARGIN + inner_w, header_y)

    # ===== Buyer + Vehicle info row ============================================
    cursor_y = header_y - 18
    today_str = deal.get("date") or datetime.now().strftime("%m/%d/%Y")

    info_fields = [
        ("DATA / DATE", 70, _fmt(today_str)),
        ("NOME DO CLIENTE / CUSTOMER NAME", 180, _fmt(deal.get("name"))),
        ("TELEFONE / PHONE", 100, _fmt(deal.get("phone"))),
        ("6 LAST VIN", 60, _fmt(deal.get("last_vin_6"))),
        ("ANO", 35, _fmt(deal.get("year"))),
        ("MARCA / MAKE", 75, _fmt(deal.get("make"))),
        ("MODELO / MODEL", 95, _fmt(deal.get("model"))),
        ("VENDEDOR / SALES", 95, _fmt(deal.get("salesperson"))),
    ]
    x = MARGIN + 6
    for label, w, val in info_fields:
        _field(c, x, cursor_y, w, label, val)
        x += w + 8

    # Bank checkboxes row
    cursor_y -= 26
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BRAND_GREY)
    c.drawString(MARGIN + 6, cursor_y + 8, "BANCO / BANK:")
    bank = (deal.get("bank") or "").lower()
    bx = MARGIN + 6 + 70
    _checkbox(c, bx, cursor_y, bank == "westlake")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(BRAND_DARK)
    c.drawString(bx + 13, cursor_y + 1, "WESTLAKE")
    bx += 90
    _checkbox(c, bx, cursor_y, bank == "lendbuzz")
    c.drawString(bx + 13, cursor_y + 1, "LENDBUZZ")
    bx += 90
    _checkbox(c, bx, cursor_y, bank == "fh")
    c.drawString(bx + 13, cursor_y + 1, "FH APP #")
    _field(c, bx + 65, cursor_y - 2, 90, "", _fmt(deal.get("fh_app_number")), value_size=8.5)
    # Transfer plate / insurance
    tx = bx + 175
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BRAND_GREY)
    c.drawString(tx, cursor_y + 8, "TRANSF. PLATE:")
    tp = bool(deal.get("transfer_plate"))
    _checkbox(c, tx + 78, cursor_y, tp)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(BRAND_DARK)
    c.drawString(tx + 91, cursor_y + 1, "YES")
    _checkbox(c, tx + 113, cursor_y, not tp and deal.get("transfer_plate") is not None)
    c.drawString(tx + 126, cursor_y + 1, "NO")
    tx += 160
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BRAND_GREY)
    c.drawString(tx, cursor_y + 8, "SEGURO / INSURANCE:")
    ins = bool(deal.get("insurance"))
    _checkbox(c, tx + 110, cursor_y, ins)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(BRAND_DARK)
    c.drawString(tx + 123, cursor_y + 1, "YES")
    _checkbox(c, tx + 145, cursor_y, not ins and deal.get("insurance") is not None)
    c.drawString(tx + 158, cursor_y + 1, "NO")

    # ===== FINANCE + TRADE side by side ========================================
    cursor_y -= 18
    col_w = (inner_w - 12) / 2
    fin_x = MARGIN + 6
    trade_x = fin_x + col_w + 12 - 6

    # FINANCE box
    fin_h = 130
    fin_top = cursor_y
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.8)
    c.rect(fin_x - 4, fin_top - fin_h, col_w, fin_h, fill=0)
    _section_header(c, fin_x - 4, fin_top - 14, col_w, "FINANCIAMENTO  /  FINANCE")
    fy = fin_top - 30
    _field(c, fin_x, fy, col_w - 12, "(=) PREÇO DO CARRO / CAR PRICE  ($)", _fmt(deal.get("car_price"), prefix="$ "), value_size=10)
    fy -= 22
    _field(c, fin_x, fy, col_w - 12, "(+) DOC FEE + FINANCE FEE  ($)", _fmt(deal.get("doc_fee"), prefix="$ "))
    fy -= 18
    _field(c, fin_x, fy, col_w - 12, "(+) GARANTIA + OUTROS / WARRANTY + OTHERS  ($)", _fmt(deal.get("warranty"), prefix="$ "))
    fy -= 18
    _field(c, fin_x, fy, col_w - 12, "(−) CHEQUE LÍQUIDO / NET CHECK  ($)", _fmt(deal.get("net_check"), prefix="$ "))

    # TRADE box
    c.rect(trade_x - 4, fin_top - fin_h, col_w, fin_h, fill=0)
    _section_header(c, trade_x - 4, fin_top - 14, col_w, "TRADE-IN  /  TROCA")
    ty = fin_top - 30
    half = (col_w - 24) / 2
    _field(c, trade_x, ty, half - 8, "ANO / YEAR", _fmt(deal.get("trade_year")))
    _field(c, trade_x + half + 4, ty, half - 8, "MARCA / MAKE", _fmt(deal.get("trade_make")))
    ty -= 22
    _field(c, trade_x, ty, half - 8, "MODELO / MODEL", _fmt(deal.get("trade_model")))
    _field(c, trade_x + half + 4, ty, half - 8, "MILHAGEM / MILEAGE", _fmt(deal.get("trade_mileage")))
    ty -= 22
    _field(c, trade_x, ty, col_w - 12, "VIN", _fmt(deal.get("trade_vin")))
    ty -= 18
    _field(c, trade_x, ty, half - 8, "PAYOFF  ($)", _fmt(deal.get("trade_payoff"), prefix="$ "))
    _field(c, trade_x + half + 4, ty, half - 8, "BANCO / BANK", _fmt(deal.get("trade_bank")))
    ty -= 18
    _field(c, trade_x, ty, half - 8, "AVALIAÇÃO / EVALUATION ($)", _fmt(deal.get("trade_evaluation"), prefix="$ "))
    _field(c, trade_x + half + 4, ty, half - 8, "CRÉDITOS / CREDITS ($)", _fmt(deal.get("trade_credits"), prefix="$ "))

    # === Payment terms (full-width row) ========================================
    cursor_y = fin_top - fin_h - 14
    pay_y = cursor_y - 4
    third = (inner_w - 12) / 3
    _field(c, MARGIN + 6, pay_y, third - 8, "(=) ENTRADA / DOWN PAYMENT  ($)", _fmt(deal.get("down_payment"), prefix="$ "), value_size=10)
    # Payment amount + frequency
    pay_x = MARGIN + 6 + third + 4
    _field(c, pay_x, pay_y, third - 8, "PARCELA / PAYMENT  ($)", _fmt(deal.get("payment_amount"), prefix="$ "), value_size=10)
    # Checkboxes
    freq = (deal.get("payment_frequency") or "").lower()
    fbx = pay_x + 90
    _checkbox(c, fbx, pay_y + 17, freq == "weekly", size=7)
    c.setFont("Helvetica", 7)
    c.setFillColor(BRAND_DARK)
    c.drawString(fbx + 10, pay_y + 18, "SEMANAL / WEEKLY")
    _checkbox(c, fbx, pay_y + 8, freq == "monthly", size=7)
    c.drawString(fbx + 10, pay_y + 9, "MENSAL / MONTHLY")
    # Loan period + rate
    pay_x += third + 4
    _field(c, pay_x, pay_y, (third - 8) / 2 - 6, "PRAZO / LOAN  (MESES)", _fmt(deal.get("loan_period_months")))
    _field(c, pay_x + (third - 8) / 2 + 2, pay_y, (third - 8) / 2 - 6, "JUROS / RATE  (%)", _fmt(deal.get("loan_rate"), suffix="%"))

    # ===== DEALER NEGOTIATION =================================================
    cursor_y = pay_y - 18
    dn_h = 130
    _section_header(c, MARGIN + 6, cursor_y - 14, inner_w - 12, "DEAL · NEGOCIAÇÃO DO BALCÃO")
    c.setStrokeColor(BRAND_BORDER)
    c.rect(MARGIN + 6, cursor_y - dn_h, inner_w - 12, dn_h, fill=0)
    # Inner two columns: DEBITS · CREDITS
    half_w = (inner_w - 24) / 2
    dy = cursor_y - 30
    # DEBITS column
    c.setFillColor(BRAND_RED)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(MARGIN + 14, dy + 4, "DÉBITOS  /  DEBITS")
    _field(c, MARGIN + 14, dy - 18, half_w - 16, "ENTRADA / DOWN PAYMENT  ($)", _fmt(deal.get("down_payment"), prefix="$ "))
    _field(c, MARGIN + 14, dy - 36, half_w - 16, "1ª PARCELA / FIRST PAYMENT  ($)", _fmt(deal.get("first_payment"), prefix="$ "))
    _field(c, MARGIN + 14, dy - 54, half_w - 16, "TAX + REG + PLATE + OUTROS  ($)", _fmt(deal.get("tax_reg_plate"), prefix="$ "))
    # Total debits — emphasized
    _field(c, MARGIN + 14, dy - 78, half_w - 16, "TOTAL DÉBITOS / TOTAL DEBITS  ($)", _fmt(deal.get("total_debits"), prefix="$ "), value_size=11)

    # Divider line between DEBITS and CREDITS
    div_x = MARGIN + 14 + half_w
    c.setStrokeColor(BRAND_BORDER)
    c.setLineWidth(0.4)
    c.line(div_x, cursor_y - dn_h + 8, div_x, cursor_y - 18)

    # CREDITS column
    cx = div_x + 8
    c.setFillColor(BRAND_RED)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(cx, dy + 4, "CRÉDITOS  /  CREDITS")
    for i, key in enumerate(["credit_1", "credit_2", "credit_3"]):
        amt = deal.get(key)
        dt = deal.get(f"{key}_date")
        line_y = dy - 18 - i * 18
        _field(c, cx, line_y, half_w - 100, f"VALOR {i+1} / AMOUNT {i+1}  ($)", _fmt(amt, prefix="$ "))
        _field(c, cx + half_w - 96, line_y, 80, f"DATA {i+1} / DATE", _fmt(dt))
    _field(c, cx, dy - 78, half_w - 16, "TOTAL CRÉDITOS / TOTAL CREDITS  ($)", _fmt(deal.get("total_credits"), prefix="$ "), value_size=11)

    # TOTAL BALANCE (highlight bar across the bottom of the DEAL box)
    tb_y = cursor_y - dn_h + 4
    c.setFillColor(BRAND_RED)
    c.rect(MARGIN + 6, tb_y, inner_w - 12, 18, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN + 14, tb_y + 5, "SALDO TOTAL  /  TOTAL BALANCE")
    c.drawRightString(MARGIN + inner_w - 14, tb_y + 5, f"$ {_fmt(deal.get('total_balance')) or '_______________'}")

    # ===== Footer row: Future credits + signatures ============================
    cursor_y = tb_y - 14
    foot_h = 105
    # Left: Future negotiation
    fn_w = (inner_w - 18) / 2
    _section_header(c, MARGIN + 6, cursor_y - 14, fn_w, "FUTURA NEGOCIAÇÃO  /  FUTURE CREDITS")
    c.rect(MARGIN + 6, cursor_y - foot_h, fn_w, foot_h, fill=0)
    fy = cursor_y - 30
    fc = deal.get("future_credits") or [{}] * 4
    for i in range(4):
        item = fc[i] if i < len(fc) else {}
        line_y = fy - i * 18
        _field(c, MARGIN + 14, line_y, fn_w - 100, f"VALOR / AMOUNT  ($)", _fmt(item.get("amount"), prefix="$ "))
        _field(c, MARGIN + 14 + fn_w - 96, line_y, 80, "DATA / DATE", _fmt(item.get("date")))

    # Right: Signatures + notes
    sig_x = MARGIN + 6 + fn_w + 6
    sig_w = (inner_w - 12) - fn_w - 6
    _section_header(c, sig_x, cursor_y - 14, sig_w, "OBSERVAÇÕES + ASSINATURAS")
    c.rect(sig_x, cursor_y - foot_h, sig_w, foot_h, fill=0)
    sy = cursor_y - 30
    _field(c, sig_x + 6, sy, sig_w - 12, "INDICAÇÃO / REFERRAL", _fmt(deal.get("referral")))
    _field(c, sig_x + 6, sy - 18, (sig_w - 18) / 2, "VENDA / SALES", _fmt(deal.get("sales_notes")))
    _field(c, sig_x + 6 + (sig_w - 18) / 2 + 6, sy - 18, (sig_w - 18) / 2, "ENTREGA / DELIVERY", _fmt(deal.get("delivery_notes")))
    _field(c, sig_x + 6, sy - 40, (sig_w - 18) / 2, "ASSINATURA COMPRADOR / BUYER", _fmt(deal.get("buyer_signature_name")), value_size=10)
    _field(c, sig_x + 6 + (sig_w - 18) / 2 + 6, sy - 40, (sig_w - 18) / 2, "ASSINATURA GERENTE / MANAGER", _fmt(deal.get("manager_signature_name")), value_size=10)

    # Bottom strip with the agreement + non-refundable warning
    bx = MARGIN + 6
    by = MARGIN + 6
    c.setFillColor(BRAND_DARK)
    c.rect(bx, by, inner_w - 12, 14, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(bx + 6, by + 3.5, "EU CONCORDO COM A NEGOCIAÇÃO DESTE DOCUMENTO · I AGREE TO THE NEGOTIATION OF THIS DOCUMENT")
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawRightString(bx + inner_w - 18, by + 3.5,
                      "OS DEPÓSITOS NÃO SÃO REEMBOLSÁVEIS · DEPOSITS ARE NON-REFUNDABLE · LOS DEPÓSITOS NO SON REEMBOLSABLES")

    c.showPage()
    c.save()
    return buf.getvalue()


if __name__ == "__main__":
    # Smoke-test: render a sample populated PDF when invoked directly.
    sample = {
        "name": "João Silva",
        "phone": "+1 (555) 123-4567",
        "last_vin_6": "ABC123",
        "year": 2022,
        "make": "Honda",
        "model": "Civic Sport",
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
        "sales_notes": "Combinado entrega Sex 14h",
        "delivery_notes": "Cliente buscará no balcão",
        "buyer_signature_name": "João Silva",
        "manager_signature_name": "Carlos Inter Car",
    }
    out_path = "/tmp/deal_sheet_sample.pdf"
    with open(out_path, "wb") as f:
        f.write(render_deal_sheet(sample))
    print(f"Wrote {out_path}")
