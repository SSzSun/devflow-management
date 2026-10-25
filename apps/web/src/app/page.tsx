"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { fetchMe, logout } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  // shortcut: client-side redirect only; the API enforces auth regardless. Add a proxy.ts gate when routes multiply.
  useEffect(() => {
    if (me.data === null) router.replace("/login");
  }, [me.data, router]);

  async function onLogout() {
    await logout().catch(() => undefined); // cookies are cleared server-side either way
    qc.removeQueries({ queryKey: ["me"] });
    router.replace("/login");
  }

  return (
    <div className="min-h-[100dvh] bg-bg">
      <AppHeader>
        {me.data && (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-button)] border-[1.5px] border-border px-4 text-sm font-medium transition-colors hover:bg-bg-muted"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        )}
      </AppHeader>

      <main className="mx-auto max-w-[1280px] px-4 py-10 md:px-6">
        {me.isPending && (
          <div aria-busy="true" aria-label="Loading" className="space-y-3">
            <div className="h-8 w-56 animate-pulse rounded-lg bg-bg-muted" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-bg-muted" />
          </div>
        )}
        {me.data && (
          <>
            <h1 className="text-2xl font-bold tracking-tight md:text-4xl">Welcome back, {me.data.name}</h1>
            <p className="mt-2 text-text-muted">
              Signed in as <span className="font-mono text-sm">{me.data.email}</span>
            </p>
          </>
        )}
        {me.isError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            Could not reach the API. Is it running on port 4000?
          </p>
        )}
      </main>
    </div>
  );
}
