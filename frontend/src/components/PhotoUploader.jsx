import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * Reusable photo upload component using Cloudinary signed uploads.
 *
 * Props:
 *  - value: array of image URLs already uploaded
 *  - onChange: (newUrls: string[]) => void
 *  - folder: "vehicles" | "delivery" (sub-folder type)
 *  - maxFiles: optional max number of images
 *  - t: translation function
 */
export default function PhotoUploader({ value = [], onChange, folder = "vehicles", maxFiles = 50, t }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const uploadOne = async (file, sigBase) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sigBase.api_key);
    form.append("timestamp", sigBase.timestamp);
    form.append("signature", sigBase.signature);
    form.append("folder", sigBase.folder);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${sigBase.cloud_name}/image/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Cloudinary upload failed");
    return data.secure_url;
  };

  const handleFiles = async (fileList) => {
    if (!fileList?.length) return;
    if (value.length + fileList.length > maxFiles) {
      toast.error(`Máximo ${maxFiles} fotos`);
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: fileList.length });

    try {
      // Get signed params from backend
      const sigRes = await api.get("/cloudinary/signature", { params: { folder: `${folder}/` } });
      // Signature must be re-fetched for each timestamp; but Cloudinary accepts the same one within ~1h
      // We'll fetch one signature, then upload all files in parallel.
      const sig = sigRes.data;

      const urls = [];
      // Upload sequentially to avoid bandwidth saturation + reliable progress
      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: apenas imagens`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: máx 10MB`);
          continue;
        }
        try {
          const url = await uploadOne(file, sig);
          urls.push(url);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        } catch (e) {
          toast.error(`${file.name}: falhou`);
        }
      }
      if (urls.length) {
        onChange([...(value || []), ...urls]);
        toast.success(`${urls.length} ${urls.length === 1 ? "foto enviada" : "fotos enviadas"}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro no upload");
    } finally {
      setUploading(false);
      setProgress({ done: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  const moveFirst = (idx) => {
    if (idx === 0) return;
    const next = [...value];
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    onChange(next);
  };

  return (
    <div data-testid="photo-uploader" className="space-y-3">
      {/* Upload zone */}
      <label
        htmlFor={`photo-input-${folder}`}
        data-testid="upload-zone"
        className={`block border-2 border-dashed transition-colors p-6 text-center cursor-pointer ${
          uploading ? "border-primary bg-primary/5" : "border-border hover:border-primary"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading) handleFiles(Array.from(e.dataTransfer.files || []));
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-primary animate-spin" />
            <p className="text-sm text-text-secondary">
              {progress.done} / {progress.total}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={24} className="text-text-secondary" />
            <p className="text-sm text-text-secondary">
              {t ? t("drag_drop") : "Arraste fotos aqui ou clique"}
            </p>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider">JPG · PNG · WEBP · max 10MB</p>
          </div>
        )}
      </label>
      <input
        id={`photo-input-${folder}`}
        ref={inputRef}
        data-testid="photo-input"
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />

      {/* Thumbs grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {value.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              data-testid={`thumb-${idx}`}
              className={`relative aspect-square bg-surface border ${idx === 0 ? "border-primary" : "border-border"} group overflow-hidden`}
            >
              <img src={url} alt={`photo-${idx}`} className="w-full h-full object-cover" />
              {idx === 0 && (
                <span className="absolute top-1 left-1 bg-primary text-white text-[8px] tracking-wider uppercase px-1.5 py-0.5">
                  Capa
                </span>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {idx !== 0 && (
                  <button
                    type="button"
                    data-testid={`make-cover-${idx}`}
                    onClick={() => moveFirst(idx)}
                    className="text-[10px] px-2 py-1 bg-white text-black uppercase tracking-wider"
                    title="Tornar capa"
                  >
                    Capa
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`remove-thumb-${idx}`}
                  onClick={() => removeAt(idx)}
                  className="w-7 h-7 bg-primary text-white flex items-center justify-center"
                  title="Remover"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
