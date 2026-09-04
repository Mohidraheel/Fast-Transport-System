import { useCallback, useEffect, useState } from "react";
import PageShell, { PageTitle } from "../../components/PageShell";
import Table from "../../components/Table";
import { ConfirmModal, FormModal, FormCard, Field } from "../../components/ui";
import { inputStyle, selectStyle } from "../../styles/formStyles";
import { btn } from "../../theme";
import { getRoutes, getStops, getRouteStops, createRouteStop, updateRouteStop, deleteRouteStop } from "../../services/transportService";

const EMPTY_FORM = { route: "", stop: "", stop_order: 1, morning_eta: "", evening_eta: "" };

function RouteStopsPage() {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [routeStops, setRouteStops] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingRouteStop, setEditingRouteStop] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [r, s, rs] = await Promise.all([getRoutes(), getStops(), getRouteStops()]);
      setRoutes(r.data); setStops(s.data); setRouteStops(rs.data);
    } catch { alert("Failed to load route stops."); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleEditOpen = (routeStop) => {
    setEditingRouteStop(routeStop);
    setEditForm({
      route: routeStop.route ?? "",
      stop: routeStop.stop ?? "",
      stop_order: routeStop.stop_order ?? 1,
      morning_eta: routeStop.morning_eta || "",
      evening_eta: routeStop.evening_eta || "",
    });
  };

  const handleEditChange = (e) => setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.route || !editForm.stop) { alert("Please select a route and a stop."); return; }
    setSavingEdit(true);
    try {
      await updateRouteStop(editingRouteStop.id, {
        route: editForm.route,
        stop: editForm.stop,
        stop_order: Number(editForm.stop_order),
        morning_eta: editForm.morning_eta || null,
        evening_eta: editForm.evening_eta || null,
      });
      setEditingRouteStop(null);
      await fetchData();
    } catch {
      alert("Failed to update route stop.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.route || !form.stop) { alert("Please select a route and a stop."); return; }
    setLoading(true);
    try {
      await createRouteStop({
        route: form.route, stop: form.stop,
        stop_order: Number(form.stop_order),
        morning_eta: form.morning_eta || null,
        evening_eta: form.evening_eta || null,
      });
      setForm(EMPTY_FORM);
      await fetchData();
    } catch { alert("Failed to create route stop."); }
    finally { setLoading(false); }
  };

  const handleDelete = (routeStop) => setPendingDelete(routeStop);

  const confirmDelete = async () => {
    try {
      await deleteRouteStop(pendingDelete.id);
      setPendingDelete(null);
      await fetchData();
    } catch {
      alert("Failed to delete route stop.");
    }
  };

  const columns = [
    { key: "route_name", label: "Route" },
    { key: "stop_name",  label: "Stop" },
    { key: "stop_order", label: "Order" },
    { key: "morning_eta", label: "Morning ETA" },
    { key: "evening_eta", label: "Evening ETA" },
    {
      key: "actions", label: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => handleEditOpen(row)}
            style={{ ...btn.ghost, padding: "5px 12px", fontSize: "12px" }}
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(row)}
            style={{ ...btn.danger, padding: "5px 12px", fontSize: "12px" }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell role="staff" title="Admin — Route Stops">
      <PageTitle sub="Assign stops to routes and configure ETAs.">Route Stops</PageTitle>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Route Stop?"
          message={`Deleting this route-stop mapping only removes the mapping itself, but it may affect route display and ETA information elsewhere in the app. This cannot be undone.`}
          confirmLabel="Yes, Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {editingRouteStop && (
        <FormModal
          title="Edit Route Stop"
          sub="Update the route-stop mapping and ETA details."
          submitLabel="Save Changes"
          loading={savingEdit}
          onClose={() => setEditingRouteStop(null)}
          onSubmit={handleEditSubmit}
          width="760px"
        >
          <Field label="Route" required flex="1 1 170px">
            <select name="route" value={editForm.route} onChange={handleEditChange} style={selectStyle}>
              <option value="">Select Route</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Stop" required flex="1 1 170px">
            <select name="stop" value={editForm.stop} onChange={handleEditChange} style={selectStyle}>
              <option value="">Select Stop</option>
              {stops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Stop Order" flex="0 1 90px">
            <input name="stop_order" type="number" min={1} value={editForm.stop_order} onChange={handleEditChange} style={inputStyle} />
          </Field>
          <Field label="Morning ETA" flex="0 1 130px">
            <input name="morning_eta" type="time" value={editForm.morning_eta} onChange={handleEditChange} style={inputStyle} />
          </Field>
          <Field label="Evening ETA" flex="0 1 130px">
            <input name="evening_eta" type="time" value={editForm.evening_eta} onChange={handleEditChange} style={inputStyle} />
          </Field>
        </FormModal>
      )}

      <FormCard title="Assign Stop to Route" onSubmit={handleSubmit} submitLabel={loading ? "Adding…" : "Add Route Stop"} loading={loading}>
        <Field label="Route" required flex="1 1 160px">
          <select name="route" value={form.route} onChange={handleChange} style={selectStyle}>
            <option value="">Select Route</option>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Stop" required flex="1 1 160px">
          <select name="stop" value={form.stop} onChange={handleChange} style={selectStyle}>
            <option value="">Select Stop</option>
            {stops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Stop Order" flex="0 1 90px">
          <input name="stop_order" type="number" min={1} value={form.stop_order} onChange={handleChange} style={inputStyle} />
        </Field>
        <Field label="Morning ETA" flex="0 1 130px">
          <input name="morning_eta" type="time" value={form.morning_eta} onChange={handleChange} style={inputStyle} />
        </Field>
        <Field label="Evening ETA" flex="0 1 130px">
          <input name="evening_eta" type="time" value={form.evening_eta} onChange={handleChange} style={inputStyle} />
        </Field>
      </FormCard>

      <Table columns={columns} rows={routeStops} />
    </PageShell>
  );
}

export default RouteStopsPage;
