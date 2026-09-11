/**
 * ELS Eval Runner Phase 0 — Route 直驱 HTTP Adapter
 * ------------------------------------------------------------
 * 直接 import HEAD 的真实 API route handler 并以构造的 Request 调用。
 * 这比复制业务逻辑 simulate 保真度更高（满足"不要重新实现 Gold"）。
 *
 * trace_id 使用 eval 前缀 `trc_eval_*`，满足 traceIdFromHeaders 格式校验
 * （/^trc_[a-z0-9_]+$/i，不允许连字符）。
 */

export interface RouteCallResult {
  status: number;
  json: Record<string, unknown> | null;
  traceId: string | null;
  ok: boolean;
}

export function evalTraceId(caseTag: string, seq = 0): string {
  const safe = caseTag.replace(/[^a-z0-9_]/gi, "_");
  return `trc_eval_${safe}_${seq}`;
}

export async function callRouteGet(
  routeFn: (request: Request) => Promise<Response>,
  query: Record<string, string>,
  traceId: string,
): Promise<RouteCallResult> {
  const search = new URLSearchParams(query).toString();
  const request = new Request(`http://localhost:3000/api/eval?${search}`, {
    method: "GET",
    headers: { "x-trace-id": traceId },
  });
  const response = await routeFn(request);
  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    json,
    traceId: response.headers.get("x-trace-id"),
    ok: response.ok,
  };
}

export async function callRoute(
  routeFn: (request: Request) => Promise<Response>,
  body: unknown,
  traceId: string,
): Promise<RouteCallResult> {
  const request = new Request("http://localhost:3000/api/eval", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-trace-id": traceId,
    },
    body: JSON.stringify(body),
  });

  const response = await routeFn(request);
  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    json,
    traceId: response.headers.get("x-trace-id"),
    ok: response.ok,
  };
}
