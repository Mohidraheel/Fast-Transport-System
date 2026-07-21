import { useEffect, useRef, useState } from "react";
import { colors, fonts, radius, shadow } from "../theme";
import { getNotifications } from "../services/transportService";

const LAST_SEEN_KEY = "notifications_last_seen";
const POLL_INTERVAL_MS = 15000;

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchNotifications = () => {
    getNotifications()
      .then((res) => setNotifications(res.data))
      .catch(() => {}); // silent — bell just stays empty if this fails
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Backend /api/notifications/ isn't scoped to the logged-in user (returns
  // everyone's notifications), so filter to "mine" here using the username
  // stored at login. Safe to keep even if the backend gets fixed later.
  const currentUsername = localStorage.getItem("username");
  const myNotifications = notifications.filter(
    (n) => n.user?.username === currentUsername
  );

  const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
  const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date(0);
  const unreadCount = myNotifications.filter(
    (n) => new Date(n.created_at) > lastSeenDate
  ).length;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // opening the dropdown marks everything currently loaded as "seen"
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }
  };

  const sorted = [...myNotifications].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button onClick={handleToggle} style={styles.bellBtn} aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>Notifications</div>
          <div style={styles.list}>
            {sorted.length === 0 && (
              <div style={styles.empty}>No notifications yet.</div>
            )}
            {sorted.slice(0, 15).map((n) => (
              <div
                key={n.id}
                style={{
                  ...styles.item,
                  borderLeft: n.type === "alert" ? "3px solid #dc2626" : "3px solid transparent",
                }}
              >
                <div style={styles.itemTitle}>{n.title}</div>
                <div style={styles.itemMessage}>{n.message}</div>
                <div style={styles.itemTime}>{timeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  bellBtn: {
    position: "relative",
    background: "transparent",
    border: `1px solid ${colors.borderLight}`,
    borderRadius: "9px",
    padding: "7px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.textSecondary,
  },
  badge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    background: "#dc2626",
    color: "#fff",
    fontSize: "10px",
    fontWeight: "700",
    borderRadius: "999px",
    minWidth: "16px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 3px",
    lineHeight: 1,
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    width: "340px",
    maxWidth: "90vw",
    background: "#fff",
    border: `1px solid ${colors.borderLight}`,
    borderRadius: radius.lg,
    boxShadow: shadow.navbar || "0 8px 24px rgba(11,45,66,0.14)",
    zIndex: 300,
    overflow: "hidden",
    fontFamily: fonts.body,
  },
  dropdownHeader: {
    padding: "12px 16px",
    fontWeight: "700",
    fontSize: "13px",
    color: colors.textPrimary,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  list: {
    maxHeight: "360px",
    overflowY: "auto",
  },
  empty: {
    padding: "20px 16px",
    fontSize: "13px",
    color: colors.textMuted,
    textAlign: "center",
  },
  item: {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  itemTitle: {
    fontSize: "13px",
    fontWeight: "600",
    color: colors.textPrimary,
  },
  itemMessage: {
    fontSize: "12.5px",
    color: colors.textSecondary,
    marginTop: "2px",
  },
  itemTime: {
    fontSize: "11px",
    color: colors.textMuted,
    marginTop: "4px",
  },
};

export default NotificationBell;
