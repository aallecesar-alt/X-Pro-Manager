import { useState, useEffect, useRef } from "react";
import { Upload, Save, Building2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * DealershipProfileSection — owner-only editor for the dealership profile.
 * Allows updating: name, logo (Cloudinary upload), address, phone, email, website,
 * and theme ("default" = dark Intercar / "xpro" = light showroom).
 *
 * Renders inside the Settings tab.
 */
export default function DealershipProfileSection({ dealership, onRefresh, t }) {
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    theme: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (dealership) {
      setForm({
        name: dealership.name || "",
        logo_url: dealership.logo_url || "",
        address: dealership.address || "",
        phone: dealership.phone || "",
        email: dealership.email || "",
        website: dealership.website || "",
        theme: dealership.theme || "",
      });
    }
  }, [dealership]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      // Get a signed upload signature for the dealership-logos folder
      const signRes = await api.get("/cloudinary/signature", {
        params: { folder: "dealership-logos/" },
      });
      const { signature, timestamp, cloud_name, api_key, folder } = signRes.data;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", api_key);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      formData.append("folder", folder);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
        { method: "POST", body: formData }
      );
      const cloudData = await cloudRes.json();
      if (!cloudData.secure_url) {
        throw new Error("Upload failed");
      }
      set("logo_url", cloudData.secure_url);
      // Persist immediately so the sidebar refreshes
      await api.put("/dealership", { logo_url: cloudData.secure_url });
      toast.success("Logo atualizada");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast.error("Erro ao subir logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/dealership", form);
      toast.success("Perfil da loja salvo");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="dealership-profile-section" className="border border-border p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={16} className="text-primary" />
        <p className="label-eyebrow text-primary m-0">Perfil da Loja</p>
      </div>
      <p className="text-text-secondary text-sm mb-6">
        Personalize o nome, logo e dados de contato da sua loja. Aparece em PDFs e em toda a interface.
      </p>

      {/* Logo uploader */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-24 h-24 border-2 border-border bg-surface flex items-center justify-center overflow-hidden">
          {form.logo_url ? (
            <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <Building2 size={40} className="text-text-secondary/40" />
          )}
        </div>
        <div className="flex-1">
          <label className="label-eyebrow block mb-2">Logo da loja</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            data-testid="logo-upload"
            onChange={(e) => uploadLogo(e.target.files?.[0])}
            disabled={uploading}
            className="text-xs"
          />
          {uploading && <p className="text-xs text-text-secondary mt-2">Enviando…</p>}
          <p className="text-[10px] text-text-secondary mt-1">PNG, JPG ou WEBP — até 5MB.</p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="label-eyebrow block mb-2">Nome da loja</label>
          <input
            data-testid="dealership-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">Telefone</label>
          <input
            data-testid="dealership-phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="(978) 503-3869"
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label-eyebrow block mb-2">Endereço</label>
          <input
            data-testid="dealership-address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="556 River St, Fitchburg MA 01420"
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">Email</label>
          <input
            data-testid="dealership-email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">Website</label>
          <input
            data-testid="dealership-website"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://www.xpromotors.com/"
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">Tema visual</label>
          <select
            data-testid="dealership-theme"
            value={form.theme}
            onChange={(e) => set("theme", e.target.value)}
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          >
            <option value="">Escuro (padrão)</option>
            <option value="xpro">Showroom Racing (creme + preto + vermelho)</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        data-testid="save-dealership"
        className="bg-primary hover:bg-primary-hover px-6 py-2.5 font-display font-bold uppercase text-xs tracking-widest text-white inline-flex items-center gap-2 disabled:opacity-50"
      >
        <Save size={14} /> {saving ? "Salvando…" : "Salvar perfil"}
      </button>
    </div>
  );
}
