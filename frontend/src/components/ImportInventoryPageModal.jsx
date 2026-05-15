import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Car, Check, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

function formatUS(n) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ImportInventoryPageModal({ t, onClose, onImported }) {
  const [url, setUrl] = useState("");
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState({}); // url -> true
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });

  const scan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    setItems([]);
    setPicked({});
    try {
      const r = await api.post("/vehicles/import-inventory-page", { url: url.trim() });
      setItems(r.data.items || []);
      // Pre-select all by default
      const sel = {};
      (r.data.items || []).forEach(it => { sel[it.url] = true; });
      setPicked(sel);
      if (!r.data.items?.length) toast.warning(t("import_inv_none"));
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setScanning(false); }
  };

  const toggleAll = (val) => {
    const sel = {};
    items.forEach(it => { sel[it.url] = val; });
    setPicked(sel);
  };

  const importPicked = async () => {
    const list = items.filter(it => picked[it.url]);
    if (!list.length) {
      toast.warning(t("import_inv_select_at_least_one"));
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: list.length, errors: 0 });
    let imported = 0;
    let errors = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      try {
        // Step 1: extract details from the URL
        const det = await api.post("/vehicles/import-url", { url: it.url });
        const x = det.data.extracted || {};
        // Step 2: create the vehicle
        await api.post("/vehicles", {
          make: x.make || it.make || "",
          model: x.model || it.model || "",
          year: x.year || it.year || new Date().getFullYear(),
          color: "",
          vin: x.vin || "",
          mileage: x.mileage || it.mileage || 0,
          purchase_price: 0,
          sale_price: x.price || it.price || 0,
          expenses: 0,
          description: x.description || "",
          images: x.images && x.images.length ? x.images : (x.image ? [x.image] : (it.thumbnail ? [it.thumbnail] : [])),
          status: "in_stock",
          transmission: "Automatic",
          fuel_type: "Gasoline",
          body_type: "Sedan",
        });
        imported += 1;
      } catch {
        errors += 1;
      }
      setProgress({ done: i + 1, total: list.length, errors });
    }
    setImporting(false);
    if (imported > 0) {
      toast.success(t("import_inv_done").replace("{n}", imported));
      onImported && onImported();
    }
    if (errors > 0) {
      toast.error(t("import_inv_errors").replace("{n}", errors));
    }
  };

  const pickedCount = Object.values(picked).filter(Boolean).length;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center overflow-auto py-8 px-4" data-testid="import-inv-modal">
      <div className="bg-background border border-border w-full max-w-3xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">{t("import_inv_eyebrow")}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight inline-flex items-center gap-2">
              <ListChecks size={18} /> {t("import_inv_title")}
            </h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary">{t("import_inv_intro")}</p>

          <div className="flex gap-2">
            <input
              data-testid="import-inv-url"
              type="url"
              placeholder="https://www.intercarautosales.com/inventory"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={scanning || importing}
              className="flex-1 bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            />
            <button
              type="button"
              data-testid="import-inv-scan"
              onClick={scan}
              disabled={scanning || importing || !url.trim()}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 h-11 text-xs font-display font-bold uppercase tracking-widest text-white inline-flex items-center gap-2"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {scanning ? t("import_inv_scanning") : t("import_inv_scan_btn")}
            </button>
          </div>

          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border">
                <p className="label-eyebrow">
                  {items.length} {items.length === 1 ? t("vehicle_one") : t("vehicles")}
                  <span className="text-success ml-2 normal-case font-display font-bold">
                    · {pickedCount} {t("import_inv_selected")}
                  </span>
                </p>
                <div className="flex gap-2 text-[10px] uppercase tracking-widest">
                  <button type="button" onClick={() => toggleAll(true)} className="px-3 py-1.5 border border-border hover:border-primary text-text-secondary hover:text-primary">
                    {t("select_all")}
                  </button>
                  <button type="button" onClick={() => toggleAll(false)} className="px-3 py-1.5 border border-border hover:border-primary text-text-secondary hover:text-primary">
                    {t("deselect_all")}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-auto pr-1">
                {items.map(it => {
                  const sel = !!picked[it.url];
                  return (
                    <button
                      key={it.url}
                      type="button"
                      data-testid={`import-inv-item-${it.url}`}
                      onClick={() => setPicked(p => ({ ...p, [it.url]: !p[it.url] }))}
                      className={`relative text-left border bg-surface overflow-hidden transition-colors ${sel ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/60"}`}
                    >
                      <div className="aspect-[4/3] bg-background relative">
                        {it.thumbnail ? (
                          <img src={it.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-secondary"><Car size={24} /></div>
                        )}
                        {sel && (
                          <span className="absolute top-1.5 right-1.5 bg-primary w-6 h-6 rounded-full flex items-center justify-center">
                            <Check size={13} className="text-white" />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="font-display font-bold text-xs leading-tight line-clamp-2">
                          {it.year} {it.make} {it.model}
                        </p>
                        <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">{it.title || ""}</p>
                        {it.price > 0 && <p className="font-display font-black text-sm text-primary mt-1">{formatUS(it.price)}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {importing && (
            <div className="border border-primary bg-primary/10 p-3 text-xs">
              <p className="font-display font-bold uppercase">{t("import_inv_importing")}</p>
              <p className="text-text-secondary mt-1">
                {progress.done} / {progress.total} ({progress.errors} {t("errors")})
              </p>
              <div className="h-1 bg-background mt-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-border">
          <button type="button" onClick={onClose} disabled={importing} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">
            {importing ? t("import_inv_keep_open") : t("close")}
          </button>
          <button
            type="button"
            data-testid="import-inv-confirm"
            onClick={importPicked}
            disabled={importing || items.length === 0 || pickedCount === 0}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors inline-flex items-center gap-2"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {importing ? t("import_inv_importing") : t("import_inv_import_btn").replace("{n}", pickedCount)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
