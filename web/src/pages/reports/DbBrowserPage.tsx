import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/report.css";


type SchemasResp =
  | { ok: true; schemas: Record<string, string[]> }
  | { ok: false; error?: string };

type ColumnsResp =
  | { ok: true; all_columns: string[]; selected_columns: string[] }
  | { ok: false; error?: string };

type QueryResp =
  | {
      ok: true;
      schema: string;
      table: string;
      columns: string[];
      rows: Record<string, any>[];
      count: number;
      limit: string;
      page: number;
      page_size: number;
      total: number | null;
      total_pages: number | null;
      offset: number;
      order_by: string;
      order_dir: "ASC" | "DESC" | "";
      server_sec: number;
    }
  | { ok: false; error?: string };

type LogRow = {
  id: number;
  time: string;
  command: string;
  result: string;
  cost: string;
};

function nowHHMMSS() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pickText(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function DbBrowserPage() {
  const [schemas, setSchemas] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState("");

  const [currentSchema, setCurrentSchema] = useState("");
  const [currentTable, setCurrentTable] = useState("");

  const [allCols, setAllCols] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);

  const [nl, setNl] = useState("");
  const [limit, setLimit] = useState<string>("20");

  const [mode, setMode] = useState<"preview" | "nl">("preview");
  const [orderBy, setOrderBy] = useState("");
  const [orderDir, setOrderDir] = useState<"ASC" | "DESC" | "">("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [status, setStatus] = useState("");
  const [whereText, setWhereText] = useState("请选择左侧一个 table 进行预览");

  const [logs, setLogs] = useState<LogRow[]>([]);
  const logSeq = useRef(0);

  const isUnlimited = limit === "unlimited";

  function addLog(command: string, ok: boolean, costSec?: number) {
    logSeq.current += 1;
    setLogs((prev) => [
      {
        id: logSeq.current,
        time: nowHHMMSS(),
        command,
        result: ok ? "OK" : "ERR",
        cost: costSec !== undefined ? `${costSec.toFixed(3)}s` : "",
      },
      ...prev,
    ]);
  }

  // =============== 1) 加载 schemas/tables ===============
  useEffect(() => {
    (async () => {
      try {
        setStatus("Loading schemas...");
        const t0 = performance.now();
        const res = await fetch("/api/db/schemas", { credentials: "include" });
        const data = (await res.json()) as SchemasResp;
        const t1 = performance.now();

        if (!res.ok || !data.ok) {
          setStatus("❌ Failed to load schemas");
          addLog("GET /api/db/schemas", false, (t1 - t0) / 1000);
          return;
        }
        setSchemas(data.schemas || {});
        setStatus("");
        addLog("GET /api/db/schemas", true, (t1 - t0) / 1000);
      } catch (e: any) {
        setStatus("❌ Failed to load schemas: " + (e?.message || String(e)));
        addLog("GET /api/db/schemas", false);
      }
    })();
  }, []);

  const filteredSchemas = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return schemas;

    const out: Record<string, string[]> = {};
    for (const s of Object.keys(schemas)) {
      const tables = schemas[s] || [];
      const hitTables = tables.filter((t) => t.toLowerCase().includes(q) || s.toLowerCase().includes(q));
      if (hitTables.length) out[s] = hitTables;
    }
    return out;
  }, [schemas, filter]);

  // =============== 2) 选择 table -> 取 columns + 默认预览 ===============
  async function loadColumnsAndPreview(schema: string, table: string) {
    setCurrentSchema(schema);
    setCurrentTable(table);

    setWhereText(`${schema}.${table}`);
    setStatus("Loading columns...");
    setRows([]);
    setColumns([]);
    setOrderBy("");
    setOrderDir("");
    setMode("preview");
    setPage(1);
    setTotalPages(null);
    setTotalRows(null);
    setOffset(0);

    try {
      const t0 = performance.now();
      const res = await fetch(
        `/api/db/columns?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`,
        { credentials: "include" }
      );
      const data = (await res.json()) as ColumnsResp;
      const t1 = performance.now();

      if (!res.ok || !data.ok) {
        setStatus("❌ Failed to load columns");
        addLog(`GET /api/db/columns ${schema}.${table}`, false, (t1 - t0) / 1000);
        return;
      }

      setAllCols(data.all_columns || []);
      setSelectedCols(data.selected_columns || []);
      setStatus("");
      addLog(`GET /api/db/columns ${schema}.${table}`, true, (t1 - t0) / 1000);

      await runQuery({
        schema,
        table,
        mode: "preview",
        nl: "",
        limit,
        page: 1,
        order_by: "",
        order_dir: "",
      });
    } catch (e: any) {
      setStatus("❌ Failed to load columns: " + (e?.message || String(e)));
      addLog(`GET /api/db/columns ${schema}.${table}`, false);
    }
  }

  // =============== 3) 保存字段偏好 ===============
  async function savePrefs(nextCols: string[]) {
    if (!currentSchema || !currentTable) return;

    try {
      const t0 = performance.now();
      const res = await fetch("/api/db/columns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: currentSchema,
          table: currentTable,
          columns: nextCols,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      const t1 = performance.now();

      if (!res.ok || !data.ok) {
        setStatus("❌ Save fields failed");
        addLog(`POST /api/db/columns ${currentSchema}.${currentTable}`, false, (t1 - t0) / 1000);
        return;
      }
      addLog(`POST /api/db/columns ${currentSchema}.${currentTable}`, true, (t1 - t0) / 1000);
    } catch {
      setStatus("❌ Save fields failed");
      addLog(`POST /api/db/columns ${currentSchema}.${currentTable}`, false);
    }
  }

  // =============== 4) Query ===============
  async function runQuery(args: {
    schema: string;
    table: string;
    mode: "preview" | "nl";
    nl: string;
    limit: string;
    page: number;
    order_by: string;
    order_dir: string;
  }) {
    const { schema, table } = args;
    if (!schema || !table) return;

    const qs = new URLSearchParams();
    qs.set("schema", schema);
    qs.set("table", table);
    qs.set("mode", args.mode);
    if (args.mode === "nl") qs.set("nl", args.nl || "");
    qs.set("limit", args.limit);
    qs.set("page", String(args.page));
    if (args.order_by) qs.set("order_by", args.order_by);
    if (args.order_dir) qs.set("order_dir", args.order_dir);

    const url = `/api/db/query?${qs.toString()}`;

    try {
      setStatus("⏳ Loading data...");
      const t0 = performance.now();
      const res = await fetch(url, { credentials: "include" });
      const data = (await res.json()) as QueryResp;
      const t1 = performance.now();

      if (!res.ok || !data.ok) {
        setStatus("❌ Query failed");
        addLog(`GET ${url}`, false, (t1 - t0) / 1000);
        return;
      }

      setColumns(data.columns || []);
      setRows(data.rows || []);

      setOffset(data.offset || 0);
      setPage(data.page || 1);

      // unlimited 时才展示分页信息
      setTotalPages(data.total_pages ?? null);
      setTotalRows(data.total ?? null);

      setOrderBy(data.order_by || "");
      setOrderDir((data.order_dir as any) || "");

      setStatus(`OK • rows ${data.count} • server ${(data.server_sec || 0).toFixed(3)}s`);
      addLog(`GET ${url}`, true, (t1 - t0) / 1000);
    } catch (e: any) {
      setStatus("❌ Query error: " + (e?.message || String(e)));
      addLog(`GET ${url}`, false);
    }
  }

  async function refresh() {
    if (!currentSchema || !currentTable) return;
    await runQuery({
      schema: currentSchema,
      table: currentTable,
      mode,
      nl,
      limit,
      page,
      order_by: orderBy,
      order_dir: orderDir,
    });
  }

  // =============== 5) NL 查询按钮 ===============
  async function onNLQuery() {
    if (!currentSchema || !currentTable) return;
    setMode("nl");
    setPage(1);
    setTotalPages(null);
    setTotalRows(null);
    setOffset(0);

    await runQuery({
      schema: currentSchema,
      table: currentTable,
      mode: "nl",
      nl,
      limit,
      page: 1,
      order_by: orderBy,
      order_dir: orderDir,
    });
  }

  // =============== 6) Limit 切换 ===============
  async function onLimitChange(v: string) {
    setLimit(v);
    setPage(1);
    setTotalPages(null);
    setTotalRows(null);
    setOffset(0);

    // 若已经选了表，自动刷新
    if (currentSchema && currentTable) {
      await runQuery({
        schema: currentSchema,
        table: currentTable,
        mode,
        nl,
        limit: v,
        page: 1,
        order_by: orderBy,
        order_dir: orderDir,
      });
    }
  }

  // =============== 7) 排序（点列头 ASC/DESC/无） ===============
  async function toggleSort(col: string) {
    if (!currentSchema || !currentTable) return;

    let nextBy = col;
    let nextDir: "ASC" | "DESC" | "" = "ASC";

    if (orderBy !== col) {
      nextDir = "ASC";
    } else {
      if (orderDir === "ASC") nextDir = "DESC";
      else if (orderDir === "DESC") nextDir = "";
      else nextDir = "ASC";
    }

    setOrderBy(nextDir ? nextBy : "");
    setOrderDir(nextDir);

    await runQuery({
      schema: currentSchema,
      table: currentTable,
      mode,
      nl,
      limit,
      page,
      order_by: nextDir ? nextBy : "",
      order_dir: nextDir,
    });
  }

  // =============== 8) 勾选字段 ===============
  async function onToggleField(c: string) {
    const has = selectedCols.includes(c);
    const next = has ? selectedCols.filter((x) => x !== c) : [...selectedCols, c];

    setSelectedCols(next);
    await savePrefs(next);

    // table.php 行为：改字段后刷新数据
    await refresh();
  }

  async function fieldsAll() {
    const next = [...allCols];
    setSelectedCols(next);
    await savePrefs(next);
    await refresh();
  }

  async function fieldsNone() {
    const next: string[] = [];
    setSelectedCols(next);
    await savePrefs(next);
    await refresh();
  }

  // =============== 9) unlimited 分页 prev/next ===============
  async function prevPage() {
    if (!isUnlimited) return;
    if (page <= 1) return;
    const next = page - 1;
    setPage(next);
    await runQuery({
      schema: currentSchema,
      table: currentTable,
      mode,
      nl,
      limit,
      page: next,
      order_by: orderBy,
      order_dir: orderDir,
    });
  }

  async function nextPage() {
    if (!isUnlimited) return;
    if (totalPages && page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    await runQuery({
      schema: currentSchema,
      table: currentTable,
      mode,
      nl,
      limit,
      page: next,
      order_by: orderBy,
      order_dir: orderDir,
    });
  }

  // =============== 10) Download CSV（对齐 table.php?action=download_csv） ===============
  function downloadCSV() {
    if (!currentSchema || !currentTable) return;

    const qs = new URLSearchParams();
    qs.set("schema", currentSchema);
    qs.set("table", currentTable);
    qs.set("mode", mode);
    if (mode === "nl") qs.set("nl", nl || "");
    qs.set("limit", limit);
    if (orderBy) qs.set("order_by", orderBy);
    if (orderDir) qs.set("order_dir", orderDir);

    const url = `/api/db/download_csv?${qs.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    addLog(`GET ${url}`, true);
  }

  // =============== Render ===============
  return (
    <div className="wb-wrap progressive-enter">
      <div className="wb-topbar">
        <div className="wb-title">DB Browser</div>
        <span className="wb-pill">Schemas / Tables</span>
        <span className="wb-pill">Read-only</span>
        <span className="wb-pill">Light DB Manager</span>
      </div>

      <div className="wb-app">
        {/* 左侧：schema/tree/fields */}
        <aside className="wb-left">
          <div className="wb-left-header">
            <div className="wb-h1">SCHEMAS</div>
            <input
              className="wb-filter"
              placeholder="Filter objects..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="wb-tree">
            {Object.keys(filteredSchemas).map((s) => (
              <SchemaBlock
                key={s}
                schema={s}
                tables={filteredSchemas[s] || []}
                onPick={(schema, table) => loadColumnsAndPreview(schema, table)}
              />
            ))}
          </div>

          <div className="wb-left-fields">
            <div className="wb-left-header" style={{ marginTop: 10 }}>
              <div className="wb-h1">FIELDS</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="wb-btn" onClick={fieldsAll}>
                  All
                </button>
                <button type="button" className="wb-btn" onClick={fieldsNone}>
                  None
                </button>
              </div>
            </div>

            <div className="wb-fields-box">
              {!currentSchema || !currentTable ? (
                <div style={{ opacity: 0.7 }}>请选择左侧表后显示字段</div>
              ) : (
                allCols.map((c) => (
                  <label key={c} className="wb-field">
                    <input
                      type="checkbox"
                      checked={selectedCols.includes(c)}
                      onChange={() => onToggleField(c)}
                    />
                    <span>{c}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* 右侧：查询 + grid + log */}
        <main className="wb-main">
          <div className="wb-panel">
            <div className="wb-panel-header">
              <div className="wb-where">{whereText}</div>
              <div className="wb-status">{status}</div>
            </div>

            <div className="wb-querybar">
              <input
                className="wb-input"
                placeholder="自然语言只读：例如 订单号 5732532 / Custno=ABC / Custno 包含 ABC / 日期 2025-01-01 到 2025-01-31"
                value={nl}
                onChange={(e) => setNl(e.target.value)}
              />

              <select
                className="wb-select"
                title="返回条数（最大100，unlimited 会查询总数+分页展示）"
                value={limit}
                onChange={(e) => onLimitChange(e.target.value)}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="unlimited">unlimited</option>
              </select>

              <button type="button" className="wb-btn" onClick={onNLQuery} disabled={!currentSchema || !currentTable}>
                查询
              </button>
              <button type="button" className="wb-btn" onClick={downloadCSV} disabled={!currentSchema || !currentTable}>
                Download CSV
              </button>
            </div>

            {/* unlimited pager */}
            {isUnlimited && currentSchema && currentTable && totalPages !== null && (
              <div className="wb-querybar wb-pager">
                <button type="button" className="wb-btn" onClick={prevPage} disabled={page <= 1}>
                  Prev
                </button>
                <span className="wb-pageinfo">
                  Page {page} / {totalPages || 1}
                  {typeof totalRows === "number" ? ` • Total ${totalRows}` : ""}
                </span>
                <button
                  type="button"
                  className="wb-btn"
                  onClick={nextPage}
                  disabled={!!totalPages && page >= totalPages}
                >
                  Next
                </button>
              </div>
            )}

            <div className="wb-grid-wrap">
              {!currentSchema || !currentTable ? (
                <div className="wb-empty">点击左侧某个 table，会显示数据；也可以输入自然语言进行只读过滤查询。</div>
              ) : (
                <table className="wb-grid">
                  <thead>
                    <tr>
                      <th className="wb-th">#</th>
                      {columns.map((c) => {
                        const active = orderBy === c && orderDir;
                        return (
                          <th
                            key={c}
                            className={"wb-th clickable" + (active ? " active" : "")}
                            onClick={() => toggleSort(c)}
                            title="Click to sort ASC/DESC"
                          >
                            {c}
                            {orderBy === c && orderDir ? (
                              <span className="wb-sort">{orderDir === "ASC" ? " ▲" : " ▼"}</span>
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="wb-td wb-index">{offset + idx + 1}</td>
                        {columns.map((c) => (
                          <td key={c} className="wb-td">
                            {pickText(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Output Log */}
          <div className="wb-log">
            <div className="wb-log-header">
              <div>Output Log</div>
              <button type="button" className="wb-btn" onClick={() => { setLogs([]); logSeq.current = 0; }}>
                Clear
              </button>
            </div>

            <div className="wb-log-body">
              <table className="wb-log-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 90 }}>Time</th>
                    <th>Command</th>
                    <th style={{ width: 140 }}>Result</th>
                    <th style={{ width: 120 }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((x) => (
                    <tr key={x.id}>
                      <td>{x.id}</td>
                      <td>{x.time}</td>
                      <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                        {x.command}
                      </td>
                      <td>{x.result}</td>
                      <td>{x.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SchemaBlock(props: {
  schema: string;
  tables: string[];
  onPick: (schema: string, table: string) => void;
}) {
  const { schema, tables, onPick } = props;
  const [open, setOpen] = useState(true);

  return (
    <div className={"wb-schema" + (open ? " open" : "")}>
      <button type="button" className="wb-schema-toggle" onClick={() => setOpen((v) => !v)}>
        <span>{schema}</span>
        <span className="wb-count">({tables.length})</span>
      </button>

      {open && (
        <div className="wb-tables">
          {tables.map((t) => (
            <button key={t} type="button" className="wb-table-item" onClick={() => onPick(schema, t)}>
              <span className="wb-icon" />
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
