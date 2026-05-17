"""Bilingual (PT/EN) weekly payroll receipt PDF.

Shows:
- Dealership header (logo + address)
- Salesperson name + period
- Funded cars table (year/make/model · VIN tail · sold price · commission)
- Totals: salary + commissions + bonus = TOTAL
- Owner's electronic signature (image or data-url)
- Empty line for the salesperson's signature
"""
from __future__ import annotations

import io
import os
import base64
from datetime import datetime
from typing import Optional

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


def _money(n) -> str:
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


def _load_remote_image(url: str):
    if not url:
        return None
    try:
        r = requests.get(url, timeout=8)
        if r.status_code == 200:
            return ImageReader(io.BytesIO(r.content))
    except Exception:
        return None
    return None


def _load_signature(sig_url: Optional[str], sig_data_url: Optional[str]):
    """Prefer remote (Cloudinary) signature; fall back to data URL."""
    if sig_url and sig_url.startswith("http"):
        img = _load_remote_image(sig_url)
        if img:
            return img
    if sig_data_url and sig_data_url.startswith("data:"):
        try:
            _, b64 = sig_data_url.split(",", 1)
            return ImageReader(io.BytesIO(base64.b64decode(b64)))
        except Exception:
            return None
    return None


def render_payroll_receipt(
    *,
    salesperson: dict,
    period_start: str,
    period_end: str,
    cars: list,
    salary: float,
    bonus: float,
    store: Optional[dict] = None,
    owner_name: str = "",
) -> bytes:
    """Render bilingual weekly payroll receipt as raw PDF bytes."""
    store = store or {}
    dealer_name = (store.get("name") or "INTERCAR AUTO SALES").upper()

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    w, h = LETTER
    margin = 0.6 * inch
    y = h - margin

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
    y -= 80

    # ---------- TITLE STRIPE (bilingual) ----------
    c.setFillColor(BRAND_RED)
    c.rect(margin, y - 44, w - 2 * margin, 44, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin + 14, y - 22, "WEEKLY PAYROLL RECEIPT")
    c.setFont("Helvetica", 10)
    c.drawString(margin + 14, y - 36, "Recibo de Pagamento Semanal")
    c.setFont("Helvetica", 9)
    c.drawRightString(w - margin - 12, y - 16, f"Period · Período")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(w - margin - 12, y - 30, f"{_fmt_date(period_start)} → {_fmt_date(period_end)}")
    y -= 60

    # ---------- SALESPERSON CARD ----------
    card_h = 60
    c.setFillColor(SOFT)
    c.roundRect(margin, y - card_h, w - 2 * margin, card_h, 6, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.roundRect(margin, y - card_h, w - 2 * margin, card_h, 6, fill=0, stroke=1)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin + 12, y - 14, "PAID TO · PAGO A")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin + 12, y - 32, (salesperson.get("name") or "—")[:50])
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    contact_bits = []
    if salesperson.get("phone"): contact_bits.append(salesperson["phone"])
    if salesperson.get("email"): contact_bits.append(salesperson["email"])
    if contact_bits:
        c.drawString(margin + 12, y - 48, "  ·  ".join(contact_bits))
    # Date issued (right side)
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(w - margin - 12, y - 14, "ISSUED ON · EMITIDO EM")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(w - margin - 12, y - 30, datetime.utcnow().strftime("%m/%d/%Y"))
    y -= card_h + 18

    # ---------- CARS TABLE ----------
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin, y, f"FUNDED CARS · CARROS QUITADOS ({len(cars)})")
    y -= 6
    c.setStrokeColor(LINE)
    c.line(margin, y, w - margin, y)
    y -= 14

    # Column positions
    cols = {
        "vehicle": margin + 4,
        "vin":     margin + 230,
        "funded":  margin + 320,
        "sold":    margin + 380,
        "comm":    w - margin - 4,
    }
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(cols["vehicle"], y, "VEHICLE")
    c.drawString(cols["vin"],     y, "VIN")
    c.drawString(cols["funded"],  y, "FUNDED")
    c.drawString(cols["sold"],    y, "SOLD PRICE")
    c.drawRightString(cols["comm"], y, "COMMISSION")
    y -= 6
    c.line(margin, y, w - margin, y)
    y -= 12

    commission_total = 0.0
    for car in cars:
        if y < margin + 220:  # rough page break
            c.showPage()
            y = h - margin
        comm = float(car.get("commission_amount") or 0)
        commission_total += comm
        c.setFillColor(INK)
        c.setFont("Helvetica", 9.5)
        label = f"{car.get('year','')} {car.get('make','')} {car.get('model','')}".strip()
        c.drawString(cols["vehicle"], y, label[:42])
        c.setFont("Helvetica", 8.5)
        c.setFillColor(GREY)
        vin = (car.get("vin") or "")[-6:].upper() if car.get("vin") else "—"
        c.drawString(cols["vin"], y, vin)
        c.drawString(cols["funded"], y, _fmt_date(car.get("funded_at") or ""))
        c.setFillColor(INK)
        c.setFont("Helvetica", 9.5)
        c.drawString(cols["sold"], y, _money(car.get("sold_price")))
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(GREEN)
        c.drawRightString(cols["comm"], y, _money(comm))
        y -= 16
        c.setStrokeColor(colors.HexColor("#EEEEEE"))
        c.line(margin, y + 4, w - margin, y + 4)

    if not cars:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(margin, y, "No funded cars in this period · Nenhum carro funded no período.")
        y -= 14

    # ---------- TOTALS BOX ----------
    y -= 12
    box_h = 90
    c.setFillColor(LIGHT_GREY)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.rect(margin, y - box_h, w - 2 * margin, box_h, fill=0, stroke=1)

    lines = [
        ("BASE SALARY · SALÁRIO BASE", salary),
        (f"COMMISSIONS ({len(cars)}) · COMISSÕES", commission_total),
        ("BONUS · BÔNUS", bonus),
    ]
    line_y = y - 20
    for lbl, val in lines:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(margin + 14, line_y, lbl)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(w - margin - 14, line_y, _money(val))
        line_y -= 16

    # Final total
    total = float(salary or 0) + commission_total + float(bonus or 0)
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(1)
    c.line(margin + 14, line_y + 8, w - margin - 14, line_y + 8)
    c.setFillColor(BRAND_RED)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin + 14, line_y - 4, "TOTAL TO PAY · TOTAL A PAGAR")
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(w - margin - 14, line_y - 4, _money(total))

    y -= box_h + 30

    # ---------- LEGAL ----------
    c.setFillColor(GREY)
    c.setFont("Helvetica-Oblique", 8)
    legal = ("By signing below, the salesperson acknowledges receipt of the amount above as full payment "
             "for the period indicated. — Ao assinar abaixo, o vendedor declara ter recebido o valor "
             "acima como pagamento integral do período indicado.")
    words = legal.split()
    cur, lines_t = "", []
    for w_ in words:
        if c.stringWidth(cur + " " + w_, "Helvetica-Oblique", 8) < w - 2 * margin:
            cur = (cur + " " + w_).strip()
        else:
            lines_t.append(cur); cur = w_
    if cur:
        lines_t.append(cur)
    for ln in lines_t[:3]:
        c.drawString(margin, y, ln); y -= 11
    y -= 12

    # ---------- SIGNATURES ----------
    sig_w = (w - 2 * margin - 30) / 2

    # Salesperson signature line (left)
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    c.line(margin, y - 30, margin + sig_w, y - 30)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(margin, y - 42, "Salesperson Signature · Assinatura do Vendedor")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y - 54, salesperson.get("name", ""))

    # Owner electronic signature (right)
    sig_img = _load_signature(store.get("signature_url"), store.get("signature_data_url"))
    sig_x = margin + sig_w + 30
    if sig_img:
        try:
            c.drawImage(sig_img, sig_x, y - 50, width=sig_w, height=45,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    c.line(sig_x, y - 30, sig_x + sig_w, y - 30)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(sig_x, y - 42, "Authorized Signature · Assinatura Autorizada")
    if owner_name:
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(sig_x, y - 54, owner_name)

    # Footer
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, margin / 2,
                        f"{dealer_name} · {store.get('website','')} · Electronically generated document")

    c.showPage()
    c.save()
    return buf.getvalue()
