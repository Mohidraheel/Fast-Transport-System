import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell, { PageTitle } from "../../components/PageShell";
import Table from "../../components/Table";
import { ConfirmModal, FormModal, StatusBadge, FormCard, Field, SectionBlock, inputStyle } from "../../components/ui";
import { btn, colors } from "../../theme";
import { getRoutes, createRoute, updateRoute, deleteRoute } from "../../services/transportService";

const actionBtn = { ...btn.ghost, padding: "7px 12px", fontSize: "12px" };

const routeLinkStyle = {
  color: colors.accent,
  fontWeight: 600,
  textDecoration: "none",
  borderBottom: `1px dotted ${colors.accent}`,
  cursor: "pointer",
};

function RoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ name: "", description: "" });
  const [pendingToggle, setPendingToggle] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRoutes = () =>
    getRoutes().then((res) => setRoutes(res.data)).catch(() => alert("Failed to fetch routes."));

  const handleToggle = (id, currentValue) => {
    if (currentValue) setPendingToggle({ id, currentValue });
    else doToggle(id, currentValue);
  };

  const doToggle = async (id, currentValue) => {
    try {
      await updateRoute(id, { is_active: !currentValue });
      fetchRoutes();
    } catch (err) {
      alert(`Failed to update route: ${JSON.stringify(err.response?.data || err.message)}`);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  useEffect(() => { fetchRoutes(); }, []);

  const handleEditOpen = (route) => {
    setEditingRoute(route);
    setEditForm({ name: route.name || "", description: route.description || "" });
  };

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value });

  const handleDelete = (route) => setPendingDelete(route);

  const confirmDelete = async () => {
    try {
      await deleteRoute(pendingDelete.id);
      setPendingDelete(null);
      fetchRoutes();
    } catch (err) {
      alert(`Failed to delete route: ${JSON.stringify(err.response?.data || err.message)}`);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name) { alert("Route name is required"); return; }
    setSavingEdit(true);
    try {
      await updateRoute(editingRoute.id, editForm);
      setEditingRoute(null);
      fetchRoutes();
    } catch (err) {
      alert(`Failed to update route: ${JSON.stringify(err.response?.data || err.message)}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { alert("Route name is required"); return; }
    try {
      await createRoute(form);
      setForm({ name: "", description: "" });
      fetchRoutes();
    } catch (err) {
      alert(`Failed to add route: ${JSON.stringify(err.response?.data || err.message)}`);
    }
  };

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (row) => (
        <Link to={`/admin/routes/${row.id}`} style={routeLinkStyle} title="View driver, bus and registered students">
          {row.name}
        </Link>
      ),
    },
    { key: "description", label: "Description" },
    {
      key: "is_active", label: "Status",
      render: (row) => <StatusBadge active={row.is_active} onClick={() => handleToggle(row.id, row.is_active)} />,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => handleEditOpen(row)} style={actionBtn}>Edit</button>
          <button onClick={() => handleDelete(row)} style={{ ...btn.danger, padding: "7px 12px", fontSize: "12px" }}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <PageShell role="staff" title="Admin — Routes">
      {pendingToggle && (
        <ConfirmModal
          title="Deactivate Route?"
          message="Setting this route to inactive will also automatically deactivate all corresponding assignments linked to it."
          confirmLabel="Yes, Deactivate"
          onConfirm={() => { doToggle(pendingToggle.id, pendingToggle.currentValue); setPendingToggle(null); }}
          onCancel={() => setPendingToggle(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Route?"
          message={`Deleting route ${pendingDelete.name} will remove its route stops, active assignments, and any registrations or change requests that point to it. This cannot be undone.`}
          confirmLabel="Yes, Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {editingRoute && (
        <FormModal
          title="Edit Route"
          sub="Update the route details. Activation is managed separately."
          submitLabel="Save Changes"
          loading={savingEdit}
          onClose={() => setEditingRoute(null)}
          onSubmit={handleEditSubmit}
          width="660px"
        >
          <Field label="Route Name" required flex="1 1 180px">
            <input name="name" placeholder="e.g. Gulshan Route" value={editForm.name} onChange={handleEditChange} style={inputStyle} />
          </Field>
          <Field label="Description" flex="2 1 300px">
            <input name="description" placeholder="Brief description" value={editForm.description} onChange={handleEditChange} style={inputStyle} />
          </Field>
        </FormModal>
      )}

      <PageTitle sub="Manage transport routes. Click a route name to see its bus, driver and registered students.">Routes</PageTitle>

      <FormCard title="Add New Route" onSubmit={handleSubmit} submitLabel="Add Route">
        <Field label="Route Name" required flex="1 1 160px">
          <input name="name" placeholder="e.g. Gulshan Route" value={form.name} onChange={handleChange} style={inputStyle} />
        </Field>
        <Field label="Description" flex="2 1 280px">
          <input name="description" placeholder="Brief description" value={form.description} onChange={handleChange} style={inputStyle} />
        </Field>
      </FormCard>

      <SectionBlock title="Active Routes">
        <Table columns={columns} rows={routes.filter(r => r.is_active)} emptyMessage="No active routes." />
      </SectionBlock>

      <SectionBlock title="Inactive Routes">
        <Table columns={columns} rows={routes.filter(r => !r.is_active)} emptyMessage="No inactive routes." />
      </SectionBlock>
    </PageShell>
  );
}

export default RoutesPage;