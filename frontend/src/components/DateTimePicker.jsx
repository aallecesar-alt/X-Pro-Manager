import { useState, useEffect, useRef, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from "lucide-react";

/**
 * DateTimePicker — pt-BR, 24h, dark theme.
 * value:    "YYYY-MM-DDTHH:MM" string  (so the existing form payload doesn't change)
 * onChange: (newValue: string) => void
 */
const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const WEEKDAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parseValue(v) {
  if (!v) return null;
  // Accept "YYYY-MM-DDTHH:MM" or full ISO
  try {
    const s = String(v).slice(0, 16);
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch { return null; }
}

function toValue(d) {
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDisplay(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MESES_PT[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} de ${month} de ${year} às ${hh}:${mm}`;
}

export default function DateTimePicker({ value, onChange, placeholder = "Selecione data e hora", testid = "datetime-picker" }) {
  const parsed = parseValue(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), 1) : new Date());
  const [hour, setHour] = useState(parsed ? parsed.getHours() : 9);
  const [minute, setMinute] = useState(parsed ? parsed.getMinutes() : 0);
  const wrapperRef = useRef(null);

  // Sync internal state when value prop changes externally
  useEffect(() => {
    const p = parseValue(value);
    if (p) {
      setViewMonth(new Date(p.getFullYear(), p.getMonth(), 1));
      setHour(p.getHours());
      setMinute(p.getMinutes());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const today = new Date();
  const selectedDate = parsed;

  // Build the calendar grid (6 weeks × 7 days) for the current viewMonth
  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startDow = first.getDay(); // 0=Sun
    const startDate = new Date(first);
    startDate.setDate(first.getDate() - startDow);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [viewMonth]);

  const pickDay = (d) => {
    const next = new Date(d);
    next.setHours(hour, minute, 0, 0);
    onChange(toValue(next));
  };
  const setTime = (h, m) => {
    setHour(h);
    setMinute(m);
    if (selectedDate) {
      const next = new Date(selectedDate);
      next.setHours(h, m, 0, 0);
      onChange(toValue(next));
    }
  };
  const stepHour = (delta) => {
    let h = (hour + delta + 24) % 24;
    setTime(h, minute);
  };
  const stepMinute = (delta) => {
    let m = minute + delta;
    let h = hour;
    if (m >= 60) { m = 0; h = (h + 1) % 24; }
    if (m < 0) { m = 55; h = (h - 1 + 24) % 24; }
    setTime(h, m);
  };
  const pickToday = () => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    onChange(toValue(d));
  };
  const clear = () => {
    onChange("");
  };

  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className="relative" ref={wrapperRef} data-testid={testid}>
      {/* Trigger */}
      <button
        type="button"
        data-testid={`${testid}-trigger`}
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-surface border border-border hover:border-primary px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <CalendarIcon size={14} className="text-primary shrink-0" />
          <span className={`truncate ${parsed ? "text-white" : "text-text-secondary"}`}>
            {parsed ? fmtDisplay(parsed) : placeholder}
          </span>
        </span>
        {parsed && (
          <button
            type="button"
            data-testid={`${testid}-clear`}
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="text-text-secondary hover:text-primary shrink-0"
            title="Limpar"
          >
            <X size={13} />
          </button>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          data-testid={`${testid}-popover`}
          className="absolute left-0 top-full mt-2 z-40 bg-background border border-border shadow-2xl w-[320px] sm:w-[360px]"
        >
          {/* Month header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="w-8 h-8 flex items-center justify-center hover:bg-surface text-text-secondary hover:text-primary transition-colors"
              data-testid={`${testid}-prev-month`}
            >
              <ChevronLeft size={16} />
            </button>
            <p className="font-display font-bold text-sm uppercase tracking-widest">
              {MESES_PT[viewMonth.getMonth()]} <span className="text-primary">{viewMonth.getFullYear()}</span>
            </p>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="w-8 h-8 flex items-center justify-center hover:bg-surface text-text-secondary hover:text-primary transition-colors"
              data-testid={`${testid}-next-month`}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {WEEKDAYS_PT.map((w) => (
              <div key={w} className="text-[9px] text-center text-text-secondary uppercase font-display font-bold tracking-widest py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(d, today);
              const isSelected = sameDay(d, selectedDate);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  data-testid={`${testid}-day-${d.getDate()}`}
                  className={`h-8 text-xs font-display font-bold transition-colors flex items-center justify-center ${
                    isSelected
                      ? "bg-primary text-white border border-primary"
                      : isToday
                      ? "border border-primary text-primary"
                      : inMonth
                      ? "text-white hover:bg-surface hover:text-primary"
                      : "text-text-secondary/40 hover:text-text-secondary"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time picker (24h) */}
          <div className="border-t border-border px-3 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <p className="label-eyebrow text-text-secondary">Hora</p>
            </div>
            <div className="flex items-center gap-1">
              <Stepper label={String(hour).padStart(2, "0")} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} testid={`${testid}-hour`} />
              <span className="text-text-secondary font-display font-bold">:</span>
              <Stepper label={String(minute).padStart(2, "0")} onUp={() => stepMinute(5)} onDown={() => stepMinute(-5)} testid={`${testid}-minute`} />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-3 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={clear}
              data-testid={`${testid}-clear-btn`}
              className="text-[10px] text-text-secondary hover:text-primary uppercase tracking-widest font-display font-bold"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={pickToday}
              data-testid={`${testid}-today`}
              className="text-[10px] text-primary hover:underline uppercase tracking-widest font-display font-bold"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid={`${testid}-confirm`}
              className="px-4 py-1.5 bg-primary text-white text-[10px] uppercase tracking-widest font-display font-bold hover:bg-primary-hover"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ label, onUp, onDown, testid }) {
  return (
    <div className="flex flex-col items-center" data-testid={testid}>
      <button
        type="button"
        onClick={onUp}
        className="w-10 h-5 text-[9px] text-text-secondary hover:text-primary hover:bg-surface transition-colors flex items-center justify-center"
        data-testid={`${testid}-up`}
      >
        ▲
      </button>
      <div className="w-10 py-1 text-center font-mono font-bold text-base text-white bg-surface border border-border">
        {label}
      </div>
      <button
        type="button"
        onClick={onDown}
        className="w-10 h-5 text-[9px] text-text-secondary hover:text-primary hover:bg-surface transition-colors flex items-center justify-center"
        data-testid={`${testid}-down`}
      >
        ▼
      </button>
    </div>
  );
}
