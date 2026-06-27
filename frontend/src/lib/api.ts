// Base URL for backend calls.
//  - dev (Vite proxies /api → :8011): empty
//  - production (Vercel): the backend service is mounted at /_/backend, so default
//    to that automatically. Override with VITE_API_BASE if your prefix differs.
const env = (import.meta as any).env ?? {};
const fallback = env.PROD ? "/_/backend" : "";
export const API_BASE = String(env.VITE_API_BASE ?? fallback).replace(/\/$/, "");

/** Prefix a backend path with the configured API base. */
export function apiUrl(path: string): string {
  return API_BASE + path;
}

// --- Access token ---------------------------------------------------------
// The studio/wall password, verified server-side at login and then sent on
// every request as X-Studio-Token. The backend enforces it (LLM calls, submit,
// host actions); storing it client-side is just transport, not the security
// boundary. sessionStorage so it clears when the tab closes.
const TOKEN_KEY = "twtb_token";

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Merge the auth header into a headers object (omitted when no token is set). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, "X-Studio-Token": token } : { ...extra };
}

/** Verify a password against the backend; on success store its token. */
export async function login(password: string): Promise<{ ok: boolean; role?: string }> {
  const r = await fetch(apiUrl("/api/session/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) return { ok: false };
  const d = await r.json();
  setToken(password);
  return { ok: true, role: d.role };
}
