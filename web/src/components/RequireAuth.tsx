import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

async function fetchMe() {
  try {
    const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    fetchMe().then((data) => {
      setMe(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  // ✅ 按你的后端返回结构判断
  if (!me?.ok || !me?.user?.username) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
