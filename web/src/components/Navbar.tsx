import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import "../styles/navbar.css";

type MeResponse = {
  ok?: boolean;
  user?: { username?: string };
};

async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function Navbar() {
  const [username, setUsername] = useState<string>("");
  const nav = useNavigate();

  useEffect(() => {
    let mounted = true;
    fetchMe().then((me) => {
      if (!mounted) return;
      setUsername(me?.user?.username || "");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUsername("");
      nav("/login", { replace: true });
    }
  };

  return (
    <div className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-link">
          <img src={logo} alt="Logo" className="navbar-logo" />
          <span className="navbar-title">Versa System</span>
        </Link>
      </div>
      <div className="navbar-right">
        <span className="navbar-user">👤 Hello, {username || "Guest"}</span>

        <button type="button" className="navbar-link" onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </div>
  );
}
