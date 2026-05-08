import { useEffect, useState } from "react";
import { X, Car, Plus, Wrench, DollarSign, ArrowRightCircle, CheckCircle2, RotateCcw, Award, UserCheck, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

const STEP_LABEL = {
  0: "—",
  1: "1. Vendido",
  2: "2. Ficha de negociação + Bill of sale",
  3: "3. Garantia estendida",
  4: "4. Manutenção",
  5: "5. Seguro",
  6: "6. Título recebido",
  7: "7. Registro",
  8: "8. Entregue",
};

const STATUS_LABEL = {
  in_stock: "Em estoque",
  reserved: "Reservado",
  sold: "Vendido",
};

function formatBRL(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(s) {
  if (!s) return "—";
  // Accept ISO datetime or date-only
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

function EventIcon({ type }) {
  const cls = "text-white";
  switch (type) {
    case "created": return <Plus size={14} className={cls} />;
    case "maintenance": return <Wrench size={14} className={cls} />;
    case "expense": return <DollarSign size={14} className={cls} />;
    case "delivery_step": return <ArrowRightCircle size={14} className={cls} />;
    case "delivered": return <CheckCircle2 size={14} className={cls} />;
    case "lost_sale": return <RotateCcw size={14} className={cls} />;
    case "status_change": return <Award size={14} className={cls} />;
    case "salesperson_changed": return <UserCheck size={14} className={cls} />;
    case "commission_paid": case "commission_unpaid": return <DollarSign size={14} className={cls} />;
    default: return <FileText size={14} className={cls} />;
  }
}

const TYPE_COLOR = {
  created: "bg-blue-600 border-blue-500",
  maintenance: "bg-amber-600 border-amber-500",
  expense: "bg-violet-600 border-violet-500",
  delivery_step: "bg-pink-600 border-pink-500",
  delivered: "bg-success border-success",
  lost_sale: "bg-warning border-warning",
  status_change: "bg-primary border-primary",
  salesperson_changed: "bg-cyan-600 border-cyan-500",
  commission_paid: "bg-emerald-600 border-emerald-500",
  commission_unpaid: "bg-rose-600 border-rose-500",
};

function EventCard({ e }) {
  const color = TYPE_COLOR[e.type] || "bg-text-secondary border-border";
  return (
    <div className="relative pl-10 pb-4">
      <div className={`absolute left-1 top-1 w-7 h-7 rounded-full border-2 ${color} flex items-center justify-center`}>
        <EventIcon type={e.type} />
      </div>
      <div className="border border-border bg-surface p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Body e={e} />
          </div>
          <span className="text-[10px] text-text-secondary font-mono uppercase tracking-wider whitespace-nowrap">
            {formatDate(e.at)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Body({ e }) {
  switch (e.type) {
    case "created":
      return <p className="font-display font-bold uppercase">Veículo cadastrado no sistema</p>;

    case "maintenance":
      return (
        <>
          <p className="font-display font-bold">🔧 {e.title}</p>
          <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-text-secondary">
            <span className="font-display font-bold text-primary">{formatBRL(e.amount)}</span>
            {e.by && <span>por {e.by}</span>}
            {(e.parts || []).length > 0 && <span>peças: {e.parts.join(", ")}</span>}
          </div>
          {(e.attachments || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {e.attachments.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 border border-border hover:border-primary text-[10px]">
                  {(a.type || "").startsWith("image/") ? <ImageIcon size={10} /> : <FileText size={10} />}
                  {a.name || "arquivo"}
                </a>
              ))}
            </div>
          )}
        </>
      );

    case "expense":
      return (
        <>
          <p className="font-display font-bold">{e.title}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            <span className="font-display font-bold text-primary">{formatBRL(e.amount)}</span>
            {e.category && <span> · {e.category}</span>}
          </p>
        </>
      );

    case "status_change": {
      if (e.to === "sold") {
        return (
          <>
            <p className="font-display font-bold uppercase text-primary">VENDIDO</p>
            <p className="text-xs text-text-secondary mt-1">
              {e.buyer_name && <span>para <b className="text-text-primary">{e.buyer_name}</b></span>}
              {e.sold_price > 0 && <span> · {formatBRL(e.sold_price)}</span>}
              {e.salesperson_name && <span> · vendedor {e.salesperson_name}</span>}
            </p>
            {e.by && <p className="text-[10px] text-text-secondary mt-0.5">registrado por {e.by}</p>}
          </>
        );
      }
      return (
        <>
          <p className="font-display font-bold uppercase">Status: {STATUS_LABEL[e.from] || e.from} → {STATUS_LABEL[e.to] || e.to}</p>
          {e.by && <p className="text-xs text-text-secondary mt-0.5">por {e.by}</p>}
        </>
      );
    }

    case "delivery_step":
      return (
        <>
          <p className="font-display font-bold uppercase text-pink-400">
            Etapa {e.from || 0} → {STEP_LABEL[e.to] || e.to}
          </p>
          {e.by && <p className="text-xs text-text-secondary mt-0.5">por {e.by}</p>}
        </>
      );

    case "delivered":
      return <p className="font-display font-bold uppercase text-success">✓ Veículo entregue ao cliente</p>;

    case "lost_sale":
      return (
        <>
          <p className="font-display font-bold uppercase text-warning">Venda revertida</p>
          <div className="text-xs text-text-secondary mt-1 space-y-0.5">
            {e.buyer_name && <p>cliente: <b className="text-text-primary">{e.buyer_name}</b></p>}
            {e.reason && <p>motivo: {e.reason}</p>}
            {e.observation && <p className="italic">"{e.observation}"</p>}
            {e.lost_revenue > 0 && <p>receita perdida: <b>{formatBRL(e.lost_revenue)}</b></p>}
            {e.salesperson_name && <p>vendedor: {e.salesperson_name}</p>}
          </div>
        </>
      );

    case "salesperson_changed":
      return (
        <>
          <p className="font-display font-bold uppercase">Vendedor trocado</p>
          <p className="text-xs text-text-secondary mt-0.5">{e.from_name || "—"} → <b className="text-text-primary">{e.to_name || "—"}</b></p>
          {e.by && <p className="text-[10px] text-text-secondary mt-0.5">por {e.by}</p>}
        </>
      );

    case "commission_paid":
      return (
        <>
          <p className="font-display font-bold uppercase text-emerald-400">Comissão paga</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {e.salesperson_name && <span>{e.salesperson_name} · </span>}
            <b className="text-text-primary">{formatBRL(e.amount)}</b>
          </p>
          {e.by && <p className="text-[10px] text-text-secondary mt-0.5">marcado por {e.by}</p>}
        </>
      );

    case "commission_unpaid":
      return (
        <>
          <p className="font-display font-bold uppercase">Comissão revertida (não paga)</p>
          {e.by && <p className="text-[10px] text-text-secondary mt-0.5">por {e.by}</p>}
        </>
      );

    default:
      return <p className="font-display font-bold">{e.title || e.type}</p>;
  }
}

export default function VehicleHistoryModal({ vehicleId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/vehicles/${vehicleId}/history`);
        if (alive) setData(r.data);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Erro ao buscar histórico");
        onClose();
      } finally { alive && setLoading(false); }
    })();
    return () => { alive = false; };
  }, [vehicleId]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4" data-testid="history-modal">
      <div className="bg-background border border-border w-full max-w-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">Histórico completo</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {data?.vehicle ? `${data.vehicle.year || ""} ${data.vehicle.make} ${data.vehicle.model}` : "..."}
            </h2>
          </div>
          <button data-testid="close-history" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {/* Vehicle summary */}
        {data?.vehicle && (
          <div className="flex gap-4 p-5 border-b border-border">
            <div className="w-24 h-20 bg-surface border border-border overflow-hidden shrink-0">
              {data.vehicle.image ? (
                <img src={data.vehicle.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-secondary">
                  <Car size={22} />
                </div>
              )}
            </div>
            <div className="flex-1 text-xs space-y-0.5">
              <p>
                <span className="text-text-secondary">Status:</span>{" "}
                <span className={`font-display font-bold uppercase ${data.vehicle.status === "sold" ? "text-success" : "text-text-primary"}`}>
                  {STATUS_LABEL[data.vehicle.status] || data.vehicle.status}
                </span>
              </p>
              {data.vehicle.delivery_step > 0 && (
                <p><span className="text-text-secondary">Etapa atual:</span> <b>{STEP_LABEL[data.vehicle.delivery_step]}</b></p>
              )}
              {data.vehicle.buyer_name && (
                <p><span className="text-text-secondary">Comprador:</span> <b>{data.vehicle.buyer_name}</b></p>
              )}
              {data.vehicle.salesperson_name && (
                <p><span className="text-text-secondary">Vendedor:</span> <b>{data.vehicle.salesperson_name}</b></p>
              )}
              {data.vehicle.color && (
                <p><span className="text-text-secondary">Cor:</span> {data.vehicle.color}</p>
              )}
              {data.vehicle.vin && (
                <p><span className="text-text-secondary">VIN:</span> <span className="font-mono">{data.vehicle.vin}</span></p>
              )}
            </div>
          </div>
        )}

        <div className="p-5 max-h-[60vh] overflow-auto">
          {loading ? (
            <p className="text-center text-text-secondary py-8 text-sm">Carregando histórico...</p>
          ) : (data?.events || []).length === 0 ? (
            <p className="text-center text-text-secondary py-8 text-sm italic">
              Sem eventos registrados ainda.
            </p>
          ) : (
            <div className="relative">
              <span className="absolute left-[18px] top-2 bottom-0 w-px bg-border" aria-hidden />
              {data.events.map((e, i) => (
                <EventCard key={i} e={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
