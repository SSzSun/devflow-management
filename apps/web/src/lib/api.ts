"use client";

import { useMutation } from "@tanstack/react-query";

function readCsrfCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m?.[1] ?? "";
}

async function postJson(url: string, body: unknown) {
  if (!readCsrfCookie()) await fetch("/api/v1/auth/csrf", { credentials: "include" });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfCookie() },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface Me {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Returns null when not signed in (401), throws on other failures. */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/v1/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as Me;
}

export function logout() {
  return postJson("/api/v1/auth/logout", {});
}

export interface SessionResponse {
  csrfToken: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (v: { email: string; password: string }) =>
      postJson("/api/v1/auth/login", v) as Promise<SessionResponse>,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (v: { email: string; name: string; password: string }) =>
      postJson("/api/v1/auth/register", v) as Promise<SessionResponse>,
  });
}
