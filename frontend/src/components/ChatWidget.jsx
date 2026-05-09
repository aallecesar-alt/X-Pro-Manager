import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, Paperclip, Edit2, Trash2, Users, Check, ArrowLeft, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const POLL_MS = 5000;          // refresh active room every 5s
const HEARTBEAT_MS = 30000;    // refresh users + unread every 30s

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initialsOf(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function userColor(id) {
  const colors = ["bg-pink-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-cyan-500", "bg-orange-500", "bg-rose-500"];
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function dmRoomId(a, b) {
  return `dm:${[a, b].sort().join("_")}`;
}

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [unread, setUnread] = useState({ team: 0, dms: {}, total: 0 });
  const [activeRoom, setActiveRoom] = useState(null); // null = list view, "team" or "dm:..."
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  const me = user?.id;

  // Heartbeat: load users + unread (every 30s)
  const loadHeartbeat = async () => {
    try {
      const [u, n] = await Promise.all([
        api.get("/chat/users"),
        api.get("/chat/unread"),
      ]);
      setUsers(u.data || []);
      setUnread(n.data || { team: 0, dms: {}, total: 0 });
    } catch {/* silent */}
  };

  useEffect(() => {
    if (!user) return;
    loadHeartbeat();
    const id = setInterval(loadHeartbeat, HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [user?.id]);

  // Poll messages of active room every 5s
  const loadMessages = async (roomId) => {
    try {
      const r = await api.get("/chat/messages", { params: { room_id: roomId } });
      setMessages(r.data || []);
      // Mark as read
      api.post("/chat/read", { room_id: roomId }).catch(() => {});
    } catch (e) {
      if (e.response?.status === 403) toast.error("Sem acesso a essa conversa");
    }
  };

  useEffect(() => {
    if (!activeRoom || !open) return;
    loadMessages(activeRoom);
    const id = setInterval(() => loadMessages(activeRoom), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [activeRoom, open]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const otherUsers = useMemo(
    () => users.filter(u => !u.is_self),
    [users]
  );

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await api.post("/chat/messages", { room_id: activeRoom, content });
      setDraft("");
      await loadMessages(activeRoom);
      loadHeartbeat();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao enviar");
    } finally { setSending(false); }
  };

  const sendAttachment = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 8MB)");
      return;
    }
    setUploading(true);
    try {
      const sig = (await api.get("/cloudinary/signature", { params: { folder: "chat/" } })).data;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, {
        method: "POST", body: fd,
      });
      const json = await res.json();
      if (!json.secure_url) throw new Error(json.error?.message || "upload failed");
      const isImage = (file.type || "").startsWith("image/");
      await api.post("/chat/messages", {
        room_id: activeRoom,
        content: "",
        attachments: [{
          url: json.secure_url,
          public_id: json.public_id,
          name: file.name,
          size: file.size,
          type: isImage ? "image" : "file",
        }],
      });
      await loadMessages(activeRoom);
      loadHeartbeat();
    } catch (e) {
      toast.error(e.message || "Erro no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveEdit = async () => {
    const c = editDraft.trim();
    if (!c) return;
    try {
      await api.put(`/chat/messages/${editingId}`, { content: c });
      setEditingId(null);
      setEditDraft("");
      await loadMessages(activeRoom);
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const deleteMsg = async (id) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    try {
      await api.delete(`/chat/messages/${id}`);
      await loadMessages(activeRoom);
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  if (!user) return null;

  const roomTitle = (() => {
    if (activeRoom === "team") return "Time · Todos";
    if (activeRoom?.startsWith("dm:")) {
      const [a, b] = activeRoom.slice(3).split("_");
      const otherId = a === me ? b : a;
      const other = users.find(u => u.id === otherId);
      return other?.full_name || "Conversa";
    }
    return "Mensagens";
  })();

  const roomOnline = (() => {
    if (!activeRoom?.startsWith("dm:")) return null;
    const [a, b] = activeRoom.slice(3).split("_");
    const otherId = a === me ? b : a;
    return users.find(u => u.id === otherId)?.online;
  })();

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          data-testid="chat-open-btn"
          onClick={() => setOpen(true)}
          className="fixed top-5 right-5 z-50 bg-primary hover:bg-primary-hover text-white shadow-2xl shadow-primary/40 w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-110"
          title="Abrir chat"
        >
          <MessageCircle size={22} />
          {unread.total > 0 && (
            <span className="absolute -top-1 -right-1 bg-warning text-black font-display font-black text-[11px] rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 animate-pulse">
              {unread.total > 99 ? "99+" : unread.total}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          data-testid="chat-panel"
          className="fixed top-5 right-5 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-2rem)] bg-background border border-border shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface">
            <div className="flex items-center gap-3 min-w-0">
              {activeRoom !== null && (
                <button
                  data-testid="chat-back-btn"
                  onClick={() => setActiveRoom(null)}
                  className="text-text-secondary hover:text-primary"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="min-w-0">
                <p className="font-display font-bold text-sm uppercase tracking-wider truncate">
                  {activeRoom === null ? "Mensagens" : roomTitle}
                </p>
                {activeRoom?.startsWith("dm:") && (
                  <p className="text-[10px] text-text-secondary flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${roomOnline ? "bg-success" : "bg-text-secondary/40"}`} />
                    {roomOnline ? "Online" : "Offline"}
                  </p>
                )}
              </div>
            </div>
            <button data-testid="chat-close-btn" onClick={() => setOpen(false)} className="text-text-secondary hover:text-primary">
              <X size={18} />
            </button>
          </div>

          {/* List view */}
          {activeRoom === null && (
            <div className="flex-1 overflow-auto">
              {/* Team room */}
              <button
                data-testid="chat-room-team"
                onClick={() => setActiveRoom("team")}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface border-b border-border text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary">
                  <Users size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm">Time · Todos</p>
                  <p className="text-xs text-text-secondary">Conversa em grupo da revenda</p>
                </div>
                {unread.team > 0 && (
                  <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                    {unread.team}
                  </span>
                )}
              </button>

              {/* Direct messages */}
              {otherUsers.length === 0 ? (
                <p className="text-center text-text-secondary text-xs py-8 px-4">
                  Adicione mais usuários no Configurações &gt; Time para iniciar conversas individuais.
                </p>
              ) : (
                <>
                  <p className="px-4 py-2 text-[10px] uppercase tracking-widest text-text-secondary border-b border-border bg-surface/50">Conversas individuais</p>
                  {otherUsers.map(u => {
                    const rid = dmRoomId(me, u.id);
                    const n = unread.dms[u.id] || 0;
                    return (
                      <button
                        key={u.id}
                        data-testid={`chat-room-${u.id}`}
                        onClick={() => setActiveRoom(rid)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface border-b border-border text-left"
                      >
                        <div className="relative">
                          {u.photo_url ? (
                            <img src={u.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className={`w-10 h-10 rounded-full ${userColor(u.id)} text-white flex items-center justify-center text-xs font-bold`}>
                              {initialsOf(u.full_name)}
                            </div>
                          )}
                          {u.online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-background" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm truncate">{u.full_name}</p>
                          <p className="text-xs text-text-secondary capitalize">{u.role || "—"}</p>
                        </div>
                        {n > 0 && (
                          <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Thread view */}
          {activeRoom !== null && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2 bg-background/40">
                {messages.length === 0 ? (
                  <p className="text-center text-text-secondary text-xs py-12">Nenhuma mensagem ainda. Mande a primeira!</p>
                ) : (
                  messages.map(m => {
                    const mine = m.sender_id === me;
                    const isEditing = editingId === m.id;
                    return (
                      <div key={m.id} data-testid={`chat-msg-${m.id}`} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                        <div className={`max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                          {!mine && activeRoom === "team" && (
                            <p className="text-[10px] text-text-secondary mb-0.5 px-1">{m.sender_name}</p>
                          )}
                          {m.deleted ? (
                            <div className="border border-dashed border-border text-text-secondary italic px-3 py-2 text-xs">
                              mensagem excluída
                            </div>
                          ) : isEditing ? (
                            <div className="flex flex-col gap-1.5 w-full">
                              <textarea
                                data-testid={`chat-edit-input-${m.id}`}
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
                                className="bg-surface border border-primary px-3 py-2 text-xs resize-none focus:outline-none w-full"
                                rows={2}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { setEditingId(null); setEditDraft(""); }} className="text-[10px] text-text-secondary uppercase">Cancelar</button>
                                <button onClick={saveEdit} data-testid={`chat-edit-save-${m.id}`} className="text-[10px] text-primary uppercase font-bold">Salvar</button>
                              </div>
                            </div>
                          ) : (
                            <div className={`px-3 py-2 text-sm ${mine ? "bg-primary text-white" : "bg-surface border border-border"}`}>
                              {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                              {(m.attachments || []).map((a, i) => (
                                <div key={i} className="mt-1.5">
                                  {a.type === "image" ? (
                                    <a href={a.url} target="_blank" rel="noreferrer">
                                      <img src={a.url} alt="" className="max-w-[240px] max-h-[200px] object-cover rounded" />
                                    </a>
                                  ) : (
                                    <a
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`inline-flex items-center gap-2 text-xs underline ${mine ? "text-white" : "text-primary"}`}
                                    >
                                      <Paperclip size={12} /> {a.name}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5 px-1">
                            <p className="text-[10px] text-text-secondary">
                              {relativeTime(m.created_at)}
                              {m.edited_at && " · editada"}
                            </p>
                            {mine && !m.deleted && !isEditing && (
                              <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                {m.content && (
                                  <button
                                    data-testid={`chat-edit-${m.id}`}
                                    onClick={() => { setEditingId(m.id); setEditDraft(m.content); }}
                                    className="text-text-secondary hover:text-primary"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                )}
                                <button
                                  data-testid={`chat-del-${m.id}`}
                                  onClick={() => deleteMsg(m.id)}
                                  className="text-text-secondary hover:text-primary"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-border p-2.5 bg-surface">
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => sendAttachment(e.target.files?.[0])}
                  />
                  <button
                    data-testid="chat-attach-btn"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    title="Anexar"
                    className="text-text-secondary hover:text-primary p-1.5 disabled:opacity-50"
                  >
                    <Paperclip size={16} />
                  </button>
                  <textarea
                    data-testid="chat-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={uploading ? "Enviando arquivo..." : "Mensagem..."}
                    rows={1}
                    disabled={uploading}
                    className="flex-1 bg-background border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none max-h-32"
                  />
                  <button
                    data-testid="chat-send-btn"
                    onClick={send}
                    disabled={!draft.trim() || sending}
                    className="bg-primary hover:bg-primary-hover disabled:opacity-40 text-white p-2.5 transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
