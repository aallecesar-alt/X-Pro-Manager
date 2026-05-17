import { useState, useEffect, useRef } from "react";
import { Upload, PenTool, X, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * Owner electronic signature manager.
 * Two ways to set the signature:
 *   1) Upload an image file (PNG/JPG with transparent or white background)
 *   2) Draw the signature on a canvas (saved as a base64 data URL)
 *
 * The signature is rendered on weekly payroll receipt PDFs.
 */
export default function SignatureSection({ dealership, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("preview"); // preview | upload | draw
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef({ x: 0, y: 0 });

  const sigSrc = dealership?.signature_url || dealership?.signature_data_url || "";

  useEffect(() => {
    if (mode !== "draw") return;
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = 600;
    cv.height = 200;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0F0F10";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [mode]);

  const xyOf = (e) => {
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const isTouch = e.touches && e.touches[0];
    const cx = isTouch ? e.touches[0].clientX : e.clientX;
    const cy = isTouch ? e.touches[0].clientY : e.clientY;
    return { x: ((cx - r.left) / r.width) * cv.width, y: ((cy - r.top) / r.height) * cv.height };
  };

  const onDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPtRef.current = xyOf(e);
  };
  const onMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = xyOf(e);
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPtRef.current = p;
  };
  const onUp = () => { drawingRef.current = false; };

  const clearCanvas = () => {
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
  };

  const saveDrawn = async () => {
    setBusy(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      await api.put("/dealership", { signature_data_url: dataUrl, signature_url: "" });
      toast.success("Assinatura salva");
      setMode("preview");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const signRes = await api.get("/cloudinary/signature", {
        params: { folder: "dealership-signatures/" },
      });
      const { signature, timestamp, cloud_name, api_key, folder } = signRes.data;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", api_key);
      fd.append("timestamp", String(timestamp));
      fd.append("signature", signature);
      fd.append("folder", folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
        method: "POST", body: fd,
      });
      const data = await res.json();
      if (!data.secure_url) throw new Error("upload failed");
      await api.put("/dealership", { signature_url: data.secure_url, signature_data_url: "" });
      toast.success("Assinatura atualizada");
      setMode("preview");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast.error("Erro ao subir assinatura");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearSignature = async () => {
    if (!window.confirm("Remover a assinatura?")) return;
    setBusy(true);
    try {
      await api.put("/dealership", { signature_url: "", signature_data_url: "" });
      toast.success("Removido");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast.error("Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="signature-section" className="border border-border p-6 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <PenTool size={16} className="text-primary" />
        <p className="label-eyebrow text-primary m-0">Assinatura eletrônica</p>
      </div>
      <p className="text-text-secondary text-sm mb-5">
        Sua assinatura aparece automaticamente nos recibos de pagamento semanal dos vendedores.
        Faça upload de uma imagem (PNG/JPG) ou desenhe diretamente aqui.
      </p>

      {mode === "preview" && (
        <>
          {sigSrc ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="border border-border bg-white p-4 inline-flex" data-testid="signature-preview">
                <img src={sigSrc} alt="Assinatura" style={{ maxHeight: 80, maxWidth: 300 }} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMode("upload")} disabled={busy} data-testid="sig-replace-upload" className="border border-border hover:border-primary hover:text-primary px-4 h-10 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest">
                  <Upload size={13} /> Upload novo
                </button>
                <button onClick={() => setMode("draw")} disabled={busy} data-testid="sig-replace-draw" className="border border-border hover:border-primary hover:text-primary px-4 h-10 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest">
                  <PenTool size={13} /> Redesenhar
                </button>
                <button onClick={clearSignature} disabled={busy} data-testid="sig-clear" className="border border-border hover:border-warning hover:text-warning px-4 h-10 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest">
                  <X size={13} /> Remover
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3" data-testid="signature-empty">
              <button onClick={() => setMode("upload")} className="border border-border bg-surface hover:border-primary hover:bg-primary/5 px-5 h-12 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest">
                <Upload size={14} /> Upload de imagem
              </button>
              <button onClick={() => setMode("draw")} className="border border-border bg-surface hover:border-primary hover:bg-primary/5 px-5 h-12 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest">
                <PenTool size={14} /> Desenhar com o mouse
              </button>
            </div>
          )}
        </>
      )}

      {mode === "upload" && (
        <div className="space-y-3" data-testid="signature-upload-mode">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => uploadImage(e.target.files?.[0])}
            disabled={busy}
            className="text-xs"
            data-testid="signature-upload-input"
          />
          <div className="flex gap-2">
            <button onClick={() => setMode("preview")} className="border border-border hover:border-text-primary px-4 h-9 text-xs font-display font-bold uppercase tracking-widest">
              Voltar
            </button>
          </div>
          <p className="text-[11px] text-text-secondary">
            Dica: use uma imagem com fundo branco ou transparente. Tamanho ideal: 600×200px.
          </p>
        </div>
      )}

      {mode === "draw" && (
        <div className="space-y-3" data-testid="signature-draw-mode">
          <div className="border-2 border-dashed border-border bg-white inline-block">
            <canvas
              ref={canvasRef}
              data-testid="signature-canvas"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onTouchStart={onDown}
              onTouchMove={onMove}
              onTouchEnd={onUp}
              style={{ width: "100%", maxWidth: 600, height: 200, cursor: "crosshair", touchAction: "none" }}
            />
          </div>
          <p className="text-[11px] text-text-secondary">Clique e arraste pra assinar. Pode tocar também no celular.</p>
          <div className="flex gap-2">
            <button onClick={clearCanvas} className="border border-border hover:border-warning hover:text-warning px-4 h-9 text-xs font-display font-bold uppercase tracking-widest">
              Limpar
            </button>
            <button onClick={saveDrawn} disabled={busy} data-testid="signature-save-drawn" className="bg-primary hover:bg-primary-hover px-5 h-9 text-xs font-display font-bold uppercase tracking-widest text-white inline-flex items-center gap-2 disabled:opacity-50">
              <Save size={13} /> Salvar assinatura
            </button>
            <button onClick={() => setMode("preview")} className="border border-border hover:border-text-primary px-4 h-9 text-xs font-display font-bold uppercase tracking-widest">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
