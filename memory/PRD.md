# Inter Car · Auto Manager — PRD

## Original Problem Statement
User has Auto Manager dealership app on Lovable. Wants the same/improved as a management app (not a public site). Will sync with intercarautosales.com via API later.

## Architecture
- Backend: FastAPI + Motor + MongoDB · JWT auth · multi-tenant per `dealership_id`
- Frontend: React 19 + Tailwind + Outfit/Manrope · single-page dashboard
- i18n: PT/EN/ES (in-memory)
- Theme: Premium dark (#0A0A0A) + signal red (#D92D20)

## Implemented (Jan 2026)
- ✅ Signup/Login with multi-tenant dealership creation (JWT 30d, localStorage)
- ✅ Multi-language UI (PT/EN/ES) persisted
- ✅ Dashboard / Overview: 8 KPIs + monthly performance bar chart
- ✅ Inventory CRUD: full vehicle form (specs, plate, VIN, prices, expenses, profit calc, photos)
- ✅ Sales pipeline (Kanban): in_stock → reserved → sold + buyer/payment/bank fields
- ✅ **Delivery pipeline (NEW)** — 8 post-sale steps:
   1. Vendido → 2. Dados do cliente → 3. Contrato do banco → 4. Manutenção
   → 5. Seguro → 6. Título recebido → 7. Registro → 8. Entregue
   - Auto-creates entry when vehicle marked as sold (delivery_step=1)
   - Visual stepper with checkmarks + colored circles (red→pink→purple→blue→green)
   - "Advance step" one-click button (red arrow)
   - "Edit step" modal (jump to any step + bank name)
   - "Notes" modal for delivery notes
   - Auto-sets delivered_at when reaching step 8
- ✅ Public API endpoint `/api/public/inventory?token=...` for external sites (e.g. intercarautosales.com)
- ✅ Settings: copy/regenerate API token

## Test credentials
- Email: `carlos@intercar.com`
- Password: `senha123`
- Dealership: Inter Car (1 vehicle: Honda Civic 2022, sold to Carlos via Lendbuzz, in delivery pipeline)
- See `/app/memory/test_credentials.md`

## Backlog / Next ideas (user mentioned has more)
- **P1** Photo upload (currently URL-only) → Cloudinary integration
- **P1** Drag-and-drop on pipelines
- **P1** Notifications/badge for vehicles needing attention in delivery
- **P1** Vehicle history/timeline (every step change with timestamp)
- **P2** Real charts (Recharts) for monthly view
- **P2** Customer database (search past buyers)
- **P2** Multi-user per dealership (owner/salesperson roles)
- **P2** Real Lovable/Supabase ↔ Auto Manager bidirectional sync
- **P2** Export sales/delivery report (CSV/PDF)
- **P2** Currency switcher (USD only today)
