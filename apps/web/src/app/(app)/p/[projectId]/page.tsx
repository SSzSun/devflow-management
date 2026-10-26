"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleDashed,
  KanbanSquare,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  ISSUE_PRIORITIES,
  ISSUE_SORT_FIELDS,
  ISSUE_STATUSES,
  hasProjectRole,
  type IssueSortField,
} from "@devflow/shared";
import { useCreateIssue, useIssues, useLabels, useProject, useProjectMembers, type IssueFilters } from "@/lib/api";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorNotice,
  LabelChip,
  ListSkeleton,
  PageHeading,
  PriorityBadge,
  StatusBadge,
  buttonClass,
  fieldClass,
  priorityLabel,
  statusLabel,
} from "@/components/ui";

const LIMIT = 25;

const SORT_LABEL: Record<IssueSortField, string> = {
  createdAt: "Created",
  updatedAt: "Updated",
  dueDate: "Due date",
  priority: "Priority",
  status: "Status",
};

/** Narrows a <select> value against its allowlist, so nothing unvalidated reaches the query. */
function pick<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const labels = useLabels(projectId);
  const members = useProjectMembers(projectId);

  const [filters, setFilters] = useState<IssueFilters>({ page: 1, limit: LIMIT });
  const issues = useIssues(projectId, filters);
  const create = useCreateIssue(projectId);

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = project.data ? hasProjectRole(project.data.role, "MEMBER") : false;
  const isAdmin = project.data ? hasProjectRole(project.data.role, "ADMIN") : false;
  const archived = Boolean(project.data?.archivedAt);
  const readOnly = archived || !canWrite;
  // Values, not keys: clearing a filter leaves the key behind with an undefined value.
  const filtered = Object.entries(filters).some(([k, v]) => k !== "page" && k !== "limit" && v !== undefined);

  // Any filter change returns to page 1; only paging keeps the page.
  const set = (patch: Partial<IssueFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // currentTarget is nulled after the event dispatch, so keep the element for the reset below.
    const el = e.currentTarget;
    const form = new FormData(el);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const priority = String(form.get("priority") ?? "");
    const assigneeId = String(form.get("assigneeId") ?? "");
    const dueDate = String(form.get("dueDate") ?? "");
    const labelIds = form.getAll("labelIds").map(String);
    try {
      await create.mutateAsync({
        title,
        description: description || undefined,
        priority: priority || undefined,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        labelIds,
      });
      el.reset();
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create issue");
    }
  }

  // The issues query 404s alongside the project one, so one early return keeps the alert single.
  if (project.isError) return <ErrorNotice error={project.error} />;

  const meta = issues.data?.meta;
  const total = meta?.total ?? 0;

  return (
    <>
      <PageHeading
        title={project.data?.name ?? "Project"}
        subtitle={project.data ? `${project.data.key} · ${project.data.workspace.name}` : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/p/${projectId}/board`} className={buttonClass("ghost")}>
              <KanbanSquare className="size-4" aria-hidden="true" />
              Board
            </Link>
            {isAdmin && (
              <Link href={`/p/${projectId}/settings`} className={buttonClass("ghost")}>
                <Settings className="size-4" aria-hidden="true" />
                Settings
              </Link>
            )}
            {!readOnly && (
              <button type="button" onClick={() => setCreating((v) => !v)} className={buttonClass("primary")}>
                <Plus className="size-4" aria-hidden="true" />
                {creating ? "Cancel" : "New issue"}
              </button>
            )}
          </div>
        }
      />

      {archived && (
        <p className="mb-4 rounded-[var(--radius-input)] bg-bg-muted px-3.5 py-2.5 text-sm text-text-muted">
          This project is archived. Issues are read-only until an admin restores it.
        </p>
      )}

      {creating && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="i-title" className="mb-1.5 block text-sm font-medium">
                Title
              </label>
              <input id="i-title" name="title" required maxLength={200} autoFocus className={fieldClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="i-desc" className="mb-1.5 block text-sm font-medium">
                Description <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <textarea id="i-desc" name="description" rows={3} maxLength={10000} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="i-priority" className="mb-1.5 block text-sm font-medium">
                Priority
              </label>
              <select id="i-priority" name="priority" defaultValue="MEDIUM" className={fieldClass}>
                {ISSUE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="i-assignee" className="mb-1.5 block text-sm font-medium">
                Assignee <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <select id="i-assignee" name="assigneeId" defaultValue="" className={fieldClass}>
                <option value="">Unassigned</option>
                {members.data?.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="i-due" className="mb-1.5 block text-sm font-medium">
                Due date <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input id="i-due" name="dueDate" type="date" className={fieldClass} />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Labels</legend>
              <div className="flex flex-wrap gap-2">
                {labels.data?.length === 0 && <p className="text-sm text-text-muted">No labels yet.</p>}
                {labels.data?.map((l) => (
                  <label
                    key={l.id}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-chip)] border border-border px-3 text-sm"
                  >
                    <input type="checkbox" name="labelIds" value={l.id} className="size-4" />
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <div className="sm:col-span-2">
                <ErrorNotice error={error} />
              </div>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={create.isPending} className={buttonClass("primary")}>
                {create.isPending ? "Creating…" : "Create issue"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set({ search: search.trim() || undefined });
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="f-search" className="mb-1.5 block text-sm font-medium">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="f-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or description"
                className={fieldClass}
              />
              <button type="submit" aria-label="Search issues" className={buttonClass("ghost", "w-11 shrink-0 px-0")}>
                <Search className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="f-status" className="mb-1.5 block text-sm font-medium">
              Status
            </label>
            <select
              id="f-status"
              value={filters.status?.[0] ?? ""}
              onChange={(e) => {
                const next = pick(e.target.value, ISSUE_STATUSES);
                set({ status: next ? [next] : undefined });
              }}
              className={fieldClass}
            >
              <option value="">Any</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-priority" className="mb-1.5 block text-sm font-medium">
              Priority
            </label>
            <select
              id="f-priority"
              value={filters.priority?.[0] ?? ""}
              onChange={(e) => {
                const next = pick(e.target.value, ISSUE_PRIORITIES);
                set({ priority: next ? [next] : undefined });
              }}
              className={fieldClass}
            >
              <option value="">Any</option>
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-assignee" className="mb-1.5 block text-sm font-medium">
              Assignee
            </label>
            <select
              id="f-assignee"
              value={filters.assigneeId ?? ""}
              onChange={(e) => set({ assigneeId: e.target.value || undefined })}
              className={fieldClass}
            >
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {members.data?.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-label" className="mb-1.5 block text-sm font-medium">
              Label
            </label>
            <select
              id="f-label"
              value={filters.labelIds?.[0] ?? ""}
              onChange={(e) => set({ labelIds: e.target.value ? [e.target.value] : undefined })}
              className={fieldClass}
            >
              <option value="">Any</option>
              {labels.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="f-sort" className="mb-1.5 block text-sm font-medium">
                Sort by
              </label>
              <select
                id="f-sort"
                value={filters.sortBy ?? "createdAt"}
                onChange={(e) => set({ sortBy: pick(e.target.value, ISSUE_SORT_FIELDS) ?? "createdAt" })}
                className={fieldClass}
              >
                {ISSUE_SORT_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {SORT_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => set({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}
              aria-label={`Sort ${filters.sortOrder === "asc" ? "descending" : "ascending"}`}
              className={buttonClass("ghost", "w-11 shrink-0 px-0")}
            >
              {filters.sortOrder === "asc" ? (
                <ArrowUp className="size-4" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {filtered && (
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilters({ page: 1, limit: LIMIT });
                }}
                className={buttonClass("ghost")}
              >
                <X className="size-4" aria-hidden="true" />
                Clear filters
              </button>
            </div>
          )}
        </form>
      </Card>

      {issues.isPending && <ListSkeleton rows={5} />}
      {issues.isError && <ErrorNotice error={issues.error} />}

      {issues.data && total === 0 && (
        <EmptyState
          icon={<CircleDashed className="size-6" aria-hidden="true" />}
          title={filtered ? "No issues match these filters" : "No issues yet"}
          description={
            filtered
              ? "Try a different search, status or assignee."
              : canWrite
                ? "Create the first issue to start tracking work."
                : "Nothing has been filed in this project yet."
          }
        />
      )}

      {issues.data && total > 0 && (
        <>
          <div className="space-y-2 sm:hidden">
            {issues.data.data.map((issue) => (
              <Link
                key={issue.id}
                href={`/p/${projectId}/i/${issue.id}`}
                className="block rounded-[var(--radius-card)] border border-border bg-surface p-4"
              >
                <p className="font-mono text-xs text-text-muted">
                  {project.data?.key}-{issue.number}
                </p>
                <p className="mt-1 font-medium">{issue.title}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={issue.status} />
                  <PriorityBadge priority={issue.priority} />
                  {issue.assignee && <Avatar name={issue.assignee.name} />}
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface sm:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Issues in {project.data?.name}</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Issue</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-3 font-medium">Assignee</th>
                  <th scope="col" className="px-4 py-3 font-medium">Due</th>
                  <th scope="col" className="px-4 py-3 font-medium">Labels</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {issues.data.data.map((issue) => (
                  <tr key={issue.id} className="transition-colors hover:bg-bg-muted">
                    <td className="px-4 py-3">
                      <Link href={`/p/${projectId}/i/${issue.id}`} className="flex items-baseline gap-2 hover:text-accent">
                        <span className="shrink-0 font-mono text-xs text-text-muted">
                          {project.data?.key}-{issue.number}
                        </span>
                        <span className="font-medium">{issue.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={issue.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={issue.priority} /></td>
                    <td className="px-4 py-3">
                      {issue.assignee ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={issue.assignee.name} />
                          <span className="truncate">{issue.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {issue.dueDate ? issue.dueDate.slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        {issue.labels.map(({ label }) => (
                          <LabelChip key={label.id} name={label.name} color={label.color} />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && total > meta.limit && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: meta.page - 1 }))}
                className={buttonClass("ghost")}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Previous
              </button>
              <p aria-live="polite" className="text-sm text-text-muted">
                Page {meta.page} of {meta.totalPages}
              </p>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: meta.page + 1 }))}
                className={buttonClass("ghost")}
              >
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
