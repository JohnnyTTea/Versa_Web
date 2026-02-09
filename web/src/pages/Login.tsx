import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        credentials: "include", // ⭐ very important：让 session cookie 生效
        body: JSON.stringify({
          username: normalizedUsername,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "用户名或密码错误");
        setLoading(false);
        return;
      }

      // 登录成功 → 跳转首页（对应 PHP 的 header("Location: ../public/index.php")）
      navigate("/", { replace: true });
    } catch (err) {
      setError("服务器连接失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>用户登录</h2>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">用户名</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />

          <label htmlFor="password">密码</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <div className="register-link">
          <p>
            没有账号？<a href="#">注册</a>
          </p>
        </div>
      </div>
    </div>
  );
}
