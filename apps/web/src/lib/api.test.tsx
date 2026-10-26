import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMoveIssue, type Issue, type Paged } from "@/lib/api";

function issue(id: string, status: Issue["status"]): Issue {
  return {
    id,
    number: 1,
    title: `Issue ${id}`,
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
  };
}

const KEY = ["project", "p1", "issues", {}] as const;

function setup(respond: () => Response) {
  vi.stubGlobal("fetch", vi.fn(respond));
  document.cookie = "csrf_token=test";
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  qc.setQueryData<Paged<Issue>>([...KEY], {
    data: [issue("a", "TODO"), issue("b", "TODO")],
    meta: { page: 1, limit: 25, total: 2, totalPages: 1 },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const statusOf = (qc: QueryClient, id: string) =>
  qc.getQueryData<Paged<Issue>>([...KEY])?.data.find((i) => i.id === id)?.status;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useMoveIssue", () => {
  it("moves the card optimistically, before the request resolves", async () => {
    let release: (() => void) | undefined;
    const { qc, wrapper } = setup(() => {
      return {
        ok: true,
        status: 200,
        json: async () => {
          await new Promise<void>((r) => (release = r));
          return issue("a", "IN_PROGRESS");
        },
      } as unknown as Response;
    });

    const { result } = renderHook(() => useMoveIssue("p1"), { wrapper });
    const pending = result.current.mutateAsync({ issueId: "a", status: "IN_PROGRESS" });

    // The column updates while the PATCH is still in flight.
    await waitFor(() => expect(statusOf(qc, "a")).toBe("IN_PROGRESS"));
    expect(statusOf(qc, "b")).toBe("TODO");

    release?.();
    await pending;
  });

  it("rolls the card back to its old column when the transition is rejected", async () => {
    const { qc, wrapper } = setup(
      () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({ message: "Invalid status transition" }),
        }) as unknown as Response,
    );

    const { result } = renderHook(() => useMoveIssue("p1"), { wrapper });
    await expect(result.current.mutateAsync({ issueId: "a", status: "DONE" })).rejects.toThrow(
      "Invalid status transition",
    );

    // A rejected move must never be left looking applied.
    await waitFor(() => expect(statusOf(qc, "a")).toBe("TODO"));
  });
});