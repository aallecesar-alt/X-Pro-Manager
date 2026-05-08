import { User } from "lucide-react";

/**
 * Round avatar showing photo (Cloudinary URL) or initials fallback.
 * Sizes: xs(20), sm(28), md(36), lg(48), xl(64), 2xl(96).
 */
const SIZES = {
  xs: { box: 20, font: "text-[8px]", icon: 10 },
  sm: { box: 28, font: "text-[10px]", icon: 12 },
  md: { box: 36, font: "text-xs", icon: 14 },
  lg: { box: 48, font: "text-sm", icon: 18 },
  xl: { box: 64, font: "text-lg", icon: 22 },
  "2xl": { box: 96, font: "text-2xl", icon: 32 },
};

function getInitials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable color from the name to keep each person consistent
function colorFor(name) {
  const palette = [
    "from-rose-600 to-rose-800",
    "from-amber-600 to-amber-800",
    "from-emerald-600 to-emerald-800",
    "from-cyan-600 to-cyan-800",
    "from-indigo-600 to-indigo-800",
    "from-violet-600 to-violet-800",
    "from-fuchsia-600 to-fuchsia-800",
  ];
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export default function Avatar({ src, name, size = "md", ring = false, testid, className = "" }) {
  const cfg = SIZES[size] || SIZES.md;
  const ringClass = ring ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
  const dim = { width: cfg.box, height: cfg.box };
  const initials = getInitials(name);

  if (src) {
    return (
      <img
        data-testid={testid}
        src={src}
        alt={name || "avatar"}
        style={dim}
        className={`rounded-full object-cover border border-border bg-surface shrink-0 ${ringClass} ${className}`}
      />
    );
  }

  return (
    <div
      data-testid={testid}
      style={dim}
      className={`rounded-full bg-gradient-to-br ${colorFor(name)} text-white inline-flex items-center justify-center shrink-0 font-display font-black ${cfg.font} ${ringClass} ${className}`}
      title={name || ""}
    >
      {initials || <User size={cfg.icon} />}
    </div>
  );
}
