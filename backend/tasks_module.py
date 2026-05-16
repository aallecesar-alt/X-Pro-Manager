"""Task management for the dealership.

Multi-tenant tasks (todos), assigned to staff, optionally linked to a vehicle.
Notifications fire via:
  - In-app push (existing send_push_to_role helper)
  - Email (Resend) — best-effort, non-blocking
Triggered events:
  - on_create   → notify assignees right away
  - 1h before due  → reminder
  - overdue (every 6h until done)  → escalation
"""
from __future__ import annotations

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import resend
from pydantic import BaseModel, Field
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Init Resend at module load. Only configure if a key is present so the
# server still starts in environments without email setup.
RESEND_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
if RESEND_KEY:
    resend.api_key = RESEND_KEY


# ---------- MODELS ----------
class TaskAssignee(BaseModel):
    id: str
    name: str = ""
    email: str = ""


class TaskBase(BaseModel):
    title: str
    description: str = ""
    due_at: Optional[str] = None                  # ISO datetime
    priority: str = "medium"                      # low | medium | high | urgent
    vehicle_id: Optional[str] = None
    vehicle_label: Optional[str] = None           # denormalized "2021 Toyota Camry"
    assignee_ids: List[str] = Field(default_factory=list)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_label: Optional[str] = None
    assignee_ids: Optional[List[str]] = None
    status: Optional[str] = None                  # open | done | canceled


class Task(TaskBase):
    id: str
    dealership_id: str
    status: str = "open"
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    created_by_id: str = ""
    created_by_name: str = ""
    # Reminder bookkeeping so we don't spam
    notified_created: bool = False                # initial notify already sent
    notified_1h: bool = False                     # 1h-before reminder sent
    last_overdue_at: Optional[str] = None         # last time we sent overdue alert


PRIORITY_LABEL = {
    "low": "Baixa",
    "medium": "Média",
    "high": "Alta",
    "urgent": "URGENTE",
}


# ---------- EMAIL HELPER ----------
async def send_email(to: List[str], subject: str, html: str) -> None:
    """Best-effort email send. Never throws — logs failures so the calling
    request still succeeds even when email is misconfigured."""
    if not RESEND_KEY or not to:
        return
    # Resend rejects sends with no recipients
    clean = [e for e in to if e and "@" in e]
    if not clean:
        return
    params = {"from": SENDER_EMAIL, "to": clean, "subject": subject, "html": html}
    try:
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.warning(f"[task-mailer] failed to send to {clean}: {e}")


def render_task_email(*, task: dict, kind: str, store_name: str = "Intercar") -> tuple[str, str]:
    """Returns (subject, html). `kind` ∈ {created, reminder, overdue}."""
    title = task.get("title", "Tarefa")
    desc = task.get("description") or ""
    due = task.get("due_at") or ""
    pri = PRIORITY_LABEL.get(task.get("priority", "medium"), "Média")
    veh = task.get("vehicle_label") or ""

    if kind == "created":
        subj_prefix = "Nova tarefa atribuída"
        intro = "Você recebeu uma nova tarefa:"
        accent = "#B91C1C"
    elif kind == "reminder":
        subj_prefix = "Lembrete · 1h para o prazo"
        intro = "Você tem uma tarefa próxima do prazo (1h):"
        accent = "#D97706"
    else:
        subj_prefix = "Tarefa ATRASADA"
        intro = "Esta tarefa está atrasada e ainda não foi concluída:"
        accent = "#DC2626"

    due_h = ""
    if due:
        try:
            d = datetime.fromisoformat(due.replace("Z", "+00:00"))
            due_h = d.strftime("%d/%m/%Y %H:%M")
        except Exception:
            due_h = due

    subject = f"[{store_name}] {subj_prefix}: {title}"
    html = f"""\
<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:24px">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
      <tr><td style="background:{accent};padding:14px 20px;color:#ffffff;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;font-size:13px">
        {subj_prefix}
      </td></tr>
      <tr><td style="padding:24px 20px;color:#0f172a">
        <p style="margin:0 0 12px 0;color:#475569">{intro}</p>
        <h2 style="margin:0 0 8px 0;font-size:22px;color:#0f172a">{title}</h2>
        {f'<p style="margin:0 0 16px 0;color:#334155;font-size:14px">{desc}</p>' if desc else ''}
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#334155">
          {f'<tr><td style="padding:6px 0;color:#94a3b8">Prazo</td><td style="padding:6px 0;text-align:right;font-weight:600">{due_h}</td></tr>' if due_h else ''}
          <tr><td style="padding:6px 0;color:#94a3b8">Prioridade</td><td style="padding:6px 0;text-align:right;font-weight:600">{pri}</td></tr>
          {f'<tr><td style="padding:6px 0;color:#94a3b8">Veículo</td><td style="padding:6px 0;text-align:right">{veh}</td></tr>' if veh else ''}
        </table>
        <p style="margin:24px 0 0 0;color:#94a3b8;font-size:12px">— {store_name} Manager</p>
      </td></tr>
    </table>
  </td></tr>
</table>"""
    return subject, html


# ---------- REMINDER LOOP ----------
async def run_reminder_pass(db) -> dict:
    """Single reminder pass — call this from a scheduler. Sends:
    - 1h-before-due reminders to assignees that haven't been notified yet
    - overdue alerts every 6h until the task is closed
    Idempotent via the notified_1h / last_overdue_at flags on the task.
    """
    now = datetime.now(timezone.utc)
    sent_1h = 0
    sent_overdue = 0

    # Fetch all open tasks with a due date
    cursor = db.tasks.find(
        {"status": "open", "due_at": {"$nin": [None, ""]}}, {"_id": 0}
    )
    async for task in cursor:
        try:
            due = datetime.fromisoformat(task["due_at"].replace("Z", "+00:00"))
        except Exception:
            continue

        # Resolve assignee emails
        emails = await _resolve_assignee_emails(db, task)
        if not emails:
            continue
        store = await _store_name(db, task["dealership_id"])

        # 1h before reminder
        if not task.get("notified_1h"):
            delta = (due - now).total_seconds()
            if 0 < delta <= 3600:
                subj, html = render_task_email(task=task, kind="reminder", store_name=store)
                await send_email(emails, subj, html)
                await db.tasks.update_one({"id": task["id"]}, {"$set": {"notified_1h": True}})
                sent_1h += 1
                continue

        # Overdue: send if past due, not done, and we haven't sent in last 6h
        if due < now:
            last = task.get("last_overdue_at")
            send_now = True
            if last:
                try:
                    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    send_now = (now - last_dt) > timedelta(hours=6)
                except Exception:
                    pass
            if send_now:
                subj, html = render_task_email(task=task, kind="overdue", store_name=store)
                await send_email(emails, subj, html)
                await db.tasks.update_one(
                    {"id": task["id"]},
                    {"$set": {"last_overdue_at": now.isoformat()}},
                )
                sent_overdue += 1

    return {"sent_1h": sent_1h, "sent_overdue": sent_overdue}


async def _resolve_assignee_emails(db, task: dict) -> List[str]:
    ids = task.get("assignee_ids") or []
    if not ids:
        return []
    cur = db.users.find({"id": {"$in": ids}}, {"_id": 0, "email": 1})
    out = []
    async for u in cur:
        if u.get("email"):
            out.append(u["email"])
    return out


async def _store_name(db, dealership_id: str) -> str:
    d = await db.dealerships.find_one({"id": dealership_id}, {"_id": 0, "name": 1})
    return (d or {}).get("name") or "Intercar"
