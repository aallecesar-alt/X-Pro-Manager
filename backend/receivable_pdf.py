"""Generates a payment-schedule PDF for a Receivable (installment plan).

Given a receivable doc from MongoDB, builds a clean, printable A4/Letter document
the dealership can hand to the customer with all installment dates, amounts and
running balance. Includes a signature area at the bottom.

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

INK = colors.HexColor("#0F0F10")
GREY = colors.HexColor("#6B6B6B")
LINE = colors.HexColor("#D5D5D5")
BRAND_RED = colors.HexColor("#B91C1C")
BAND_BG = colors.HexColor("#0F0F10")
ROW_ALT = colors.HexColor("#F8F8F8")
PAID_BG = colors.HexColor("#EAF6EE")
OVERDUE_BG = colors.HexColor("#FDECEC")

DEFAULT_STORE = {
    "address": "[ STORE ADDRESS ]",
    "phone": "[ PHONE ]",
    "email": "[ EMAIL ]",
    "website": "[ WEBSITE / INSTAGRAM ]",
}

FREQ_LABEL = {"weekly": "Weekly", "biweekly": "Bi-weekly", "monthly": "Monthly"}


def _fmt_money(v) -> str:
    if v is None:
        return ""
    return f"$ {float(v):,.2f}"


def _fmt_date(s: Optional[str]) -> str:
    if not s:
        return "—"
    try:
        y, m, d = s.split("-")
        return f"{m}/{d}/{y}"
    except Exception:
        return s


def render_receivable_schedule(receivable: dict, store: Optional[dict] = None) -> bytes:
    rec = receivable or {}
    store = {**DEFAULT_STORE, **(store or {})}
    veh = rec.get("vehicle") or {}
    installments = rec.get("installments") or []

    today = datetime.now().strftime("%Y-%m-%d")

    buf = io.BytesIO()
    PW, PH = LETTER
    c = pdfcanvas.Canvas(buf, pagesize=LETTER)
    c.setTitle(f"Payment Schedule — {rec.get('customer_name', '')}")

    MARGIN = 0.5 * inch
    inner_w = PW - 2 * MARGIN

    # Outer thin border
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)

    # ===== HEADER: logo + brand left · contact right =========================
    HEADER_H = 70
    htop = PH - MARGIN - 6

    logo_h = 46
    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(
                LOGO_PATH,
                MARGIN + 10,
                htop - logo_h - 6,
                width=logo_h,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    brand_x = MARGIN + 10 + logo_h + 10
    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(INK)
    c.drawString(brand_x, htop - 24, "INTERCAR")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(GREY)
    c.drawString(brand_x, htop - 36, "AUTO SALES")

    cx_right = MARGIN + inner_w - 8
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawRightString(cx_right, htop - 14, "ADDRESS")
    c.setFont("Helvetica", 8)
    c.setFillColor(INK)
    c.drawRightString(cx_right, htop - 24, store["address"])
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(GREY)
    c.drawRightString(cx_right, htop - 36, "PHONE · EMAIL · WEB")
    c.setFont("Helvetica", 8)
    c.setFillColor(INK)
    c.drawRightString(cx_right, htop - 46, f"{store['phone']} · {store['email']}")
    c.drawRightString(cx_right, htop - 56, store["website"])

    # Red accent line
    c.setStrokeColor(BRAND_RED)
    c.setLineWidth(2)
    c.line(MARGIN + 8, htop - HEADER_H, MARGIN + inner_w - 8, htop - HEADER_H)

    # ===== Title =============================================================
    cy = htop - HEADER_H - 20
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(INK)
    c.drawString(MARGIN + 10, cy, "PAYMENT SCHEDULE")
    c.setFont("Helvetica", 9)
    c.setFillColor(GREY)
    c.drawRightString(MARGIN + inner_w - 10, cy, f"Issued: {datetime.now().strftime('%m/%d/%Y')}")

    # ===== Customer / Vehicle / Plan summary box ==============================
    cy -= 12
    box_h = 110
    c.setFillColor(colors.HexColor("#FAFAFA"))
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.rect(MARGIN + 8, cy - box_h, inner_w - 16, box_h, fill=1, stroke=1)

    pad_x = MARGIN + 20
    pad_w = inner_w - 40

    def label(c, x, y, txt):
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(GREY)
        c.drawString(x, y, txt.upper())

    def value(c, x, y, txt, size=10, bold=False):
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        c.setFillColor(INK)
        c.drawString(x, y, str(txt) if txt is not None else "—")

    # Row 1: Customer + Phone
    y_row = cy - 18
    label(c, pad_x, y_row, "CUSTOMER")
    value(c, pad_x, y_row - 13, rec.get("customer_name") or "—", size=12, bold=True)
    label(c, pad_x + pad_w * 0.55, y_row, "PHONE")
    value(c, pad_x + pad_w * 0.55, y_row - 13, rec.get("customer_phone") or "—", size=11)

    # Divider
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(pad_x, y_row - 24, pad_x + pad_w, y_row - 24)

    # Row 2: Vehicle (if any)
    y_row -= 32
    label(c, pad_x, y_row, "VEHICLE")
    if veh:
        veh_text = f"{veh.get('year','')} {veh.get('make','')} {veh.get('model','')}".strip()
        if veh.get("vin"):
            veh_text += f"   ·   VIN {veh.get('vin')}"
    else:
        veh_text = "Walk-in customer (no vehicle attached)"
    value(c, pad_x, y_row - 13, veh_text, size=10)

    # Divider
    c.setStrokeColor(LINE)
    c.line(pad_x, y_row - 24, pad_x + pad_w, y_row - 24)

    # Row 3: KPI cards — Total · Installments · Frequency · First due
    y_row -= 38
    kpi_w = pad_w / 4
    total = rec.get("total_amount") or 0
    inst_amt = rec.get("installment_amount") or 0
    cnt = rec.get("installment_count") or len(installments)
    freq_label = FREQ_LABEL.get((rec.get("frequency") or "").lower(), rec.get("frequency") or "—")
    first_due = installments[0]["due_date"] if installments else (rec.get("start_date") or "")

    def kpi(x, lbl, val):
        label(c, x, y_row + 14, lbl)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(INK)
        c.drawString(x, y_row, val)

    kpi(pad_x, "TOTAL FINANCED", _fmt_money(total))
    kpi(pad_x + kpi_w, "INSTALLMENTS", f"{cnt} × {_fmt_money(inst_amt)}")
    kpi(pad_x + kpi_w * 2, "FREQUENCY", freq_label)
    kpi(pad_x + kpi_w * 3, "FIRST DUE DATE", _fmt_date(first_due))

    cy -= box_h + 16

    # ===== Schedule table ====================================================
    # Header band
    c.setFillColor(BAND_BG)
    c.rect(MARGIN + 8, cy - 16, inner_w - 16, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8)

    col_x = MARGIN + 18
    col_widths = [
        ("#", 30),
        ("DUE DATE", 80),
        ("AMOUNT", 80),
        ("STATUS", 80),
        ("PAID ON", 80),
        ("REMAINING BALANCE", 100),
        ("CUSTOMER SIGNATURE", inner_w - 16 - 30 - 80 - 80 - 80 - 80 - 100 - 8),
    ]
    cx = col_x
    for hdr, w in col_widths:
        c.drawString(cx, cy - 11, hdr)
        cx += w

    cy -= 16

    # Body rows — paginate at 28 rows per page
    rows_per_page = 28
    row_h = 22
    remaining = total

    def draw_row(idx, ins, y, page_idx):
        nonlocal remaining
        bg = ROW_ALT if idx % 2 == 0 else colors.white
        # status-aware background tint
        is_paid = ins.get("status") == "paid"
        is_overdue = (not is_paid) and ins.get("due_date") and ins["due_date"] < today
        if is_paid:
            bg = PAID_BG
        elif is_overdue:
            bg = OVERDUE_BG
        c.setFillColor(bg)
        c.rect(MARGIN + 8, y - row_h + 4, inner_w - 16, row_h, fill=1, stroke=0)

        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        cx = col_x
        # #
        c.drawString(cx, y - 11, str(ins.get("number") or idx + 1))
        cx += col_widths[0][1]
        # Due Date
        c.drawString(cx, y - 11, _fmt_date(ins.get("due_date")))
        cx += col_widths[1][1]
        # Amount
        c.drawString(cx, y - 11, _fmt_money(ins.get("amount") or 0))
        cx += col_widths[2][1]
        # Status badge
        if is_paid:
            c.setFillColor(colors.HexColor("#0E7C3A"))
            c.setFont("Helvetica-Bold", 8)
            c.drawString(cx, y - 11, "PAID")
        elif is_overdue:
            c.setFillColor(BRAND_RED)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(cx, y - 11, "OVERDUE")
        else:
            c.setFillColor(GREY)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(cx, y - 11, "PENDING")
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        cx += col_widths[3][1]
        # Paid on
        c.drawString(cx, y - 11, _fmt_date(ins.get("paid_at")))
        cx += col_widths[4][1]
        # Remaining balance (running)
        if is_paid:
            paid_amt = float(ins.get("paid_amount") or ins.get("amount") or 0)
        else:
            paid_amt = 0
        remaining -= float(ins.get("amount") or 0)
        # Show the post-row balance
        c.drawString(cx, y - 11, _fmt_money(max(remaining, 0)))
        cx += col_widths[5][1]
        # Signature line
        c.setStrokeColor(LINE)
        c.setLineWidth(0.4)
        c.line(cx, y - row_h + 7, cx + col_widths[6][1] - 6, y - row_h + 7)

        # Horizontal divider
        c.setStrokeColor(LINE)
        c.setLineWidth(0.3)
        c.line(MARGIN + 8, y - row_h + 4, MARGIN + inner_w - 8, y - row_h + 4)

    page_idx = 0
    for i, ins in enumerate(installments):
        if i > 0 and i % rows_per_page == 0:
            # Footer + new page
            _draw_footer(c, MARGIN, inner_w, rec)
            c.showPage()
            page_idx += 1
            # New page header (simpler)
            cy = PH - MARGIN - 30
            c.setStrokeColor(INK)
            c.setLineWidth(0.6)
            c.rect(MARGIN, MARGIN, inner_w, PH - 2 * MARGIN, fill=0)
            c.setFont("Helvetica-Bold", 12)
            c.setFillColor(INK)
            c.drawString(MARGIN + 10, cy, f"PAYMENT SCHEDULE  ·  {rec.get('customer_name','')}  ·  Page {page_idx + 1}")
            cy -= 16
            # Re-draw column header
            c.setFillColor(BAND_BG)
            c.rect(MARGIN + 8, cy - 16, inner_w - 16, 16, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8)
            cxh = col_x
            for hdr, w in col_widths:
                c.drawString(cxh, cy - 11, hdr)
                cxh += w
            cy -= 16
        draw_row(i, ins, cy, page_idx)
        cy -= row_h

    # Totals row (only on last page after the schedule)
    cy -= 6
    c.setFillColor(BAND_BG)
    c.rect(MARGIN + 8, cy - 22, inner_w - 16, 22, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    paid_total = sum(float(i.get("paid_amount") or 0) for i in installments if i.get("status") == "paid")
    rem_total = sum(float(i.get("amount") or 0) for i in installments if i.get("status") != "paid")
    c.drawString(MARGIN + 18, cy - 14, f"TOTAL  ·  PAID  $ {paid_total:,.2f}   ·   REMAINING  $ {rem_total:,.2f}")
    c.drawRightString(MARGIN + inner_w - 18, cy - 14, f"GRAND TOTAL  $ {total:,.2f}")

    cy -= 32

    # Notes
    if rec.get("notes"):
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(GREY)
        c.drawString(MARGIN + 10, cy, "NOTES")
        c.setFont("Helvetica", 9)
        c.setFillColor(INK)
        c.drawString(MARGIN + 10, cy - 12, str(rec.get("notes")))
        cy -= 30

    # Signatures area
    _draw_signatures(c, MARGIN, inner_w, cy)

    _draw_footer(c, MARGIN, inner_w, rec)
    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_signatures(c, margin, inner_w, y):
    """Two-column signature lines."""
    if y < margin + 90:
        return  # not enough room — silently skip; user can add a 2nd page if needed
    half = (inner_w - 40) / 2
    # Buyer
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(margin + 16, y - 30, margin + 16 + half, y - 30)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(GREY)
    c.drawString(margin + 16, y - 42, "CUSTOMER SIGNATURE")
    # Manager
    c.line(margin + 16 + half + 16, y - 30, margin + inner_w - 16, y - 30)
    c.drawString(margin + 16 + half + 16, y - 42, "INTERCAR AUTHORIZED SIGNATURE")


def _draw_footer(c, margin, inner_w, rec):
    fy = margin + 6
    c.setFillColor(BAND_BG)
    c.rect(margin + 8, fy, inner_w - 16, 16, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(margin + 18, fy + 5, "I ACKNOWLEDGE THE PAYMENT SCHEDULE ABOVE.")
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawRightString(margin + inner_w - 18, fy + 5,
                      "MISSED PAYMENTS MAY INCUR LATE FEES · $30 PER RETURNED CHECK · DEPOSITS NON-REFUNDABLE")


if __name__ == "__main__":
    sample = {
        "customer_name": "John Smith",
        "customer_phone": "+1 (555) 123-4567",
        "total_amount": 3000,
        "installment_amount": 300,
        "installment_count": 10,
        "frequency": "weekly",
        "start_date": "2026-05-15",
        "notes": "Pagamento toda sexta-feira, em dinheiro ou cheque.",
        "vehicle": {"year": 2022, "make": "Honda", "model": "Civic", "vin": "1HGBH41JXMN109186"},
        "installments": [
            {"number": i + 1, "due_date": f"2026-05-{15 + 7*i:02d}" if 15 + 7*i <= 31 else f"2026-06-{15+7*i-31:02d}",
             "amount": 300, "status": "pending", "paid_at": None, "paid_amount": 0}
            for i in range(10)
        ],
    }
    # Mark first 2 as paid
    sample["installments"][0]["status"] = "paid"
    sample["installments"][0]["paid_at"] = "2026-05-15"
    sample["installments"][0]["paid_amount"] = 300
    sample["installments"][1]["status"] = "paid"
    sample["installments"][1]["paid_at"] = "2026-05-22"
    sample["installments"][1]["paid_amount"] = 300

    with open("/tmp/recv_schedule_sample.pdf", "wb") as f:
        f.write(render_receivable_schedule(sample))
    print("Wrote /tmp/recv_schedule_sample.pdf")
