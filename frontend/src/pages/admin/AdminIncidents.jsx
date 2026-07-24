import { useEffect, useState } from "react";
import PageShell, { PageTitle } from "../../components/PageShell";
import Table from "../../components/Table";
import { Pill } from "../../components/ui";
import { btn, colors } from "../../theme";
import api from "../../services/api";

function AdminIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [adminNotes, setAdminNotes] = useState({});
  const [processingId, setProcessingId] = useState(null);

  const fetchIncidents = () => {
    api.get("/api/incidents/")
      .then((res) => setIncidents(res.data))
      .catch(() => alert("Failed to fetch incidents."));
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      await api.post(`/api/incidents/${id}/approve/`);
      fetchIncidents();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to approve incident.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    const notes = (adminNotes[id] || "").trim();
    if (!notes) {
      alert("Please provide admin notes when rejecting an incident.");
      return;
    }
    setProcessingId(id);
    try {
      await api.post(`/api/incidents/${id}/reject/`, { admin_notes: notes });
      setAdminNotes(prev => ({ ...prev, [id]: "" }));
      fetchIncidents();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to reject incident.");
    } finally {
      setProcessingId(null);
    }
  };

  const statusVariant = (s) => (s === "Approved" ? "success" : s === "Rejected" ? "danger" : "warning");
  const isPending = (s) => s === "Pending";

  const columns = [
    { key: "student",     label: "Student" },
    { key: "type",        label: "Type" },
    { key: "severity",    label: "Severity" },
    { key: "location",    label: "Location" },
    { key: "description", label: "Description" },
    { key: "status",      label: "Status" },
    { key: "submitted",   label: "Submitted" },
    { key: "actions",     label: "Actions" },
  ];

  const rows = incidents
    .slice()
    .sort((a, b) => {
      const ap = isPending(a.status) ? 0 : 1;
      const bp = isPending(b.status) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return new Date(b.created_at) - new Date(a.created_at);
    })
    .map((inc) => {
      const studentName = inc.reported_by?.first_name || inc.reported_by?.username || "N/A";
      const pending = isPending(inc.status);

      return {
        id: inc.id,
        student: studentName,
        type: inc.incident_type_display,
        severity: (
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: "bold",
            color: inc.severity === "high" ? "#EF4444" : inc.severity === "medium" ? "#F97316" : "#F59E0B",
            background: inc.severity === "high" ? "#fee2e2" : inc.severity === "medium" ? "#ffedd5" : "#fef3c7"
          }}>
            {inc.severity.toUpperCase()}
          </span>
        ),
        location: `${parseFloat(inc.latitude).toFixed(4)}, ${parseFloat(inc.longitude).toFixed(4)} (${inc.radius_meters}m)`,
        description: inc.description || "-",
        status: <Pill label={inc.status} variant={statusVariant(inc.status)} />,
        submitted: new Date(inc.created_at).toLocaleString(),
        actions: pending ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "200px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => handleApprove(inc.id)}
                disabled={processingId === inc.id}
                style={{ ...btn.primary, flex: 1, padding: "6px", fontSize: "12px", background: colors.successText }}
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(inc.id)}
                disabled={processingId === inc.id}
                style={{ ...btn.primary, flex: 1, padding: "6px", fontSize: "12px", background: colors.dangerText }}
              >
                Reject
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Admin notes (required for rejection)"
              value={adminNotes[inc.id] || ""}
              onChange={(e) => setAdminNotes(prev => ({ ...prev, [inc.id]: e.target.value }))}
              style={{
                resize: "vertical",
                padding: "6px",
                border: `1px solid ${colors.borderMid}`,
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "inherit"
              }}
            />
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: colors.textMuted }}>
            {inc.status === "Approved" ? "Approved ✓" : "Rejected ✗"}
            {inc.admin_notes && (
              <div style={{ marginTop: "4px", fontStyle: "italic", fontSize: "11px" }}>
                Notes: {inc.admin_notes}
              </div>
            )}
          </div>
        ),
      };
    });

  return (
    <PageShell role="staff" title="Admin — Incidents">
      <PageTitle sub="Review and approve student incident reports for the live map.">Incident Reports</PageTitle>
      <Table columns={columns} rows={rows} />
    </PageShell>
  );
}

export default AdminIncidents;
