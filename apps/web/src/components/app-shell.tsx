"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleCheck, LayoutDashboard, LogOut, Plus } from "lucide-react";
import { logout, useMe, useProject, useProjects, useWorkspaces } from "@/lib/api";
import { ThemeToggle } from "./theme-toggle";
import { buttonClass, Skeleton } from "./ui";

/** Both ids live in the URL, so the shell reads them from the path. */
function useRouteIds() {
  const pathname = usePathname();
  const workspaceId = pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
  const projectId = pathname.match(/^\/p\/([^/]+)/)?.[1] ?? null;
  return { workspaceId, projectId };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const route = useRouteIds();
  const projectId = route.projectId;
  // Project routes carry no workspace id; borrow it from the project.
  const project = useProject(projectId);
  const workspaceId = route.workspaceId ?? project.data?.workspaceId ?? null;
  const workspaces = useWorkspaces();
  const projects = useProjects(workspaceId);
  const [navOpen, setNavOpen] = useState(false);
  // Route change closes the mobile drawer. Resetting during render is React
  // 19's supported pattern and costs no extra effect pass.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    if (me.data === null) router.replace("/login");
  }, [me.data, router]);

  async function onLogout() {
    await logout().catch(() => undefined); // cookies are cleared server-side either way
    qc.clear();
    router.replace("/login");
  }

  const currentWorkspace = workspaces.data?.find((w) => w.id === workspaceId);

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="sticky top-0 z-[100] border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="app-nav"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            className="inline-flex size-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-muted hover:text-text lg:hidden"
          >
            <LayoutDashboard className="size-5" aria-hidden="true" />
          </button>

          <Link href="/" className="flex min-h-[44px] items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[12px] bg-accent text-accent-text-on">
              <CircleCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight">DevFlow</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {me.data && (
              <span className="hidden max-w-[12rem] truncate text-sm text-text-muted sm:inline">{me.data.name}</span>
            )}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="inline-flex size-11 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Stack on mobile so the open drawer pushes content down, not off-screen; side-by-side only from lg. */}
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-6 lg:flex-row">
        <nav
          id="app-nav"
          aria-label="Workspaces and projects"
          className={`${navOpen ? "block" : "hidden"} w-full shrink-0 lg:block lg:w-60`}
        >
          <div className="space-y-6 rounded-[var(--radius-card)] border border-border bg-surface p-4 lg:sticky lg:top-24">
            <div>
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Workspaces</p>
              {workspaces.isPending && <Skeleton className="h-9 w-full" />}
              <ul className="space-y-1">
                {workspaces.data?.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/w/${w.id}`}
                      aria-current={w.id === workspaceId ? "page" : undefined}
                      className={`flex min-h-[44px] items-center justify-between gap-2 rounded-[var(--radius-input)] px-2.5 text-sm transition-colors hover:bg-bg-muted ${
                        w.id === workspaceId ? "bg-accent-soft font-medium text-accent" : ""
                      }`}
                    >
                      <span className="truncate">{w.name}</span>
                      <span className="shrink-0 font-mono text-xs text-text-muted">{w._count.projects}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {workspaces.data?.length === 0 && (
                <p className="px-1 text-sm text-text-muted">No workspaces yet.</p>
              )}
              <Link
                href="/"
                className="mt-2 flex min-h-[44px] items-center gap-2 rounded-[var(--radius-input)] px-2.5 text-sm font-medium text-link hover:bg-bg-muted"
              >
                <Plus className="size-4" aria-hidden="true" />
                New workspace
              </Link>
            </div>

            {workspaceId && (
              <div>
                <p className="mb-2 flex items-center gap-1 px-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  <ChevronDown className="size-3" aria-hidden="true" />
                  {currentWorkspace?.name ?? "Projects"}
                </p>
                {projects.isPending && <Skeleton className="h-9 w-full" />}
                <ul className="space-y-1">
                  {projects.data?.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/p/${p.id}`}
                        aria-current={p.id === projectId ? "page" : undefined}
                        className={`flex min-h-[44px] items-center gap-2 rounded-[var(--radius-input)] px-2.5 text-sm transition-colors hover:bg-bg-muted ${
                          p.id === projectId ? "bg-accent-soft font-medium text-accent" : ""
                        }`}
                      >
                        <span className="shrink-0 font-mono text-xs text-text-muted">{p.key}</span>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {projects.data?.length === 0 && (
                  <p className="px-1 text-sm text-text-muted">No projects yet.</p>
                )}
                <Link href={`/w/${workspaceId}`} className={buttonClass("ghost", "mt-2 w-full")}>
                  <Plus className="size-4" aria-hidden="true" />
                  New project
                </Link>
              </div>
            )}
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-16">
          {me.isPending && <Skeleton className="h-40 w-full" />}
          {me.isError && (
            <p role="alert" className="text-sm text-danger">
              Could not reach the API. Is it running on port 4000?
            </p>
          )}
          {me.data && children}
        </main>
      </div>
    </div>
  );
}
