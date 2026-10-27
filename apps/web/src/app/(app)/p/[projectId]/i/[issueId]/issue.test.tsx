import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IssuePage from "@/app/(app)/p/[projectId]/i/[issueId]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1", issueId: "a" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const issue = {
  id: "a",
  number: 1,
  title: "First task",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  assigneeId: null,
  createdById: "u1",
  dueDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  assignee: null,
  createdBy: { id: "u1", name: "Test", email: "t@devflow.test", avatarUrl: null },
  labels: [],
  project: { id: "p1", key: "WEB", name: "Web", workspaceId: "w1" },
};

/** A workspace admin with no ProjectMember row still gets MEMBER/ADMIN-free access in the API; here we only need a writable role. */
function setup(archivedAt: string | null, role = "ADMIN") {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return json({ id: "u1", name: "Test", email: "t@devflow.test" });
      if (u.includes("/issues/a/comments")) return json({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } });
      if (u.includes("/issues/a/activities")) return json([]);
      if (u.endsWith("/issues/a")) return json(issue);
      if (u.includes("/projects/p1/labels")) return json([]);
      if (u.includes("/projects/p1/members")) return json([]);
      if (u.includes("/projects/p1")) return json({ id: "p1", key: "WEB", name: "Web", role, archivedAt, workspace: { id: "w1", name: "W", slug: "w" } });
      return json({});
    }),
  );
  document.cookie = "csrf_token=test";
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <IssuePage />
    </QueryClientProvider>
  );
}

// No vitest globals, so Testing Library cannot register its own auto-cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("issue page", () => {
  it("offers write controls on an active project", async () => {
    render(setup(null));
    expect(await screen.findByRole("button", { name: /Edit/ })).toBeDefined();
    expect(screen.getByLabelText("Add a comment")).toBeDefined();
    expect(screen.getByText("Move to")).toBeDefined();
  });

  it("hides edit, move and comment controls once the project is archived", async () => {
    render(setup("2026-02-01T00:00:00.000Z"));
    // The comment section renders its archived notice instead of the form.
    expect(await screen.findByText("This project is archived. Restore it to comment.")).toBeDefined();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.queryByText("Move to")).toBeNull();
  });
});
