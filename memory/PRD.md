# Inter Car · Auto Manager — PRD

## Original Problem Statement
User has a car dealership management app on Lovable (Auto Manager). Wanted improvements + integration with their public website `intercarautosales.com`. After clarification: build the same type of management app (NOT a public showcase) here on Emergent, with extra features.

## Architecture
- Backend: FastAPI + Motor + MongoDB · JWT auth · multi-tenant per `dealership_id`
- Frontend: React 19 + Tailwind + Outfit/Manrope · single-page dashboard
- i18n: PT/EN/ES (in-memory, persisted in localStorage)
- Theme: Premium dark (#0A0A0A) + signal red (#D92D20)
- File storage: base64 inside MongoDB (8MB per file limit)

## Implemented (Jan 2026)

### Auth & Account
- Signup with multi-tenant dealership creation, Login/Logout
- JWT 30-day token in localStorage
- Each dealership isolated by `dealership_id`
- **Roles** (Feb 2026): `owner` (full access) and `salesperson` (restricted view)
  - Owner creates salesperson logins via `POST /api/salespeople/{sid}/credentials`
  - Salesperson sees: inventory (no purchase price), pipeline, delivery, ONLY their own sales
  - Salesperson cannot see: purchase_price, expenses, total_revenue, total_profit, invested, avg_ticket, settings, other people's sales
  - Salesperson cannot: add/delete vehicles, import URL, regenerate API token, manage salespeople
  - When salesperson marks a vehicle as sold, the system auto-assigns them as the seller and snapshots their commission_amount

### Inventory
- Vehicle CRUD with: Make, Model, Year, Color, **VIN Number**, Transmission, Fuel
- **Removed fields**: Plate, Mileage (per user request)
- **Removed**: "Lucro por veículo" preview (per user request)
- Purchase price / Expenses / Sale price
- Description, Photos (URLs)
- **Import from URL** button — scrapes any URL using `og:image`, `og:title`, etc. and pre-fills form (e.g. paste a URL from intercarautosales.com → auto-import photo + title + price)

### Sales pipeline (3-column kanban)
- in_stock → reserved → sold
- Buyer name/phone, payment method, bank name, sold_price

### Delivery pipeline (8 steps, one per car)
1. **Vendido** (auto-set when status=sold)
2. **Ficha de negociação + Bill of sale**
3. **Garantia estendida**
4. **Manutenção**
5. **Seguro**
6. **Título recebido**
7. **Registro**
8. **Entregue** (auto-stamps `delivered_at`)

Per-car features:
- Photo of the car shown on the delivery card (128×96)
- Visual stepper with checkmarks + colored circles (red→pink→purple→blue→green)
- "Advance step" red arrow button
- "Edit step" modal (jump to any step + bank name)
- "Notes" modal (general delivery notes)
- **Per-step file upload + per-step notes** (clicking on any step circle 1–8):
  - Notes textarea (e.g. customer-requested repairs in step 4)
  - Multiple file upload (Bill of sale, contracts, photos) up to 8MB each
  - Image preview, download, delete
  - Badge on step circle: red number = file count, yellow dot = has notes
- **Step 8 (Delivered)** is special:
  - Modal title becomes "Fotos da entrega" with hint about uploading photos at delivery time
  - Inline gallery preview on the delivery card showing thumbnails of step-8 photos

### Dashboard
- 8 KPI cards: total/in-stock/reserved/sold, invested, revenue, profit, avg ticket
- Monthly performance bar chart (last 6 months)

### Multi-language
- PT 🇧🇷 / EN 🇺🇸 / ES 🇪🇸 — every label translated
- Switcher in sidebar + on auth page

### Public API for external sites
- `GET /api/public/inventory?token=<api_token>`
- Returns vehicles (status != sold), strips internal financial fields (purchase_price, expenses, buyer info)
- Token visible in Settings tab, regenerable
- For integration with `intercarautosales.com` etc.

### Financial dashboard (owner only · Feb 2026)
- New "Financeiro" sidebar tab (hidden from salespeople)
- **Painel/Overview now shows ONLY counts** — no Receita/Lucro/Investido/Ticket
- Month/year selector
- 4 KPI cards: **Lucro dos carros · Despesas operacionais · Comissões pagas · Lucro líquido**
- Cars sold this month with per-vehicle profit
- **Operational expenses CRUD** (water, electricity, rent, salaries, etc.)
  - Categories: rent, water, electricity, internet, phone, salary, marketing, maintenance, taxes, other
  - Manual monthly entry (values vary, no recurrence)
  - Optional Cloudinary attachment for receipts
- 6-month net-profit bar chart
- Closing formula: `gross_profit − operational_expenses − paid_commissions = net_profit`
- Endpoints: `GET /api/financial/closing?year=&month=`, `GET /api/financial/monthly?months=6`, `GET/POST/PUT/DELETE /api/expenses`

### Team Settings improvements (Feb 2026)
- **Photo + Name side-by-side** in the Add/Edit Team Member form (Monday-style avatar picker).
- **Four roles** alongside Owner: Vendedor (red, trophy icon), BDC (cyan, headphones), Gerente (amber, crown), Geral (emerald, wrench — for yard / parts / maintenance staff). Both Gerente and Geral start with empty permissions — owner grants tab access case-by-case.
- 2×2 grid role picker with icons in the Add Team Member modal.
- Backend: `POST /api/team` accepts optional `photo_url`/`photo_public_id` and validates `role in {salesperson, bdc, gerente, geral}`. `GET/DELETE /api/team` accept all four roles.

### Stuck-delivery alerts (Feb 2026)
- Backend tracks `delivery_step_updated_at` on every step change; `GET /api/delivery` returns `days_in_step` + `stuck_alert` (>=45 days, step <8).
- New endpoint `GET /api/delivery/alerts?days=45` (owner/gerente only — 403 for salesperson/BDC).
- Frontend (owner + gerente only):
  - Sidebar badge (red, glowing) next to "Esteira de Entrega" with the count of stuck cars.
  - Banner at the top of the Delivery tab with "X carros parados há mais de 45 dias" + toggle "Ver só os parados".
  - Each stuck car card highlighted with red border and chip "⚠ Parado há N dias".

### Inventory advanced filters (Feb 9 2026)
- Inventory tab now has 3 dropdowns next to the search bar: **Marca**, **Modelo** (dependent on selected Marca), **Carroceria** (8 fixed options always visible).
- Marca dropdown auto-populated from current stock; Modelo cascades on Marca; Carroceria always shows the 8 canonical options.
- Inventory display sorted alphabetically by Make, then Model.
- Active-filter chips with one-click remove + "limpar filtros" button.
- New **Carroceria** selector in Add/Edit Vehicle form with 8 options: Sedan · SUV · Truck · Coupe · Hatch · Convertible · Wagon · Van.
- Backend `GET /api/vehicles` now accepts optional `make`, `model`, `body_type` query params (case-insensitive exact match).
- Translations added in PT/EN/ES (`filter_all_makes`, `filter_all_models`, `filter_all_bodies`, `active_filters`, `clear_filters`).

### Pós-Vendas (Post-Sales) tab (Feb 9 2026)
- New sidebar tab "Pós-Vendas" (ShieldCheck icon) — accessible to owner, gerente, and geral roles by default.
- Workflow: customer brings a car back → enter VIN → system auto-finds the vehicle and pre-fills make/model/year/customer/phone (or allow manual entry if VIN doesn't match).
- 3-step status flow: **Aberto → Em andamento → Concluído**. Advance arrow on each card. When status flips to "Concluído", `exit_date` auto-stamps if empty.
- Each repair tracks: VIN, vehicle_id (link to original sale), make/model/year, customer name+phone, problem, work_to_do, cost, technician, entry/exit dates, notes, status.
- Cost mirrors automatically into the linked vehicle's `expense_items` (category="post_sale") so Financial dashboard counts it without duplicates. Mirror is removed on delete or when cost/vehicle changes.
- Summary cards: Em aberto / Concluídos / Total de reparos / Custo total.
- Filters: search box + 4 status pills (Todos / Aberto / Em andamento / Concluído) with live counts.
- New endpoints: `GET /api/post-sales`, `GET /api/post-sales/lookup-vin?vin=...`, `POST /api/post-sales`, `PUT /api/post-sales/{id}`, `DELETE /api/post-sales/{id}`.
- New permission `post_sales` added to `ALL_TAB_PERMISSIONS`. Default role mapping: owner=all, geral=[post_sales], gerente=opt-in via Settings.
- New collection: `post_sales`.
- 9 pytest tests cover RBAC, VIN lookup (found/not_found/case-insensitive), full CRUD lifecycle, mirror expense sync, invalid status rejection, manual entry without vehicle_id.
- Maintenance tab REMOVED in favor of Pós-Vendas (per user request); maintenance permission removed from system. Old expense_items with category="maintenance" still appear in vehicle history & Financial.

### Internal Team Chat (Feb 9 2026)
- Floating button bottom-right of every screen → opens 380×560 chat panel (Messenger-style).
- Two room types per dealership:
  - **Team** room: group chat seen by everyone in the dealership.
  - **DM** rooms: 1-on-1 between two users (room_id `dm:{idA}_{idB}` with sorted ids — automatic & idempotent).
- All authenticated users (owner / gerente / salesperson / bdc / geral) can use chat.
- Features:
  - Unread badge with count on the floating button (red, pulsing) + per-room badges in the list.
  - Online indicator (green dot) using `chat_last_seen` heartbeat updated on every chat API call. Considered online if seen within 120s.
  - Attachments via Cloudinary signed upload (`chat/{dealership_id}/` folder, max 8MB). Image preview inline; non-images shown as link with paperclip.
  - Edit/delete own messages (owner can also delete anyone's). Soft delete leaves "mensagem excluída" marker visible to all.
  - Relative timestamps ("agora", "5 min", "2 h", date for older).
  - Read receipts via `chat_reads` collection: marking a room read writes `last_read_at` for that user; unread = messages newer than last_read AND not from me.
- Polling: 5s for active room messages, 30s for users + unread. Each call double-acts as a heartbeat to keep online dot fresh.
- New endpoints: `GET /api/chat/users`, `GET/POST /api/chat/messages`, `PUT/DELETE /api/chat/messages/{id}`, `GET /api/chat/unread`, `POST /api/chat/read`. Cloudinary signature endpoint extended to allow `chat/` folder.
- New collections: `chat_messages`, `chat_reads`. New user field: `chat_last_seen`.
- 6 pytest tests cover user list + heartbeat presence, send/list/edit/delete with permission checks, DM membership enforcement, unread tracking + mark-read.

### Receivables / Cobranças (Feb 9 2026)
- New sidebar tab "Recebíveis" (HandCoins icon) — accessible to owner; opt-in for other roles via Settings.
- Always linked to a sold/in-stock vehicle. On vehicle pick the form auto-fills `customer_name` + `customer_phone` from the vehicle's buyer fields.
- Three frequencies: **weekly / biweekly / monthly**. Auto-generates the full installment schedule (1–240 installments) with computed due_dates.
- Auto-computes `installment_amount = total / count` while typing in the create form. Shows a 4-installment preview in the modal.
- Each receivable card shows: customer, vehicle thumb+make+model, frequency, progress bar (paid vs total), counts, and overdue flag.
- Expandable installment table with **Marcar pago / Desfazer** buttons per row. Auto-completes the receivable when all paid; reopens it on undo.
- KPI bar at the top: Total a receber · Atrasadas · Vence Hoje · Recebido no mês.
- Reminder panel split in 3 columns: Atrasadas · Vence Hoje · Próximos 7 dias (with one-click "pay" button).
- Filter pills: Ativo / Quitado / Todos.
- Dashboard / Painel summary card "A receber" (clickable → goes to Recebíveis) showing total + overdue + due today + received this month.
- Sidebar badge (red, pulsing) on the Recebíveis nav with `overdue + due_today` count.
- Endpoints: `GET/POST /api/receivables`, `GET /api/receivables/{id}`, `PUT /api/receivables/{id}`, `DELETE /api/receivables/{id}`, `GET /api/receivables/summary`, `POST /api/receivables/{id}/installments/{n}/pay`, `POST /api/receivables/{id}/installments/{n}/unpay`.
- New collection: `receivables` (embedded `installments` array).
- New permission `receivables` added to ALL_TAB_PERMISSIONS.
- 8 pytest tests cover CRUD lifecycle, weekly/biweekly/monthly date math, pay/unpay flow + auto-complete, summary buckets, validation errors, metadata update, salesperson RBAC.

### Programação de Entrega (Delivery Schedules) — Feb 12 2026
- Replicates the WhatsApp checklist format the owner uses to tell the yard worker what to prep before each delivery (customer name, car description, last 6 of VIN, list of specs, assigned staff, delivery date/time).
- **Backend** (`server.py`): new `delivery_schedules` collection + CRUD endpoints:
  - `GET /api/delivery-schedules` (filters by status; salespeople see only theirs)
  - `POST /api/delivery-schedules` (auto-snapshots vehicle make/model/year/color/vin/buyer when `vehicle_id` is given)
  - `PUT /api/delivery-schedules/{sid}` (auto-recomputes status: pending → in_progress → completed)
  - `POST /api/delivery-schedules/{sid}/spec/{spec_id}/toggle` (the yard worker's fast tap — flips one task and re-evaluates status)
  - `DELETE /api/delivery-schedules/{sid}` (owner/manager only)
  - `GET /api/delivery-schedules/alerts` (count of schedules with `alert_due_soon=True` — for the red badge)
- Each list response is enriched with: `vin_last_6`, `total_specs`, `done_specs`, `pending_specs`, `hours_until`, `alert_due_soon` (= true if <24h to delivery and still has pending specs).
- **Push notification** to the assigned salesperson (`send_push_to_user` helper added) when the last spec is checked off — uses existing VAPID infrastructure.
- **Permissions**: added new `delivery_schedule` tab permission. Default for owner / gerente / salesperson / geral (the yard person). BDC excluded. `ALL_TAB_PERMISSIONS` updated.
- **`/team` endpoint** now returns a light payload for non-owners (no password_hash, no permissions) so the assignee picker works for managers and salespeople too.
- **Frontend**: new component `/app/frontend/src/components/DeliverySchedulesPanel.jsx`. Opens as an inline panel inside the **Esteira de Entrega** tab (button "Programação de Entrega" in the header) with a red badge if `alert_count > 0`. Big-tap checklist designed for the yard worker; assignee chips with avatars from `/api/team`; status filters (Ativas / Concluídas / Todas) with counts.
- **8 new pytest tests** in `test_delivery_schedules.py`. Existing `test_team_management.py` tests updated for the new light-payload behavior and new `delivery_schedule` permission key.
- **143 / 143 backend tests passing**.

### Cascade delete fix for salespeople (Feb 12 2026)
- Bug: deleting a salesperson team member from "Equipe" left an orphan record in `salespeople`, so the deleted person kept appearing on the leaderboard with 0 sales (e.g. "Julio Cesar #4 / 0").
- Fix: `DELETE /api/team/{uid}` is now cascade-aware. When the deleted member has `role=salesperson`, the matching `salespeople` doc is also removed and any vehicles previously sold by them have their `salesperson_id` blanked (the `salesperson_name` snapshot is preserved so historical reports still show who sold each car).
- New test `test_delete_salesperson_team_member_cascades_to_salespeople` covers the full flow (create → assert leaderboard contains → delete → assert leaderboard cleared).
- 127 / 127 backend tests passing.

### Buyer contact fields + revert-to-in_stock cleanup (Feb 12 2026)
- New `buyer_email` and `buyer_address` fields on the Vehicle model. When marking a car as "Vendido", the form now collects: Nome, Telefone, **Email**, **Endereço**, Forma de pagamento, Nome do banco, Entrada / Cheque / Emplacamento.
- Fixed the long-standing P0 bug where reverting a "Vendido" vehicle back to "Em estoque" left residual buyer / payment data on the record. The backend now wipes `buyer_name`, `buyer_phone`, `buyer_email`, `buyer_address`, `payment_method`, `bank_name`, `down_payment`, `bank_check_amount`, `registration_cost`, `sold_price`, `sold_at` and removes any phantom `registration` expense — all in a single PUT, regardless of what the client echoes back.
- Translations added in PT / EN / ES.
- 3 new pytest tests in `test_buyer_contact_fields.py` covering create-with-email/address, revert wipe (including all 6 buyer/payment fields), and backwards-compat (email/address optional).
- 135 / 135 backend tests passing.

### Premium "Visão Geral" partial redesign (Feb 12 2026)
- User requested a more professional / differentiating Overview. Initial direction: Premium Dark + Gold. After v1 user rolled it back and asked to keep just two things.
- **What stayed:**
  - **Weekday Heatmap** block "Vendas · Dia da semana" (7 cells colored by intensity over last 90 days, hottest day highlighted with a star + legend).
  - **Redesigned Performance Mensal** chart: SVG area + gold line overlay on the red bars, Y-axis grid lines with numeric thresholds, headline stats (Total no período / Mês atual), current-month bar with metallic glow + gold shine, hover tooltip showing the delta vs the previous month.
- **What reverted:** Hero, premium KPI strip (Receita/Lucro/Tempo médio), Comparativo bars, inventory cards — all back to the original red layout.
- **Backend endpoint `GET /api/overview-insights`** kept (still powers `weekday_counts`). Owner/manager see money fields; salesperson gets a stripped payload.
- Gold CSS variables / utilities kept in `index.css` (used by the two surviving blocks).
- **5 new pytest tests** in `test_overview_insights.py` (payload shape, delta math, weekday count integrity, days-in-stock sanity, auth required).
- **132 / 132 backend tests passing**.

## Test credentials
- **Owner** — Email: `carlos@intercar.com` · Password: `senha123` (sees everything)
- **Salesperson** — Email: `joao@intercar.com` · Password: `senha456` (restricted view)
- Dealership: Inter Car (Honda Civic 2022 in delivery pipeline)
- See `/app/memory/test_credentials.md`

## URL
https://auto-commerce-lab.preview.emergentagent.com

## Recent UI Updates (Feb 2026)
- **Down Payment Tracking** (Feb 2026): Sellers can now log partial payments toward each customer's agreed entrada directly from the sales pipeline.
  - Sales pipeline card (sold column): inline status badge "ENTRADA $paid / $agreed · FALTA $X" or "ENTRADA QUITADA 100%" with a progress bar (amber while owing, green when paid).
  - `DownPaymentDialog` modal: hero balance card, payment history (with print + delete per row), and a "Add Payment" form. On submit, the system auto-opens the freshly generated PDF receipt.
  - PDF receipt: "DOWN PAYMENT RECEIPT" (English, same template as the installment receipt) — title, ordinal "X of N", agreed/paid/remaining cells, full-paid chip when balance hits zero.
  - Push notification "Entrada quitada · {buyer} quitou a entrada de US$ X" fires once when balance reaches zero.
  - Separate from the existing "Deposit Receipts" (sinal) collection — kept in a dedicated `down_payment_payments` collection so the two flows don't mix.
  - Files: `/app/backend/down_payment_receipt_pdf.py`, `/app/frontend/src/components/DownPaymentDialog.jsx`, new endpoints in `server.py` (`/vehicles/{vid}/down-payments`, `/down-payments/{pid}`, `/down-payments/{pid}/receipt.pdf`, `/down-payments/totals`).
  - i18n keys added in PT/EN/ES (`dp_*`).
  - Verified end-to-end: 3 partial payments accumulating to full quote, PDF rendered, fully-paid status flipped.

- **AuthPage redesign** (Feb 2026): Replaced the centered card login with a cinematic split-screen showroom layout.
  - Left (58%): big bold typography ("Acelere sua revenda ao próximo nível"), brand mark, feature pills (Estoque ∞ / Leads CRM / Financeiro ROI), live status pulse
  - Right: elegant underline-style inputs with animated red focus glow, hero "Bem-vindo de volta" headline, gradient red CTA with sweep shine, "or" divider + ghost toggle button
  - Auto-detects tenant by hostname (xpro → X-PRO MOTORS wordmark, else → Intercar shield)
  - Responsive: hero panel hides on mobile, brand mark falls back to compact top header
  - New i18n keys: `auth_hero_line1/2/3`, `auth_hero_blurb`, `auth_live_status`, `auth_eyebrow_login/signup`, `management_suite`, `show/hide/or` (PT/EN/ES)
  - File: `/app/frontend/src/pages/AuthPage.jsx`
  - Verified: PT login flow works end-to-end (carlos@intercar.com → dashboard)

## Backlog (next session)
- Add photo upload from computer (not just URLs) — Cloudinary
- Drag-and-drop on pipelines
- Notifications/alerts for vehicles stuck in a delivery step too long
- Vehicle history/timeline (every step change with timestamp + user)
- Real charts (Recharts) for monthly view
- Customer database (search past buyers)
- Multi-user per dealership (owner/salesperson roles)
- Export sales/delivery report (CSV/PDF)
- Currency switcher (currently USD)
- Real Lovable/Supabase ↔ Auto Manager bidirectional sync (to/from the original Lovable app)
