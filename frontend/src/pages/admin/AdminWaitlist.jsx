import { useEffect, useState, useCallback } from "react";
import PageShell, { PageTitle } from "../../components/PageShell";
import Table from "../../components/Table";
import { Pill, Spinner, Banner, ConfirmModal } from "../../components/ui";
import { btn, colors, fonts } from "../../theme";
import { getWaitlistOverview, fillEmptySeats } from "../../services/transportService";

export default function AdminWaitlist() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingFill, setPendingFill] = useState(null); // route object, or "all"
  const [working, setWorking] = useState(false);
  // Which route sections are open. Routes with people waiting start expanded;
  // the rest stay collapsed so a long fleet stays readable.
  const [openRoutes, setOpenRoutes] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    getWaitlistOverview()
      .then((res) => {
        setData(res.data);
        setError("");
        setOpenRoutes((previous) => {
          const next = { ...previous };
          for (const route of res.data.routes || []) {
            if (next[route.route_id] === undefined) {
              next[route.route_id] = route.queue_length > 0;
            }
          }
          return next;
        });
      })
      .catch(() => setError("Failed to load the waiting list."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const runFill = async () => {
    setWorking(true);
    try {
      const routeId = pendingFill === "all" ? undefined : pendingFill.route_id;
      const res = await fillEmptySeats(routeId);
      setNotice(res.data.detail);
      setPendingFill(null);
      load();
    } catch {
      setError("Could not seat students from the waiting list.");
      setPendingFill(null);
    } finally {
      setWorking(false);
    }
  };

  const columns = [
    {
      key: "position",
      label: "#",
      render: (r) => <strong style={{ color: colors.accent }}>{r.position}</strong>,
    },
    { key: "roll_number", label: "Roll Number", render: (r) => <strong>{r.roll_number}</strong> },
    { key: "name", label: "Name" },
    { key: "stop", label: "Stop" },
    { key: "phone", label: "Phone" },
    {
      key: "added_at",
      label: "Joined",
      render: (r) => new Date(r.added_at).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      render: (r) =>
        r.status === "offered"
          ? <Pill label="Seat offered" variant="info" />
          : <Pill label="Waiting" variant="warning" />,
    },
  ];

  if (loading) {
    return (
      <PageShell role="staff" title="Admin — Waiting List">
        <Spinner />
      </PageShell>
    );
  }

  const routes = data?.routes ?? [];
  const totalWaiting = routes.reduce((sum, r) => sum + r.queue_length, 0);
  const totalFree = routes.reduce((sum, r) => sum + r.free_seats, 0);
  // Somebody is queued on a route that has room — the interesting case.
  const seatable = routes.filter((r) => r.free_seats > 0 && r.queue_length > 0);

  return (
    <PageShell role="staff" title="Admin — Waiting List">
      {pendingFill && (
        <ConfirmModal
          title="Seat students from the waiting list?"
          message={
            pendingFill === "all"
              ? "Every route with free seats will have students seated from the front of its queue. Each gets a challan and a payment deadline."
              : `Students at the front of the ${pendingFill.route_name} queue will be seated into its ${pendingFill.free_seats} free seat(s). Each gets a challan and a payment deadline.`
          }
          confirmLabel={working ? "Working…" : "Yes, seat them"}
          danger={false}
          onConfirm={runFill}
          onCancel={() => setPendingFill(null)}
        />
      )}

      <PageTitle sub="Students waiting for a seat, queued separately per route.">
        Waiting List
      </PageTitle>

      {error && <Banner variant="danger">{error}</Banner>}
      {notice && <Banner variant="success">{notice}</Banner>}

      {seatable.length > 0 && (
        <Banner variant="warning">
          <strong>
            {seatable.length === 1
              ? "1 route has free seats with students still waiting."
              : `${seatable.length} routes have free seats with students still waiting.`}
          </strong>
          <div style={{ marginTop: 4 }}>
            Seats normally fill automatically when one is released. Capacity added
            by raising a bus's size or assigning another bus does not trigger that,
            so it can be filled manually here.
          </div>
          <button
            onClick={() => setPendingFill("all")}
            style={{ ...btn.primary, marginTop: 10 }}
          >
            Seat everyone possible
          </button>
        </Banner>
      )}

      <div style={statGrid}>
        <Stat label="Semester" value={data?.semester || "—"} small />
        <Stat label="Waiting" value={totalWaiting} />
        <Stat label="Free Seats" value={totalFree} tone={totalFree > 0 ? colors.successText : undefined} />
        <Stat label="Routes" value={routes.length} />
      </div>

      {routes.length === 0 && (
        <Banner variant="info">No active routes for this semester.</Banner>
      )}

      {routes.length > 1 && (
        <div style={expandBar}>
          <button
            onClick={() =>
              setOpenRoutes(Object.fromEntries(routes.map((r) => [r.route_id, true])))
            }
            style={linkBtn}
          >
            Expand all
          </button>
          <span style={{ color: colors.borderMid }}>|</span>
          <button
            onClick={() =>
              setOpenRoutes(Object.fromEntries(routes.map((r) => [r.route_id, false])))
            }
            style={linkBtn}
          >
            Collapse all
          </button>
        </div>
      )}

      {routes.map((route) => {
        const open = Boolean(openRoutes[route.route_id]);
        return (
          <div key={route.route_id} style={panel}>
            <button
              onClick={() =>
                setOpenRoutes((prev) => ({ ...prev, [route.route_id]: !prev[route.route_id] }))
              }
              style={panelHeader}
              aria-expanded={open}
            >
              <span style={{
                ...chevron,
                transform: open ? "rotate(90deg)" : "rotate(0deg)",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>

              <span style={routeTitle}>{route.route_name}</span>

              <span style={metaText}>
                Bus {route.buses.join(", ") || "unassigned"} ·{" "}
                {route.occupied}/{route.capacity} seats taken
              </span>

              <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {route.queue_length > 0 && (
                  <Pill label={`${route.queue_length} waiting`} variant="warning" />
                )}
                <Pill
                  label={`${route.free_seats} free`}
                  variant={route.free_seats > 0 ? "success" : "neutral"}
                />
                {route.free_seats > 0 && route.queue_length > 0 && (
                  <Pill label="Seats available" variant="danger" />
                )}
              </span>
            </button>

            {open && (
              <div style={panelBody}>
                {route.free_seats > 0 && route.queue_length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      onClick={() => setPendingFill(route)}
                      style={{ ...btn.primary, fontSize: 12, padding: "7px 14px" }}
                    >
                      Seat next {Math.min(route.free_seats, route.queue_length)} from this queue
                    </button>
                  </div>
                )}
                <Table
                  columns={columns}
                  rows={route.queue}
                  emptyMessage={
                    route.free_seats > 0
                      ? "Nobody waiting — this route still has seats available."
                      : "Nobody waiting on this route."
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </PageShell>
  );
}

function Stat({ label, value, tone, small }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={{
        ...statValue,
        ...(small ? { fontSize: 16 } : {}),
        ...(tone ? { color: tone } : {}),
      }}>
        {value}
      </div>
    </div>
  );
}

const expandBar = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginBottom: 10,
  fontSize: 12,
};

const linkBtn = {
  background: "transparent",
  border: "none",
  color: colors.accent,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
  fontFamily: fonts.body,
};

const panel = {
  background: "#fff",
  border: `1px solid ${colors.borderLight}`,
  borderRadius: 12,
  marginBottom: 12,
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(11,45,66,0.06)",
};

const panelHeader = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "14px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: fonts.body,
};

const chevron = {
  display: "inline-flex",
  color: colors.textSecondary,
  transition: "transform 0.15s ease",
};

const routeTitle = {
  fontSize: 15,
  fontWeight: 700,
  color: colors.textPrimary,
  fontFamily: fonts.heading,
};

const metaText = {
  fontSize: 12,
  color: colors.textMuted,
};

const panelBody = {
  padding: "0 16px 16px",
  borderTop: `1px solid ${colors.borderLight}`,
};

const statGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 20,
};

const statCard = {
  background: "#fff",
  border: `1px solid ${colors.borderLight}`,
  borderRadius: 12,
  padding: "16px 18px",
  boxShadow: "0 1px 3px rgba(11,45,66,0.06)",
};

const statLabel = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: colors.textSecondary,
  marginBottom: 6,
};

const statValue = {
  fontSize: 24,
  fontWeight: 700,
  color: colors.textPrimary,
  fontFamily: fonts.heading,
  lineHeight: 1.15,
};
