import { useState } from "react";
import { Plus, X, Trash2, Receipt, Calendar, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/api";
import PhotoUploader from "@/components/PhotoUploader";

const CATEGORIES = [
  { id: "parts", key: "cat_parts" },
  { id: "labor", key: "cat_labor" },
  { id: "paint", key: "cat_paint" },
  { id: "documentation", key: "cat_documentation" },
  { id: "transport", key: "cat_transport" },
  { id: "detail", key: "cat_detail" },
  { id: "inspection", key: "cat_inspection" },
  { id: "other", key: "cat_other" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const newId = () => Math.random().toString(36).slice(2, 12);

export default function ExpenseManager({ items = [], onChange, t }) {
  const [editingIdx, setEditingIdx] = useState(null);

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const addNew = () => {
    const next = [...items, { id: newId(), description: "", amount: 0, category: "parts", date: todayISO(), attachments: [] }];
    onChange(next);
    setEditingIdx(next.length - 1);
  };

  const updateItem = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const removeItem = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
    if (editingIdx === idx) setEditingIdx(null);
  };

  return (
    <div data-testid="expense-manager" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-eyebrow text-primary">{t("expense_items")}</p>
          <p className="text-2xl font-display font-black mt-1">{formatCurrency(total)}</p>
        </div>
        <button
          type="button"
          data-testid="add-expense"
          onClick={addNew}
          className="bg-primary hover:bg-primary-hover transition-colors px-4 py-2 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
        >
          <Plus size={14} /> {t("add_expense")}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-text-secondary text-sm text-center py-8 border border-dashed border-border">{t("expense_no_items")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => (
            <ExpenseRow
              key={it.id || idx}
              item={it}
              isEditing={editingIdx === idx}
              onToggle={() => setEditingIdx(editingIdx === idx ? null : idx)}
              onUpdate={(patch) => updateItem(idx, patch)}
              onRemove={() => removeItem(idx)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ item, isEditing, onToggle, onUpdate, onRemove, t }) {
  const catLabel = CATEGORIES.find((c) => c.id === item.category)?.key || "cat_other";
  return (
    <div data-testid={`expense-${item.id}`} className="border border-border bg-surface">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4 text-left hover:bg-background/50 transition-colors"
      >
        <div className="w-9 h-9 bg-background flex items-center justify-center flex-shrink-0">
          <Receipt size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm truncate">{item.description || "—"}</p>
          <p className="text-xs text-text-secondary">
            <span className="uppercase tracking-wider">{t(catLabel)}</span>
            {item.date && <> · {item.date}</>}
            {item.attachments?.length ? <> · {item.attachments.length} {item.attachments.length === 1 ? "anexo" : "anexos"}</> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display font-black text-base">{formatCurrency(Number(item.amount) || 0)}</p>
        </div>
        {isEditing ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
      </button>

      {/* Edit panel */}
      {isEditing && (
        <div className="border-t border-border p-4 space-y-4 bg-background">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label-eyebrow block mb-2">{t("expense_description")}</label>
              <input
                data-testid="expense-desc"
                type="text"
                value={item.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Ex: Pastilha de freio + mão de obra"
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">{t("expense_amount")}</label>
              <input
                data-testid="expense-amount"
                type="number"
                step="0.01"
                value={item.amount}
                onChange={(e) => onUpdate({ amount: e.target.value })}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">{t("expense_category")}</label>
              <select
                data-testid="expense-category"
                value={item.category}
                onChange={(e) => onUpdate({ category: e.target.value })}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm cursor-pointer"
              >
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.key)}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label-eyebrow block mb-2">{t("expense_date")}</label>
              <input
                data-testid="expense-date"
                type="date"
                value={item.date || ""}
                onChange={(e) => onUpdate({ date: e.target.value })}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="label-eyebrow block mb-2">{t("expense_attachments")}</label>
            <PhotoUploader
              value={(item.attachments || []).map(a => a.url || a)}
              onChange={(urls) => onUpdate({ attachments: urls.map((u) => ({ url: u })) })}
              folder="vehicles"
              t={t}
            />
          </div>

          <div className="flex justify-end pt-3 border-t border-border">
            <button
              type="button"
              data-testid="remove-expense"
              onClick={onRemove}
              className="text-xs px-3 py-2 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors inline-flex items-center gap-2"
            >
              <Trash2 size={12} /> {t("delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
