import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoardPage from "@/app/(app)/p/[projectId]/board/page";

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }));

const issue = (id: string, number: number, status: string, title: string) => ({
  id,
  number,
  title,
  description: null,
  status,
  priority: "MEDIUM",
  assigneeId: null,
  createdById: "u1",
  dueDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  assignee: null,
  createdBy: { id: "u1", name: "Test", email: "t@devflow.test", avatarUrl: null },
  labels: [],
});

/** Current user is a project ADMIN, so the board is interactive. */
function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as unknown as Response;
}

function setup(patch: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/status")) return patch();
      if (String(url).includes("/projects/p1/issues")) {
        return json({
          data: [issue("a", 1, "TODO", "First task"), issue("b", 2, "IN_REVIEW", "Second task")],
          meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
        });
      }
      if (String(url).includes("/projects/p1/members")) return json([]);
      if (String(url).includes("/projects/p1")) return json({ id: "p1", key: "WEB", name: "Web", role: "ADMIN" });
      return json({});
    }),
  );
  document.cookie = "csrf_token=test";
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return {
    qc,
    ui: (
      <QueryClientProvider client={qc}>
        <BoardPage />
      </QueryClientProvider>
    ),
  };
}

// No vitest globals, so Testing Library cannot register its own auto-cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("board", () => {
  it("only offers transitions the workflow allows", async () => {
    const { ui } = setup(() => json({}));
    render(ui);

    // TODO may only reach IN_PROGRESS, so no direct-to-Done button exists.
    expect(await screen.findByLabelText("Move WEB-1 to In progress")).toBeDefined();
    expect(screen.queryByLabelText("Move WEB-1 to Done")).toBeNull();
    expect(screen.queryByLabelText("Move WEB-1 to In review")).toBeNull();

    // IN_REVIEW offers both Done and the step back to In progress.
    expect(await screen.findByLabelText("Move WEB-2 to Done")).toBeDefined();
  });

  it("keeps the card in place when the API rejects the move", async () => {
    const { ui } = setup(() => json({ message: "Invalid status transition" }, false));
    render(ui);
    await screen.findByText("First task");

    // Drive the move through the button rather than a synthetic drag event.
    const button = screen.getByLabelText("Move WEB-1 to In progress");
    button.click();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Invalid status transition"));
    // Rolled back: the card is in To do again, not left in the column it was rejected from.
    await waitFor(() => expect(within(screen.getByRole("region", { name: "To do" })).getByText("First task")).toBeDefined());
    expect(within(screen.getByRole("region", { name: "In progress" })).queryByText("First task")).toBeNull();
  });
});