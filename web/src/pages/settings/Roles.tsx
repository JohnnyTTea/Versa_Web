// src/pages/settings/SettingsRoles.tsx
import { useEffect, useMemo, useState } from "react";
import "../../styles/settings.css";

type Me = { username: string; role_name: string };

type MeResp = {
  ok: boolean;
  user?: Me;
};

type RoleRow = {
  id: number;
  role_name: string;
  description: string;
  can_product: number;
  can_sales: number;
  can_purchase: number;
  can_dto: number;
  can_modify: number;
  can_report: number;
  can_inventory: number;
  can_review: number;
  can_settings: number;
};

const menus = [
  { key: "product", label: "Product Search" },
  { key: "sales", label: "Sales Order" },
  { key: "purchase", label: "Purchase" },
  { key: "dto", label: "DTO Process" },
  { key: "modify", label: "Data Modification" },
  { key: "report", label: "Report Download" },
  { key: "inventory", label: "Inventory Manage" },
  { key: "review", label: "Pending Review" },
  { key: "settings", label: "System Settings" },
] as const;

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} failed`);
  return res.json();
}
async function apiPost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed`);
  return res.json();
}

export default function Roles() {
  const [me, setMe] = useState<Me | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingIds, setEditingIds] = useState<Record<number, boolean>>({});
  const [backupById, setBackupById] = useState<Record<number, RoleRow>>({});
  const [newRowOn, setNewRowOn] = useState(false);
  const [newRole, setNewRole] = useState<{
    role_name: string;
    description: string;
    perm: Record<string, boolean>;
  }>({
    role_name: "",
    description: "",
    perm: {},
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const meResp = await apiGet<MeResp>("/api/me");
        if (!meResp.ok || !meResp.user) {
          setMe(null);
          setRoles([]);
          return;
        }
        setMe(meResp.user);
        const data = await apiGet<{ roles: RoleRow[] }>("/api/settings/roles");
        setRoles(data.roles || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isSuperAdmin = useMemo(() => {
    if (!me) return false;
    if (me.username === "admin") return true;
    return (me.role_name || "").trim().toLowerCase() === "admin";
  }, [me]);

  const sessionUser = me?.username || "";
  const sessionRole = me?.role_name || "";

  function setRoleField(id: number, patch: Partial<RoleRow>) {
    setRoles((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...patch } as RoleRow) : r)));
  }

  function startEdit(r: RoleRow) {
    setEditingIds((m) => ({ ...m, [r.id]: true }));
    setBackupById((m) => ({ ...m, [r.id]: r }));
  }

  function cancelEdit(id: number) {
    const b = backupById[id];
    if (b) setRoles((prev) => prev.map((r) => (r.id === id ? b : r)));
    setEditingIds((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
    setBackupById((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
  }

  async function saveRole(id: number) {
    const r = roles.find((x) => x.id === id);
    if (!r) return;
    if (!r.role_name.trim()) {
      alert("Role Name 不能为空");
      return;
    }

    const payload: any = {
      id: r.id,
      role_name: r.role_name.trim(),
      description: (r.description || "").trim(),
      perm: {},
    };
    for (const m of menus) {
      const field = `can_${m.key}` as keyof RoleRow;
      payload.perm[m.key] = (r[field] ? 1 : 0);
    }

    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/roles/save",
      payload
    );
    if (!resp.ok) {
      alert(resp.message || "Save failed");
      return;
    }

    const data = await apiGet<{ roles: RoleRow[] }>("/api/settings/roles");
    setRoles(data.roles || []);

    setEditingIds((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
    setBackupById((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
  }

  async function deleteRole(r: RoleRow) {
    if (!confirm("确定要删除该角色？")) return;
    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/roles/delete",
      { id: r.id }
    );
    if (!resp.ok) {
      alert(resp.message || "Delete failed");
      return;
    }
    const data = await apiGet<{ roles: RoleRow[] }>("/api/settings/roles");
    setRoles(data.roles || []);
  }

  async function saveNewRole() {
    const name = newRole.role_name.trim();
    if (!name) {
      alert("Role Name 不能为空");
      return;
    }

    const perm: any = {};
    for (const m of menus) perm[m.key] = newRole.perm[m.key] ? 1 : 0;

    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/roles/save",
      { id: 0, role_name: name, description: newRole.description.trim(), perm }
    );
    if (!resp.ok) {
      alert(resp.message || "Create failed");
      return;
    }

    const data = await apiGet<{ roles: RoleRow[] }>("/api/settings/roles");
    setRoles(data.roles || []);

    setNewRowOn(false);
    setNewRole({ role_name: "", description: "", perm: {} });
  }

  if (loading)
    return <div className="container user-management progressive-enter">Loading...</div>;

  return (
    <div className="container user-management progressive-enter">
      <div className="roles-header">
        <div>
          <h2>角色管理（Roles Management）</h2>
          <p>
            当前登录用户：<strong>{sessionUser}</strong>（角色：{sessionRole}）
          </p>
        </div>

        {isSuperAdmin && !newRowOn ? (
          <div className="roles-actions">
            <button
              type="button"
              className="save-btn"
              onClick={() => setNewRowOn(true)}
            >
              +添加新角色
            </button>
          </div>
        ) : null}
      </div>

      <div className="table-wrapper role-table-wrapper">
        <table className="user-table role-table">
          <thead>
            <tr>
              <th rowSpan={2}>ID</th>
              <th rowSpan={2}>Role Name</th>
              <th rowSpan={2}>Description</th>
              <th colSpan={menus.length} className="menu-permissions">
                菜单权限
                <br />
                <span className="en" style={{ fontSize: 11, color: "#6b7280" }}>
                  Menu Permissions
                </span>
              </th>
              <th rowSpan={2} className="action-col">
                Action
              </th>
              <th rowSpan={2} className="remove-col">
                Remove Role
              </th>
            </tr>
            <tr>
              {menus.map((m) => (
                <th key={m.key} className="permission-col">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {roles.map((r, idx) => {
              const isAdminRole = (r.role_name || "").toLowerCase() === "admin";
              const isEditing = !!editingIds[r.id];

              return (
                <tr key={r.id}>
                  <td>{idx + 1}</td>

                  <td>
                    {isAdminRole || !isSuperAdmin ? (
                      <input className="compact-input" value={r.role_name} readOnly />
                    ) : (
                      <input
                        className={`compact-input ${isEditing ? "editable editing" : "editable"}`}
                        value={r.role_name}
                        readOnly={!isEditing}
                        onChange={(e) =>
                          setRoleField(r.id, { role_name: e.target.value })
                        }
                      />
                    )}
                  </td>

                  <td>
                    {isAdminRole || !isSuperAdmin ? (
                      <input className="compact-input" value={r.description || ""} readOnly />
                    ) : (
                      <input
                        className={`compact-input ${isEditing ? "editable editing" : "editable"}`}
                        value={r.description || ""}
                        readOnly={!isEditing}
                        onChange={(e) =>
                          setRoleField(r.id, { description: e.target.value })
                        }
                      />
                    )}
                  </td>

                  {menus.map((m) => {
                    const field = `can_${m.key}` as keyof RoleRow;
                    const checked = !!r[field];

                    return (
                      <td key={m.key} className="permission-col">
                        {isAdminRole || !isSuperAdmin ? (
                          <input type="checkbox" checked={checked} disabled readOnly />
                        ) : (
                          <input
                            type="checkbox"
                            className={`perm-checkbox ${isEditing ? "editable editing" : "editable"}`}
                            checked={checked}
                            disabled={!isEditing}
                            onChange={(e) =>
                              setRoleField(r.id, { [field]: e.target.checked ? 1 : 0 } as any)
                            }
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="action-col">
                    {isSuperAdmin && !isAdminRole ? (
                      !isEditing ? (
                        <button
                          type="button"
                          className="modify-btn"
                          onClick={() => startEdit(r)}
                        >
                          Modify
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="save-btn"
                            onClick={() => saveRole(r.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="cancel-btn"
                            onClick={() => cancelEdit(r.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )
                    ) : (
                      "无权限"
                    )}
                  </td>

                  <td className="remove-col">
                    {isSuperAdmin && !isAdminRole ? (
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => deleteRole(r)}
                      >
                        ✖
                      </button>
                    ) : (
                      "无权限"
                    )}
                  </td>
                </tr>
              );
            })}

            {/* 新增角色行 */}
            {isSuperAdmin && newRowOn && (
              <tr>
                <td>New</td>
                <td>
                  <input
                    className="compact-input editable editing"
                    value={newRole.role_name}
                    onChange={(e) =>
                      setNewRole((s) => ({ ...s, role_name: e.target.value }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="compact-input editable editing"
                    value={newRole.description}
                    onChange={(e) =>
                      setNewRole((s) => ({ ...s, description: e.target.value }))
                    }
                  />
                </td>

                {menus.map((m) => (
                  <td key={m.key} className="permission-col">
                    <input
                      type="checkbox"
                      className="perm-checkbox editable editing"
                      checked={!!newRole.perm[m.key]}
                      onChange={(e) =>
                        setNewRole((s) => ({
                          ...s,
                          perm: { ...s.perm, [m.key]: e.target.checked },
                        }))
                      }
                    />
                  </td>
                ))}

                <td className="action-col">
                  <button type="button" className="save-btn" onClick={saveNewRole}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setNewRowOn(false);
                      setNewRole({ role_name: "", description: "", perm: {} });
                    }}
                  >
                    Cancel
                  </button>
                </td>
                <td className="remove-col">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
