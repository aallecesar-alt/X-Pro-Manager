import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import Avatar from "./Avatar";

/**
 * Single source of truth for "name → photo_url" lookup.
 *
 * Anywhere we render a name (sales table, leads card, vehicle history, maintenance
 * entries, etc), we wrap it in <NameWithAvatar name="Felipe" /> and the photo
 * shows automatically. Refreshes every 60s and can be force-refreshed via the
 * useTeamPhotos() hook.
 */
const PhotoMapContext = createContext({ map: {}, refresh: () => {} });

export function PhotoMapProvider({ children }) {
  const [map, setMap] = useState({});

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/team/photo-map");
      setMap(r.data || {});
    } catch {/* silent */}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <PhotoMapContext.Provider value={{ map, refresh }}>
      {children}
    </PhotoMapContext.Provider>
  );
}

export function useTeamPhotos() {
  return useContext(PhotoMapContext);
}

/**
 * Renders an avatar+name inline. If `photoUrl` is provided we use it, otherwise
 * we look it up in the photo map by `name`. Falls back to colored initials.
 */
export default function NameWithAvatar({
  name,
  photoUrl,
  size = "xs",
  showName = true,
  className = "",
  testid,
}) {
  const { map } = useTeamPhotos();
  const cleaned = (name || "").trim();
  if (!cleaned) return showName ? <span className={className}>—</span> : null;
  const src = photoUrl || map[cleaned] || "";
  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`} data-testid={testid}>
      <Avatar src={src} name={cleaned} size={size} />
      {showName && <span className="truncate">{cleaned}</span>}
    </span>
  );
}
