type LogPayload = {
  event: string;
  path?: string;
  module?: string;
  action?: string;
  target?: string;
  meta?: Record<string, any>;
};

export function trackUserEvent(payload: LogPayload) {
  try {
    const body = JSON.stringify({
      ...payload,
      path: payload.path || window.location.pathname + window.location.search,
    });

    fetch("/api/log", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // noop: logging should never block normal flow
  }
}

