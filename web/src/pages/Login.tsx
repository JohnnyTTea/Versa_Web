import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import "../styles/login.css";

export default function Login({ mode = "versa" }: { mode?: "versa" | "warehouse" }) {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loginMode = mode;

  const loginTitle = loginMode === "warehouse" ? "Warehouse Login" : "Team Members Login";
  const loginSubtitle = loginMode === "warehouse"
    ? "Scan and log packing activity from mobile devices."
    : "Welcome back. Please sign in to continue.";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setError("用户名和密码不能为空");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: normalizedUsername,
          password,
          remember,
          mode: loginMode,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.message || "用户名或密码错误");
        setLoading(false);
        return;
      }

      if (loginMode === "warehouse") {
        navigate("/warehouse/packing", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      setError("服务器连接失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`login-page ${loginMode === "warehouse" ? "warehouse-mode" : ""}`}>
      <div className="login-shell">
        <div className="login-side">
          <div className="login-brand">
            <img src={logo} alt="Versa logo" className="login-brand-mark" />
            <span>{loginMode === "warehouse" ? "Warehouse" : "Versa"}</span>
          </div>
          <h2>New Aim LLC.</h2>
          <h1>{loginTitle}</h1>
          <p>{loginSubtitle}</p>
        </div>

        <div className="login-container">
          <div className="login-mode-switcher" aria-label="Choose login mode">
            <button
              type="button"
              className={`login-mode-card ${loginMode === "versa" ? "active" : ""}`}
              onClick={() => navigate("/login")}
              aria-pressed={loginMode === "versa"}
            >
              <span className="login-mode-card-label">Versa</span>
            </button>
            <button
              type="button"
              className={`login-mode-card ${loginMode === "warehouse" ? "active" : ""}`}
              onClick={() => navigate("/warehouse")}
              aria-pressed={loginMode === "warehouse"}
            >
              <span className="login-mode-card-label">Warehouse</span>
            </button>
          </div>

          <h2>Sign In</h2>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <label htmlFor="username">User Name</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />

            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="login-row">
              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <a href="#" className="forgot-link">Forgot password?</a>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Signing in..." : loginMode === "warehouse" ? "Open Warehouse" : "Login"}
            </button>
          </form>

          <div className="register-link">
            <p>
              No account? <a href="#">Register</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
