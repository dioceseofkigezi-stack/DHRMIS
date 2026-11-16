import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";

interface NotificationRecord {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  internal_path: string | null;
  is_read: boolean;
  created_at: string;
}

function isInternalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

export default function NotificationCenter() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const unreadCount = items.filter((item) => !item.is_read).length;

  async function loadNotifications() {
    if (!supabase || !session?.user.id) return;
    setLoading(true);
    const { data, error } = await supabase.from("user_notifications").select("id,category,severity,title,body,internal_path,is_read,created_at")
      .eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20);
    if (error) {
      setUnavailable(true);
      setItems([]);
    } else {
      setUnavailable(false);
      setItems((data ?? []) as NotificationRecord[]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadNotifications(); }, [session?.user.id]);
  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function openNotification(item: NotificationRecord) {
    if (!item.is_read && supabase) {
      const { error } = await supabase.from("user_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", item.id);
      if (!error) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
    }
    setOpen(false);
    if (isInternalPath(item.internal_path)) navigate(item.internal_path);
  }

  return (
    <div className="notification-center" ref={container}>
      <button type="button" className="notification-trigger" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} aria-controls="notification-panel" onClick={() => { setOpen((value) => !value); if (!open) void loadNotifications(); }}>
        <Icon name="bell" size={18} />{unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
        <header className="notification-panel-heading"><div><strong>Notifications</strong><small>{unreadCount} unread</small></div><button type="button" className="text-button" onClick={() => void loadNotifications()} disabled={loading}><Icon name="refresh" size={13} />Refresh</button></header>
        {loading ? <p className="notification-empty" role="status">Loading notifications…</p> : unavailable ? <p className="notification-empty" role="status">Notifications are unavailable. Contact your administrator if this continues.</p> : items.length === 0 ? <p className="notification-empty">You’re all caught up.</p> : <ul className="notification-list">{items.map((item) => <li key={item.id}><button type="button" className={`notification-item${item.is_read ? "" : " notification-item-unread"}`} onClick={() => void openNotification(item)}><span className={`notification-severity notification-severity-${item.severity.toLowerCase()}`} aria-hidden="true" /><span className="notification-copy"><strong>{item.title}</strong><small>{item.body}</small><time dateTime={item.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))} · {item.category}</time></span><Icon name="arrowRight" size={15} className="notification-arrow" /></button></li>)}</ul>}
      </section>}
    </div>
  );
}
