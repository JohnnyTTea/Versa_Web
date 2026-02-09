import React, { useEffect, useMemo, useState } from "react";

type Role = { id: number; role_name: string };

type UserRow = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  password?: string; // admin 才会返回（或你后端允许时）
  created_time: string;
  role_id: number;
  role_name: string | null;
  is_active: number; // 1/0
};

type UsersResp = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  rows: UserRow[];
};

// 先继续用你现在的“模拟 admin”方式
function getRoleHeaderValue(): string {
  return "admin"; // 非 admin 测试时改成 "user" 即可
}

function formatRoleDisplay(roleName: string | null, roleId: number) {
  return roleName ? roleName : String(roleId);
}

export default function Users() {
  const isAdmin = useMemo(() => getRoleHeaderValue().toLowerCase() === "admin", []);

  // 列表参数（你也可以后面再补分页/排序/搜索；这份先把“交互风格”对齐 PHP）
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [q, setQ] = useState("");

  const [roles, setRoles] = useState<Role[]>([]);
  const [data, setData] = useState<UsersResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 模拟 “当前登录用户”
  // 你后面做真正登录后，把这里替换成从 auth state 获取 username/role
  const sessionUser = "admin";
  const sessionRole = "admin";
  const isSuperAdmin = isAdmin; // 你 PHP 里超级管理员判定：用户名 admin 或 role_name admin
  // 这里先等同 isAdmin（模拟）

  // 行内编辑状态：每行一份草稿
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftById, setDraftById] = useState<Record<number, any>>({});
  const [showPwdById, setShowPwdById] = useState<Record<number, boolean>>({});

  // 新增行（PHP 的 addNewRow）
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [newDraft, setNewDraft] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    role_id: "",
    is_active: 1,
  });
  const [showNewPwd, setShowNewPwd] = useState(false);

  async function fetchRoles() {
    const res = await fetch("/api/roles");
    if (!res.ok) throw new Error(`Failed to load roles (${res.status})`);
    const json = (await res.json()) as Role[];
    setRoles(json);
  }

  async function fetchUsers() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        order,
      });
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: { "x-role": getRoleHeaderValue() },
      });
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      const json = (await res.json()) as UsersResp;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoles().catch((e) => setErr(e.message));
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isAdminAccount(row: UserRow) {
    return row.username === "admin";
  }

  function isCurrentUser(row: UserRow) {
    return row.username === sessionUser;
  }

  function statusLabel(row: UserRow) {
    return row.is_active === 1 ? "Enabled" : "Disabled";
  }

  function statusClass(row: UserRow) {
    return row.is_active === 1 ? "status-enabled" : "status-disabled";
  }

  function beginEdit(row: UserRow) {
    setErr(null);
    setEditingId(row.id);
    setDraftById((prev) => ({
      ...prev,
      [row.id]: {
        // username：你 PHP 限制 admin 用户名不可改；其他用户输入框 readonly（但你 PHP 实际是 readonly）
        // 在 React 里我们也不允许改 username（和我们后端一致：PUT 不改 username）
        username: row.username,
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        role_id: String(row.role_id || ""),
        password: "", // 编辑时默认空：PHP 是显示原密码；我们更安全：留空=不改
      },
    }));
  }

  function cancelEdit() {
    setEditingId(null);
    // PHP 是 reload；这里是清空编辑态即可
  }

  async function saveEdit(row: UserRow) {
    setErr(null);
    try {
      const d = draftById[row.id];
      if (!d) return;

      // admin account 不允许修改（对齐 PHP）
      if (isAdminAccount(row)) {
        throw new Error("Admin account cannot be modified");
      }
      // 只有超管能改别人（对齐 PHP）
      if (!isSuperAdmin) {
        throw new Error("No permission");
      }

      const payload: any = {
        first_name: d.first_name,
        last_name: d.last_name,
        role_id: Number(d.role_id),
      };
      if (isAdmin && d.password !== "") payload.password = d.password;

      const res = await fetch(`/api/users/${row.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-role": getRoleHeaderValue(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Update failed");

      setEditingId(null);
      await fetchUsers();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    }
  }

  async function toggleActive(row: UserRow) {
    setErr(null);
    try {
      if (!isSuperAdmin) {
        throw new Error("No permission");
      }
      if (isAdminAccount(row)) {
        throw new Error("Admin account cannot be disabled");
      }
      if (isCurrentUser(row)) {
        throw new Error("Current user cannot disable self");
      }

      const next = row.is_active === 1 ? 0 : 1;

      const res = await fetch(`/api/users/${row.id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Update status failed");

      await fetchUsers();
    } catch (e: any) {
      setErr(e?.message || "Update status failed");
    }
  }

  function openNewRow() {
    if (!isSuperAdmin) return;
    setNewRowOpen(true);
    setNewDraft({
      username: "",
      password: "",
      first_name: "",
      last_name: "",
      role_id: roles[0] ? String(roles[0].id) : "",
      is_active: 1,
    });
    setShowNewPwd(false);
  }

  function cancelNewRow() {
    setNewRowOpen(false);
  }

  async function saveNewRow() {
    setErr(null);
    try {
      if (!isSuperAdmin) throw new Error("No permission");

      const username = newDraft.username.trim();
      const password = newDraft.password.trim();

      // 对齐你 PHP：新增时 username/password 不能为空
      if (!username || !password) {
        throw new Error("Username and Password are required");
      }
      if (!newDraft.role_id) {
        throw new Error("Role is required");
      }

      const payload: any = {
        username,
        first_name: newDraft.first_name.trim(),
        last_name: newDraft.last_name.trim(),
        role_id: Number(newDraft.role_id),
        is_active: 1,
        password, // admin 才会写入（后端控制）
      };

      const res = await fetch(`/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": getRoleHeaderValue(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Create failed");

      setNewRowOpen(false);
      await fetchUsers();
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    }
  }

  function onSort(col: string) {
    if (sort === col) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(col);
      setOrder("asc");
    }
    // 简化：点排序就重新拉
    setTimeout(() => fetchUsers(), 0);
  }

  return (
    <div className="container user-management">
      <h2>用户管理后台</h2>

      <p>
        当前登录用户：<strong>{sessionUser}</strong>（角色：{sessionRole}）
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username / name..."
          style={{ padding: 8, width: 260 }}
        />
        <button
          onClick={() => {
            setPage(1);
            fetchUsers();
          }}
          style={{ padding: "8px 12px" }}
        >
          Search
        </button>

        <div style={{ flex: 1 }} />

        {isSuperAdmin && (
          <button onClick={openNewRow} style={{ padding: "8px 12px" }}>
            ➕ 添加新用户
          </button>
        )}
      </div>

      {err && <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div>}
      {loading && <div>Loading...</div>}

      <div className="table-wrapper">
        <table className="user-table">
          <thead>
            <tr>
              <th onClick={() => onSort("id")} style={{ cursor: "pointer" }}>
                ID
              </th>
              <th onClick={() => onSort("username")} style={{ cursor: "pointer" }}>
                User Name
              </th>

              {isSuperAdmin && <th>Password</th>}

              <th>First Name</th>
              <th>Last Name</th>
              <th onClick={() => onSort("created_time")} style={{ cursor: "pointer" }}>
                Create Time
              </th>
              <th onClick={() => onSort("role_name")} style={{ cursor: "pointer" }}>
                Roles
              </th>
              <th onClick={() => onSort("is_active")} style={{ cursor: "pointer" }}>
                User Status
              </th>
              <th>Action</th>
              <th>Remove Account</th>
            </tr>
          </thead>

          <tbody>
            {/* 新增行（对齐 PHP addNewRow） */}
            {isSuperAdmin && newRowOpen && (
              <tr>
                <td>New</td>
                <td>
                  <input
                    type="text"
                    className="editable editing"
                    value={newDraft.username}
                    onChange={(e) => setNewDraft((d) => ({ ...d, username: e.target.value }))}
                  />
                </td>

                {isSuperAdmin && (
                  <td>
                    <div className="password-cell">
                      <input
                        type={showNewPwd ? "text" : "password"}
                        className="editable editing password-input"
                        value={newDraft.password}
                        onChange={(e) => setNewDraft((d) => ({ ...d, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="toggle-password-btn"
                        onClick={() => setShowNewPwd((v) => !v)}
                      >
                        {showNewPwd ? "🙈" : "👁"}
                      </button>
                    </div>
                  </td>
                )}

                <td>
                  <input
                    type="text"
                    className="editable editing"
                    value={newDraft.first_name}
                    onChange={(e) => setNewDraft((d) => ({ ...d, first_name: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="editable editing"
                    value={newDraft.last_name}
                    onChange={(e) => setNewDraft((d) => ({ ...d, last_name: e.target.value }))}
                  />
                </td>
                <td>Auto</td>
                <td>
                  <select
                    className="editable editing"
                    value={newDraft.role_id}
                    onChange={(e) => setNewDraft((d) => ({ ...d, role_id: e.target.value }))}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.role_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="status-label status-enabled">Enabled</span>
                </td>
                <td>
                  <button type="button" className="save-btn" onClick={saveNewRow}>
                    Save
                  </button>{" "}
                  <button type="button" className="cancel-btn" onClick={cancelNewRow}>
                    Cancel
                  </button>
                </td>
                <td />
              </tr>
            )}

            {data?.rows?.map((user) => {
              const id = user.id;
              const editing = editingId === id;
              const d = draftById[id] || {
                username: user.username,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                role_id: String(user.role_id || ""),
                password: "",
              };

              const adminAccount = isAdminAccount(user);
              const currentUser = isCurrentUser(user);

              return (
                <tr key={id}>
                  <td>{id}</td>

                  {/* username：对齐 PHP 逻辑 */}
                  <td>
                    {adminAccount ? (
                      <span>{user.username}</span>
                    ) : isSuperAdmin ? (
                      <input type="text" value={user.username} readOnly className="editable" />
                    ) : (
                      <input type="text" value={user.username} readOnly />
                    )}
                  </td>

                  {/* password：只有超管能看到；admin 账号不显示真实 value */}
                  {isSuperAdmin && (
                    <td>
                      {adminAccount ? (
                        <div className="password-cell">
                          <input
                            type="password"
                            className="password-input"
                            value=""
                            placeholder="********"
                            readOnly
                          />
                        </div>
                      ) : (
                        <div className="password-cell">
                          <input
                            type={showPwdById[id] ? "text" : "password"}
                            className={`password-input ${editing ? "editable editing" : "editable"}`}
                            value={
                              // 对齐 PHP：显示原密码；但更安全：
                              // - 非编辑：显示 ********
                              // - 编辑：允许输入新密码（draft.password）
                              editing ? d.password : "********"
                            }
                            readOnly={!editing}
                            onChange={(e) =>
                              setDraftById((prev) => ({
                                ...prev,
                                [id]: { ...d, password: e.target.value },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="toggle-password-btn"
                            onClick={() =>
                              setShowPwdById((prev) => ({ ...prev, [id]: !prev[id] }))
                            }
                          >
                            {showPwdById[id] ? "🙈" : "👁"}
                          </button>
                        </div>
                      )}
                    </td>
                  )}

                  {/* first_name */}
                  <td>
                    {adminAccount ? (
                      <span>{user.first_name}</span>
                    ) : isSuperAdmin ? (
                      <input
                        type="text"
                        name="first_name"
                        className={`editable ${editing ? "editing" : ""}`}
                        value={editing ? d.first_name : user.first_name || ""}
                        readOnly={!editing}
                        onChange={(e) =>
                          setDraftById((prev) => ({
                            ...prev,
                            [id]: { ...d, first_name: e.target.value },
                          }))
                        }
                      />
                    ) : (
                      <input type="text" value={user.first_name || ""} readOnly />
                    )}
                  </td>

                  {/* last_name */}
                  <td>
                    {adminAccount ? (
                      <span>{user.last_name}</span>
                    ) : isSuperAdmin ? (
                      <input
                        type="text"
                        name="last_name"
                        className={`editable ${editing ? "editing" : ""}`}
                        value={editing ? d.last_name : user.last_name || ""}
                        readOnly={!editing}
                        onChange={(e) =>
                          setDraftById((prev) => ({
                            ...prev,
                            [id]: { ...d, last_name: e.target.value },
                          }))
                        }
                      />
                    ) : (
                      <input type="text" value={user.last_name || ""} readOnly />
                    )}
                  </td>

                  <td>{user.created_time}</td>

                  {/* roles */}
                  <td>
                    {adminAccount ? (
                      <span>{formatRoleDisplay(user.role_name, user.role_id)}</span>
                    ) : isSuperAdmin ? (
                      <select
                        className={`editable ${editing ? "editing" : ""}`}
                        disabled={!editing}
                        value={editing ? d.role_id : String(user.role_id)}
                        onChange={(e) =>
                          setDraftById((prev) => ({
                            ...prev,
                            [id]: { ...d, role_id: e.target.value },
                          }))
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.role_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{formatRoleDisplay(user.role_name, user.role_id)}</span>
                    )}
                  </td>

                  {/* status */}
                  <td>
                    {isSuperAdmin ? (
                      adminAccount ? (
                        <span className="status-label status-enabled">Enabled（Admin）</span>
                      ) : currentUser ? (
                        <span className={`status-label ${statusClass(user)}`}>
                          {statusLabel(user)}（当前用户）
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`status-btn ${statusClass(user)}`}
                          onClick={() => toggleActive(user)}
                        >
                          {statusLabel(user)}
                        </button>
                      )
                    ) : adminAccount ? (
                      <span className="status-label status-enabled">Enabled（Admin）</span>
                    ) : currentUser ? (
                      <span className={`status-label ${statusClass(user)}`}>
                        {statusLabel(user)}（当前用户）
                      </span>
                    ) : (
                      <span className={`status-label ${statusClass(user)}`}>{statusLabel(user)}</span>
                    )}
                  </td>

                  {/* action */}
                  <td>
                    {isSuperAdmin ? (
                      adminAccount ? (
                        <>Admin（不可修改）</>
                      ) : (
                        <>
                          {!editing && (
                            <button type="button" className="modify-btn" onClick={() => beginEdit(user)}>
                              Modify
                            </button>
                          )}
                          {editing && (
                            <>
                              <button type="button" className="save-btn" onClick={() => saveEdit(user)}>
                                Save
                              </button>{" "}
                              <button type="button" className="cancel-btn" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </>
                          )}
                        </>
                      )
                    ) : (
                      <>无权限</>
                    )}
                  </td>

                  {/* remove */}
                  <td>
                    {isSuperAdmin ? (
                      adminAccount ? (
                        <>Admin（不可删除）</>
                      ) : currentUser ? (
                        <>当前用户(不可删除)</>
                      ) : (
                        <>
                          {/* 你 PHP 是 delete；后端我们还没做 DELETE，所以先占位 */}
                          <button
                            type="button"
                            className="delete-btn"
                            onClick={() => alert("Delete 接口尚未实现（需要后端加 DELETE /api/users/:id）")}
                          >
                            ✖
                          </button>
                        </>
                      )
                    ) : (
                      <>无权限</>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </button>
          <div>
            Page {data.page} / {data.pages} (total {data.total})
          </div>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
          <button
            style={{ marginLeft: 12 }}
            onClick={() => {
              const params = new URLSearchParams({
                export: "csv",
                page: String(page),
                limit: String(limit),
                sort,
                order,
              });
              if (q.trim()) params.set("q", q.trim());
              window.open(`/api/users?${params.toString()}`, "_blank");
            }}
          >
            Export CSV
          </button>
        </div>
      )}

      {/* 下面这段 style 基本复刻你 PHP 里的同名 class */}
      <style>{`
        .password-cell {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .password-cell .password-input {
          flex: 1;
          box-sizing: border-box;
        }

        .toggle-password-btn {
          padding: 2px 6px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background-color: #f3f4f6;
          cursor: pointer;
          font-size: 12px;
        }
        .toggle-password-btn:hover { background-color: #e5e7eb; }

        .status-enabled { color: #16a34a; }
        .status-disabled { color: #b91c1c; }

        /* 额外补一些表格样式，让视觉更接近你 PHP 页面 */
        .table-wrapper { overflow: auto; }
        .user-table { width: 100%; border-collapse: collapse; }
        .user-table th, .user-table td { border-bottom: 1px solid #eee; padding: 8px; vertical-align: middle; }
        .user-table th { background: #fafafa; }

        .editable { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; }
        .editing { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }

        .modify-btn, .save-btn, .cancel-btn, .delete-btn, .status-btn {
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
        }
        .delete-btn { border-color: #ef4444; }
      `}</style>
    </div>
  );
}
