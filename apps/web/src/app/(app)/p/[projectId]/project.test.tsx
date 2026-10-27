import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectPage from "@/app/(app)/p/[projectId]/page";

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }));

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** Project role is set per test; the page only needs project/labels/members/issues to render. */
function setup(role: string, archivedAt: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/issues")) return json({ data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } });
      if (u.includes("/labels")) return json([]);
      if (u.includes("/members")) return json([]);
      if (u.includes("/projects/p1")) return json({ id: "p1", key: "WEB", name: "Web", role, archivedAt, workspace: { id: "w1", name: "W", slug: "w" } });
      return json({});
    }),
  );
  document.cookie = "csrf_token=test";
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ProjectPage />
    </QueryClientProvider>
  );
}

// No vitest globals, so Testing Library cannot register its own auto-cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("project page", () => {
  it("offers New issue to a project member", async () => {
    render(setup("MEMBER"));
    expect(await screen.findByRole("button", { name: /New issue/ })).toBeDefined();
  });

  it("hides New issue from a viewer", async () => {
    render(setup("VIEWER"));
    expect(await screen.findByText("Web")).toBeDefined();
    expect(screen.queryByRole("button", { name: /New issue/ })).toBeNull();
  });

  it("hides New issue and shows the notice on an archived project", async () => {
    render(setup("ADMIN", "2026-02-01T00:00:00.000Z"));
    expect(
      await screen.findByText("This project is archived. Issues are read-only until an admin restores it."),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /New issue/ })).toBeNull();
  });
});
