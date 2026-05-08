import { useEffect, useMemo, useState } from "react";
import { Search, Phone, Calendar, Car, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import NameWithAvatar from "../components/NameWithAvatar";

function formatBRL(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return s; }
}

export default function Customers({ t, onHistory }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get("/customers");
      setCustomers(r.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || t("error_generic")); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      `${c.name} ${c.phone}`.toLowerCase().includes(q) ||
      c.vehicles.some(v => `${v.make} ${v.model}`.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const totalCustomers = filtered.length;
  const totalRevenue = filtered.reduce((s, c) => s + (c.total_spent || 0), 0);
  const repeatCount = filtered.filter(c => c.vehicles_count > 1).length;

  return (
    <div data-testid="customers-tab">
      <p className="label-eyebrow text-primary mb-2">{t("customers_eyebrow")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-6">{t("customers_title")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="border border-border bg-surface p-4">
          <p className="label-eyebrow text-text-secondary mb-1">{t("customers_total")}</p>
          <p className="font-display font-black text-3xl">{totalCustomers}</p>
        </div>
        <div className="border border-border bg-surface p-4">
          <p className="label-eyebrow text-text-secondary mb-1">{t("customers_repeat")}</p>
          <p className="font-display font-black text-3xl text-success">{repeatCount}</p>
        </div>
        <div className="border border-primary bg-primary/5 p-4">
          <p className="label-eyebrow text-primary mb-1">{t("customers_total_revenue")}</p>
          <p className="font-display font-black text-3xl text-primary">{formatBRL(totalRevenue)}</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          data-testid="customers-search"
          type="text"
          placeholder={t("customers_search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 h-11 bg-surface border border-border focus:border-primary focus:outline-none text-sm"
        />
      </div>

      {loading ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">
          {search ? t("customers_no_match") : t("customers_no_yet")}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOpen = open === c.key;
            return (
              <div key={c.key} data-testid={`customer-${c.key}`} className="border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : c.key)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors text-left"
                >
                  {isOpen ? <ChevronDown size={16} className="text-text-secondary" /> : <ChevronRight size={16} className="text-text-secondary" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold uppercase truncate">{c.name}</p>
                    <div className="flex items-center gap-3 text-xs text-text-secondary mt-0.5 flex-wrap">
                      {c.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{c.phone}</span>}
                      <span className="inline-flex items-center gap-1"><Calendar size={11} />{t("last_purchase")} {formatDate(c.last_purchase_at)}</span>
                      {c.vehicles_count > 1 && (
                        <span className="text-success font-display font-bold uppercase tracking-wider text-[10px]">
                          {t("repeat_customer_badge")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="label-eyebrow text-text-secondary">{t("vehicles")}</p>
                    <p className="font-display font-bold text-lg">{c.vehicles_count}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="label-eyebrow text-primary">{t("total_spent")}</p>
                    <p className="font-display font-black text-base text-primary">{formatBRL(c.total_spent)}</p>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border p-4 space-y-2" data-testid={`customer-panel-${c.key}`}>
                    <p className="label-eyebrow mb-2">{t("vehicles_purchased")}</p>
                    {c.vehicles.map(v => (
                      <div key={v.id} className="flex flex-wrap items-center gap-3 border border-border p-3">
                        <div className="w-16 h-12 bg-background border border-border overflow-hidden shrink-0">
                          {v.image ? (
                            <img src={v.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-secondary"><Car size={16} /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <p className="font-display font-bold text-sm">{v.year} {v.make} {v.model}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary mt-0.5">
                            {v.color && <span>{v.color}</span>}
                            <span>{formatDate(v.sold_at)}</span>
                            {v.salesperson_name && (
                              <span className="inline-flex items-center gap-1">
                                <NameWithAvatar name={v.salesperson_name} size="xs" />
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="font-display font-black text-base text-primary whitespace-nowrap">{formatBRL(v.sold_price)}</p>
                        {onHistory && (
                          <button
                            type="button"
                            onClick={() => onHistory(v.id)}
                            data-testid={`cust-history-${v.id}`}
                            className="text-[11px] px-3 py-1.5 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors"
                          >
                            {t("vehicle_history")}
                          </button>
                        )}
                      </div>
                    ))}
                    {c.salespeople.length > 0 && (
                      <p className="text-xs text-text-secondary mt-2">
                        {t("served_by")} {c.salespeople.map((s, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            <NameWithAvatar name={s} size="xs" className="text-text-primary" />
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
