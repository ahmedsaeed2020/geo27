import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { getSettings, openShellDialog, useSettings } from "@/lib/userSettings";
import { useLang } from "@/i18n";
import { eventSubject, notificationSubject, notificationType } from "@/lib/activityFeed";

/** Notification sound (frappe.utils.play_sound "alert"); suppressed by User Settings › Preferences › Mute sounds. */
export function playNotificationSound() {
  const w = window as unknown as { __digitSounds?: number; __digitMuted?: number };
  if (getSettings().mute_sounds) { w.__digitMuted = (w.__digitMuted ?? 0) + 1; return; }
  w.__digitSounds = (w.__digitSounds ?? 0) + 1;
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.12);
  } catch { /* audio unavailable */ }
}

const SLUG: Record<string, string> = {};
const slug = (dt: string) => (SLUG[dt] ??= dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"));

/** Notifications panel (frappe/public/js/frappe/ui/notifications/notifications.js): Notifications / Events / Today's events. */
export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  useStoreVersion();
  const s = useSettings();
  const lang = useLang();
  const [tab, setTab] = useState<"n" | "e" | "t">("n");
  const today = new Date().toISOString().slice(0, 10);
  const me = useSessionUser();
  const logs = adapter.list("Notification Log").filter((n) => n["for_user"] === me).sort((a, b) => String(b["creation"]).localeCompare(String(a["creation"])));
  const events = adapter.list("Event").sort((a, b) => String(a["starts_on"]).localeCompare(String(b["starts_on"])));
  const todays = events.filter((e) => String(e["starts_on"]).startsWith(today));
  const unread = logs.filter((n) => !n["read"]).length;
  const tabBtn = (id: typeof tab, label: string, n?: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`border-b-2 px-2 py-1.5 text-sm ${tab === id ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
      <span>{label}</span>{n ? <span className="ms-1 chip bg-primary/15 text-primary" data-no-i18n>{n}</span> : null}
    </button>
  );
  return createPortal(
    <div data-notifications-panel role="dialog" aria-label="Notifications" className="fixed start-[17rem] top-16 z-50 w-96 rounded-lg border border-border bg-popover shadow-xl">
      <div className="flex items-center gap-1 border-b border-border px-3">
        {tabBtn("n", "Notifications", unread)}{tabBtn("e", "Events")}{tabBtn("t", "Today's Events", todays.length)}
        <button type="button" aria-label="Close" className="ms-auto px-1 text-muted-foreground" onClick={onClose}>×</button>
      </div>
      {!s.allow_notifications && <p className="px-3 py-2 text-xs text-warning">Notifications are turned off</p>}
      <div className="max-h-96 overflow-auto p-1">
        {tab === "n" && logs.map((n) => (
          <div key={n.name} data-notification={n.name} data-read={n["read"] ? 1 : 0} className={`flex gap-2 rounded px-2 py-2 text-sm ${n["read"] ? "text-muted-foreground" : "bg-primary/5"}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n["read"] ? "bg-transparent" : "bg-primary"}`} />
            <div className="min-w-0 flex-1">
              <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(String(n["document_type"])), name: String(n["document_name"]) }} onClick={() => { adapter.update("Notification Log", n.name, { read: 1 }); onClose(); }} className="hover:underline" data-no-i18n>{notificationSubject(n, lang)}</Link>
              <div className="text-[11px] text-muted-foreground"><span data-no-i18n>{notificationType(String(n["type"]), lang)}</span> · <span data-no-i18n>{String(n["creation"]).slice(0, 16).replace("T", " ")}</span></div>
            </div>
            {!n["read"] && <button type="button" className="self-start text-xs text-primary" onClick={() => adapter.update("Notification Log", n.name, { read: 1 })}>Mark as Read</button>}
          </div>
        ))}
        {tab === "n" && !logs.length && <p className="p-4 text-center text-sm text-muted-foreground">No new notifications</p>}
        {(tab === "e" ? events : tab === "t" ? todays : []).map((e) => (
          <div key={e.name} data-event={e.name} className="rounded px-2 py-2 text-sm">
            <div data-no-i18n>{eventSubject(e, lang)}</div>
            <div className="text-[11px] text-muted-foreground" data-no-i18n>{String(e["starts_on"]).slice(0, 16)}</div>
          </div>
        ))}
        {tab !== "n" && !(tab === "e" ? events : todays).length && <p className="p-4 text-center text-sm text-muted-foreground">No Upcoming Events</p>}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
        <button type="button" data-mark-all className="text-primary disabled:opacity-50" disabled={!unread} onClick={() => logs.filter((n) => !n["read"]).forEach((n) => adapter.update("Notification Log", n.name, { read: 1 }))}>Mark all as read</button>
        <button type="button" className="text-primary" onClick={() => { onClose(); openShellDialog("settings", "Preferences"); }}>Notification Settings</button>
      </div>
    </div>,
    document.body,
  );
}

/** Bell entry in the module sidebar with unread count; plays the sound once per session when unread exist. */
export function useUnreadNotifications() {
  useStoreVersion();
  const me = useSessionUser();
  const unread = adapter.list("Notification Log").filter((n) => n["for_user"] === me && !n["read"]).length;
  const played = useRef(false);
  useEffect(() => {
    if (played.current || !unread || sessionStorage.getItem("digit-virtual-core:sound")) return;
    played.current = true; sessionStorage.setItem("digit-virtual-core:sound", "1"); playNotificationSound();
  }, [unread]);
  return unread;
}
