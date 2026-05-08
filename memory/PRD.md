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
- New **Gerente** (manager) role alongside Vendedor and BDC. Gerente starts with empty permissions — owner grants tab access case-by-case. Visual badge in amber distinguishes managers from salesperson (red) and BDC (cyan).
- Backend: `POST /api/team` accepts optional `photo_url`/`photo_public_id`; `DELETE /api/team/{uid}` accepts gerente; `ROLE_DEFAULT_PERMISSIONS["gerente"] = []`.

### Stuck-delivery alerts (Feb 2026)
- Backend tracks `delivery_step_updated_at` on every step change; `GET /api/delivery` returns `days_in_step` + `stuck_alert` (>=45 days, step <8).
- New endpoint `GET /api/delivery/alerts?days=45` (owner/gerente only — 403 for salesperson/BDC).
- Frontend (owner + gerente only):
  - Sidebar badge (red, glowing) next to "Esteira de Entrega" with the count of stuck cars.
  - Banner at the top of the Delivery tab with "X carros parados há mais de 45 dias" + toggle "Ver só os parados".
  - Each stuck car card highlighted with red border and chip "⚠ Parado há N dias".

## Test credentials
- **Owner** — Email: `carlos@intercar.com` · Password: `senha123` (sees everything)
- **Salesperson** — Email: `joao@intercar.com` · Password: `senha456` (restricted view)
- Dealership: Inter Car (Honda Civic 2022 in delivery pipeline)
- See `/app/memory/test_credentials.md`

## URL
https://auto-commerce-lab.preview.emergentagent.com

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
