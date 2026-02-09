// src/pages/settings/SettingsUsers.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/settings.css";

type Role = { id: number; role_name: string };

type UserRow = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  password?: string; // 超管返回真实密码；非超管不返回或空
  created_time: string;
  role_id: number;
  role_name: string;
  is_active: number; // 1/0
};

type PermKey =
  | "product"
  | "sales"
  | "purchase"
  | "dto"
  | "modify"
  | "report"
  | "inventory"
  | "review"
  | "settings";

type Me = {
  id: number;
  username: string;
  role_id: number;
  role_name: string;
  perms?: Partial<Record<PermKey, boolean>>;
};

type MeResp = {
  ok: boolean;
  user?: Me;
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`GET ${url} failed:`, res.status, txt);
    throw new Error(`GET ${url} failed (${res.status})`);
  }
  return res.json();
}

async function apiPost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`POST ${url} failed:`, res.status, txt);
    throw new Error(`POST ${url} failed (${res.status})`);
  }
  return res.json();
}

function formatCreatedTime(value: string) {
  if (!value) return "";
  return value
    .replace("T", " ")
    .replace(/\.?\d*Z$/, "")
    .trim();
}

export default function Users() {
  const [me, setMe] = useState<Me | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);

  // 编辑态：按 id 存草稿 + 备份（Cancel 回滚）
  const [editingIds, setEditingIds] = useState<Record<number, boolean>>({});
  const [, setDraftById] = useState<Record<number, Partial<UserRow>>>(
    {}
  );
  const [backupById, setBackupById] = useState<Record<number, UserRow>>({});

  // 新增行
  const [newRow, setNewRow] = useState<{
    enabled: boolean;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    role_id: number | "";
  }>({
    enabled: false,
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    role_id: "",
  });

  function resetNewRow() {
    setNewRow({
      enabled: false,
      username: "",
      password: "",
      first_name: "",
      last_name: "",
      role_id: "",
    });
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const meResp = await apiGet<MeResp>("/api/me");

        if (!meResp.ok || !meResp.user) {
          // ✅ 没登录：不要继续打 settings/users（否则 401）
          setMe(null);
          setRoles([]);
          setUsers([]);
          return;
        }

        setMe(meResp.user);

        // 可选：如果你想基于 perms 控制 settings 页面访问
        // if (meResp.user.perms?.settings === false) {
        //   setRoles([]);
        //   setUsers([]);
        //   return;
        // }

        const data = await apiGet<{ roles: Role[]; users: UserRow[] }>(
          "/api/settings/users"
        );
        setRoles(data.roles || []);
        setUsers(data.users || []);
      } catch (e: any) {
        console.error(e);
        alert(e?.message || "加载失败");
        setMe(null);
        setRoles([]);
        setUsers([]);
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
  const totalCount = users.length;
  const enabledCount = users.filter((u) => !!u.is_active).length;
  const disabledCount = totalCount - enabledCount;

  function startEdit(u: UserRow) {
    setEditingIds((m) => ({ ...m, [u.id]: true }));
    setBackupById((m) => ({ ...m, [u.id]: u }));
    setDraftById((m) => ({
      ...m,
      [u.id]: {
        username: u.username,
        password: u.password || "",
        first_name: u.first_name,
        last_name: u.last_name,
        role_id: u.role_id,
      },
    }));
  }

  function cancelEdit(id: number) {
    const backup = backupById[id];
    if (backup) {
      setUsers((prev) => prev.map((x) => (x.id === id ? backup : x)));
    }
    setEditingIds((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
    setDraftById((m) => {
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

  function updateDraft(id: number, patch: Partial<UserRow>) {
    setDraftById((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
    setUsers((prev) =>
      prev.map((x) => (x.id === id ? ({ ...x, ...patch } as UserRow) : x))
    );
  }

  async function reloadUsers() {
    const data = await apiGet<{ roles: Role[]; users: UserRow[] }>(
      "/api/settings/users"
    );
    setRoles(data.roles || []);
    setUsers(data.users || []);
  }

  async function saveUser(id: number) {
    const u = users.find((x) => x.id === id);
    if (!u) return;

    // 超管保存必须有 password（跟 PHP 一致）
    if (isSuperAdmin && u.username !== "admin") {
      if (!(u.password || "").trim()) {
        alert("Password 不能为空");
        return;
      }
      if (!(u.username || "").trim()) {
        alert("Username 不能为空");
        return;
      }
    }

    const payload = {
      id: u.id,
      username: u.username,
      password: isSuperAdmin ? u.password || "" : undefined,
      first_name: u.first_name,
      last_name: u.last_name,
      role_id: u.role_id,
    };

    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/users/save",
      payload
    );
    if (!resp.ok) {
      alert(resp.message || "Save failed");
      return;
    }

    await reloadUsers();

    // 退出编辑态
    setEditingIds((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
    setDraftById((m) => {
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

  async function toggleStatus(u: UserRow) {
    const action = u.is_active ? "disable" : "enable";
    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/users/status",
      { id: u.id, action }
    );
    if (!resp.ok) {
      alert(resp.message || "Status update failed");
      return;
    }
    await reloadUsers();
  }

  async function deleteUser(u: UserRow) {
    if (!confirm("确定要删除该用户吗？")) return;
    const resp = await apiPost<{ ok: boolean; message?: string }>(
      "/api/settings/users/delete",
      { id: u.id }
    );
    if (!resp.ok) {
      alert(resp.message || "Delete failed");
      return;
    }
    await reloadUsers();
  }

  // 密码眼睛
  function togglePasswordVisible(inputId: string) {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return;
    el.type = el.type === "password" ? "text" : "password";
  }

  async function saveNewUser() {
    if (!newRow.username.trim() || !newRow.password.trim()) {
      alert("Username 和 Password 不能为空");
      return;
    }
    if (newRow.role_id === "") {
      alert("Role 不能为空");
      return;
    }

    const resp = await apiPost<{
      ok: boolean;
      message?: string;
      id?: number;
      user?: UserRow;
    }>(
      "/api/settings/users/save",
      {
        id: 0,
        username: newRow.username.trim(),
        password: newRow.password,
        first_name: newRow.first_name.trim(),
        last_name: newRow.last_name.trim(),
        role_id: Number(newRow.role_id),
      }
    );
    if (!resp.ok) {
      alert(resp.message || "Create failed");
      return;
    }

    const roleId = Number(newRow.role_id);
    const roleName = roles.find((r) => r.id === roleId)?.role_name || "";
    const fallbackId =
      resp.id ?? Math.max(0, ...users.map((u) => u.id)) + 1;
    const created: UserRow =
      resp.user ||
      ({
        id: fallbackId,
        username: newRow.username.trim(),
        password: isSuperAdmin ? newRow.password : undefined,
        first_name: newRow.first_name.trim(),
        last_name: newRow.last_name.trim(),
        created_time: new Date().toISOString(),
        role_id: roleId,
        role_name: roleName,
        is_active: 1,
      } as UserRow);

    setUsers((prev) => [...prev, created]);
    requestAnimationFrame(() => {
      const el = tableWrapperRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    resetNewRow();
  }

  if (loading)
    return <div className="container user-management progressive-enter">Loading...</div>;

  // 如果你希望未登录直接提示/跳转，可以在这里做：
  // if (!me) return <div className="container user-management">未登录</div>;

  return (
    <div className="container user-management progressive-enter">
      <div className="users-hero">
        <div className="users-title">
          <h2>用户管理（Users Management）</h2>
          <p>
            当前登录用户：<strong>{sessionUser}</strong>（角色：{sessionRole}）
          </p>
        </div>

        {isSuperAdmin && !newRow.enabled && (
          <div className="users-actions">
            <button
              type="button"
              className="primary-add-btn"
              onClick={() => setNewRow((s) => ({ ...s, enabled: true }))}
            >
              +添加新用户
            </button>
          </div>
        )}
      </div>

      <div className="users-metrics">
        <div className="metric-card">
          <div className="metric-label">Total Users</div>
          <div className="metric-value">{totalCount}</div>
        </div>
        <div className="metric-card metric-card--active">
          <div className="metric-label">Enabled</div>
          <div className="metric-value">{enabledCount}</div>
        </div>
        <div className="metric-card metric-card--inactive">
          <div className="metric-label">Disabled</div>
          <div className="metric-value">{disabledCount}</div>
        </div>
      </div>

      <div className="table-wrapper users-table-card" ref={tableWrapperRef}>
        <table className="user-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User Name</th>
              <th>Password</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Create Time</th>
              <th>Roles</th>
              <th>User Status</th>
              <th>Action</th>
              <th>Remove Account</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u, idx) => {
              const isAdminAccount = u.username === "admin";
              const isCurrentUser = u.username === sessionUser;
              const statusLabel = u.is_active ? "Enabled" : "Disabled";
              const statusClass = u.is_active
                ? "status-enabled"
                : "status-disabled";
              const isEditing = !!editingIds[u.id];

              return (
                <tr key={u.id} className={isAdminAccount ? "admin-row" : undefined}>
                  <td>{idx + 1}</td>

                  {/* username */}
                  <td>
                    {isAdminAccount ? (
                      <span>{u.username}</span>
                    ) : isSuperAdmin ? (
                      <input
                        className={`compact-input ${
                          isEditing ? "editable editing" : "editable"
                        }`}
                        value={u.username}
                        readOnly={!isEditing}
                        onChange={(e) =>
                          updateDraft(u.id, { username: e.target.value })
                        }
                      />
                    ) : (
                      <input value={u.username} readOnly />
                    )}
                  </td>

                  {/* password（所有人可见；仅超管可编辑真实密码；admin 行永远掩码） */}
                  <td>
                    {isAdminAccount ? (
                      <div className="password-cell">
                        <input
                          type="password"
                          className="password-input"
                          value=""
                          placeholder="********"
                          readOnly
                        />
                      </div>
                    ) : isSuperAdmin ? (
                      <div className="password-cell password-field">
                        <input
                          id={`pwd-${u.id}`}
                          type="password"
                          className={`password-input ${
                            isEditing ? "editable editing" : "editable"
                          }`}
                          value={u.password || ""}
                          readOnly={!isEditing}
                          onChange={(e) =>
                            updateDraft(u.id, { password: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="toggle-password-btn inside-input"
                          onClick={() =>
                            togglePasswordVisible(`pwd-${u.id}`)
                          }
                        >
                          👁
                        </button>
                      </div>
                    ) : (
                      <div className="password-cell">
                        <input
                          type="password"
                          className="password-input"
                          value=""
                          placeholder="********"
                          readOnly
                        />
                      </div>
                    )}
                  </td>

                  {/* first_name */}
                  <td>
                    {isAdminAccount ? (
                      <span>{u.first_name}</span>
                    ) : isSuperAdmin ? (
                      <input
                        className={`compact-input ${
                          isEditing ? "editable editing" : "editable"
                        }`}
                        value={u.first_name}
                        readOnly={!isEditing}
                        onChange={(e) =>
                          updateDraft(u.id, { first_name: e.target.value })
                        }
                      />
                    ) : (
                      <input value={u.first_name} readOnly />
                    )}
                  </td>

                  {/* last_name */}
                  <td>
                    {isAdminAccount ? (
                      <span>{u.last_name}</span>
                    ) : isSuperAdmin ? (
                      <input
                        className={`compact-input ${
                          isEditing ? "editable editing" : "editable"
                        }`}
                        value={u.last_name}
                        readOnly={!isEditing}
                        onChange={(e) =>
                          updateDraft(u.id, { last_name: e.target.value })
                        }
                      />
                    ) : (
                      <input value={u.last_name} readOnly />
                    )}
                  </td>

                  <td>{formatCreatedTime(u.created_time)}</td>

                  {/* roles */}
                  <td>
                    {isAdminAccount ? (
                      <span>{u.role_name}</span>
                    ) : isSuperAdmin ? (
                      <select
                        className={isEditing ? "editable editing" : "editable"}
                        value={u.role_id}
                        disabled={!isEditing}
                        onChange={(e) =>
                          updateDraft(u.id, { role_id: Number(e.target.value) })
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.role_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{u.role_name}</span>
                    )}
                  </td>

                  {/* status */}
                  <td>
                    {isSuperAdmin ? (
                      isAdminAccount ? (
                        <span className="status-label status-enabled">
                          Enabled（Admin）
                        </span>
                      ) : isCurrentUser ? (
                        <span className={`status-label ${statusClass}`}>
                          {statusLabel}（当前用户）
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`status-btn ${statusClass}`}
                          onClick={() => toggleStatus(u)}
                        >
                          {statusLabel}
                        </button>
                      )
                    ) : isAdminAccount ? (
                      <span className="status-label status-enabled">
                        Enabled（Admin）
                      </span>
                    ) : isCurrentUser ? (
                      <span className={`status-label ${statusClass}`}>
                        {statusLabel}（当前用户）
                      </span>
                    ) : (
                      <span className={`status-label ${statusClass}`}>
                        {statusLabel}
                      </span>
                    )}
                  </td>

                  {/* action */}
                  <td>
                    {isSuperAdmin ? (
                      isAdminAccount ? (
                        "Admin（不可修改）"
                      ) : !isEditing ? (
                        <button
                          type="button"
                          className="modify-btn"
                          onClick={() => startEdit(u)}
                        >
                          Modify
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="save-btn"
                            onClick={() => saveUser(u.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="cancel-btn"
                            onClick={() => cancelEdit(u.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )
                    ) : (
                      "无权限"
                    )}
                  </td>

                  {/* remove */}
                  <td>
                    {isSuperAdmin ? (
                      isAdminAccount ? (
                        <span className="no-delete">Admin（不可删除）</span>
                      ) : isCurrentUser ? (
                        <span className="no-delete">当前用户(不可删除)</span>
                      ) : (
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => deleteUser(u)}
                        >
                          ✖
                        </button>
                      )
                    ) : (
                      "无权限"
                    )}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      {isSuperAdmin && newRow.enabled && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetNewRow();
          }}
        >
          <div className="modal-panel">
            <div className="modal-header">
              <div className="modal-title">添加新用户</div>
              <button type="button" className="modal-close" onClick={resetNewRow}>
                ✖
              </button>
            </div>

            <div className="modal-grid">
              <label className="modal-field">
                <span>Username</span>
                <input
                  className="compact-input editable editing"
                  value={newRow.username}
                  onChange={(e) =>
                    setNewRow((s) => ({ ...s, username: e.target.value }))
                  }
                />
              </label>

              <label className="modal-field">
                <span>Password</span>
                <div className="password-cell password-field">
                  <input
                    id="newpwd"
                    type="password"
                    className="password-input editable editing"
                    value={newRow.password}
                    onChange={(e) =>
                      setNewRow((s) => ({ ...s, password: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="toggle-password-btn inside-input"
                    onClick={() => togglePasswordVisible("newpwd")}
                  >
                    👁
                  </button>
                </div>
              </label>

              <label className="modal-field">
                <span>First Name</span>
                <input
                  className="compact-input editable editing"
                  value={newRow.first_name}
                  onChange={(e) =>
                    setNewRow((s) => ({ ...s, first_name: e.target.value }))
                  }
                />
              </label>

              <label className="modal-field">
                <span>Last Name</span>
                <input
                  className="compact-input editable editing"
                  value={newRow.last_name}
                  onChange={(e) =>
                    setNewRow((s) => ({ ...s, last_name: e.target.value }))
                  }
                />
              </label>

              <label className="modal-field">
                <span>Role</span>
                <select
                  className="editable editing"
                  value={newRow.role_id}
                  onChange={(e) =>
                    setNewRow((s) => ({
                      ...s,
                      role_id: e.target.value as any,
                    }))
                  }
                >
                  <option value="">—</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.role_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-field">
                <span>Status</span>
                <span className="status-label status-enabled">Enabled</span>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="save-btn" onClick={saveNewUser}>
                Save
              </button>
              <button type="button" className="cancel-btn" onClick={resetNewRow}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
