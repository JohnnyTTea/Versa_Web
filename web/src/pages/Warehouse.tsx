import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Warehouse() {
  const navigate = useNavigate();
  const [tracking, setTracking] = useState("");
  const [count, setCount] = useState(0);
  const [lastPackedTime, setLastPackedTime] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ tracking_number: string; packed_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        const me = meRes.ok ? await meRes.json() : null;
        if (!me?.ok || !me?.user?.username) {
          navigate("/login", { replace: true });
          return;
        }
        if ((me.user.role_name || "").trim().toLowerCase() === "packer") {
          const todayRes = await fetch("/api/warehouse/today", { credentials: "include" });
          if (todayRes.ok) {
            const data = await todayRes.json();
            setCount(Number(data?.count || 0));
            setLastPackedTime(data?.last_packed_time || null);
            setRecent(Array.isArray(data?.recent) ? data.recent : []);
          }
        }
      } catch {
        setLoginError("Unable to load warehouse status.");
      }
    };

    load();
  }, [navigate]);

  const displayDate = useMemo(() => todayIso(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trackingNo = tracking.trim();
    if (!trackingNo) {
      setLoginError("Please enter a tracking number.");
      return;
    }

    setLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/warehouse/scan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: trackingNo }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data?.message || "Scan failed");
        return;
      }

      setTracking("");
      setCount(Number(data?.count || 0));
      setRecent(Array.isArray(data?.recent) ? data.recent : []);
      if (data?.recent?.[0]?.packed_at) {
        setLastPackedTime(data.recent[0].packed_at);
      }
    } catch {
      setLoginError("Unable to save pack record.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #eff6ff 0%, #ffffff 30%, #f8fafc 100%)",
      padding: 20,
      fontFamily: "Segoe UI, sans-serif",
    }}>
      <div style={{
        maxWidth: 420,
        margin: "0 auto",
        background: "rgba(255,255,255,0.96)",
        borderRadius: 22,
        boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
        padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#475569", letterSpacing: 1.1, textTransform: "uppercase" }}>Warehouse</div>
            <h2 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>Packing Log</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            style={{
              border: "none",
              background: "#eff6ff",
              color: "#1d4ed8",
              borderRadius: 999,
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Exit
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 18 }}>
          <div style={{ background: "#dbeafe", borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>Today</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{count}</div>
          </div>
          <div style={{ background: "#ecfeff", borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 700 }}>Last packed</div>
            <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 700 }}>{lastPackedTime ? new Date(lastPackedTime).toLocaleString() : "—"}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Date: {displayDate}</div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="tracking" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#334155" }}>
            Tracking Number
          </label>
          <input
            id="tracking"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Scan or type tracking number"
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              padding: "14px 12px",
              fontSize: 16,
              marginBottom: 12,
            }}
          />

          {loginError ? (
            <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>
              {loginError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: "14px 16px",
              fontWeight: 800,
              background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Saving..." : "Save packed record"}
          </button>
        </form>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Recent scans</div>
          <div style={{ display: "grid", gap: 8 }}>
            {recent.length ? recent.map((item, index) => (
              <div key={`${item.tracking_number}-${index}`} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#0f172a" }}>
                {item.tracking_number} · {new Date(item.packed_at).toLocaleTimeString()}
              </div>
            )) : (
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#64748b" }}>
                No scans recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
