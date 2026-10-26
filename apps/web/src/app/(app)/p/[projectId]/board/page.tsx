"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GripVertical, List, MoveRight } from "lucide-react";
import {
  ISSUE_STATUSES,
  STATUS_TRANSITIONS,
  canTransition,
  hasProjectRole,
  type IssueStatus,
} from "@devflow/shared";
import { useIssues, useMoveIssue, useProject, type Issue } from "@/lib/api";
import {
  Avatar,
  EmptyState,
  ErrorNotice,
  ListSkeleton,
  PageHeading,
  PriorityBadge,
  StatusBadge,
  buttonClass,
  statusLabel,
} from "@/components/ui";

/** One query for the whole board: 100 is the API's max page size. */
const BOARD_LIMIT = 100;

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const issues = useIssues(projectId, { limit: BOARD_LIMIT, sortBy: "priority", sortOrder: "desc" });
  const move = useMoveIssue(projectId);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = project.data ? hasProjectRole(project.data.role, "MEMBER") : false;
  const readOnly = Boolean(project.data?.archivedAt) || !canWrite;

  async function onMove(issue: Issue, status: IssueStatus) {
    if (!canTransition(issue.status, status)) {
      // Dropping onto a column the workflow forbids: say so instead of a silent snap-back.
      setError(`${statusLabel(issue.status)} cannot move straight to ${statusLabel(status)}.`);
      return;
    }
    setError(null);
    try {
      await move.mutateAsync({ issueId: issue.id, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the issue");
    }
  }

  // The issues query 404s alongside the project one, so one early return keeps the alert single.
  if (project.isError) return <ErrorNotice error={project.error} />;

  return (
    <>
      <PageHeading
        title={project.data?.name ?? "Board"}
        subtitle={project.data ? `${project.data.key} · drag a card or use its move buttons` : undefined}
        action={
          <Link href={`/p/${projectId}`} className={buttonClass("ghost")}>
            <List className="size-4" aria-hidden="true" />
            List
          </Link>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNotice error={error} />
        </div>
      )}
      {issues.isError && <ErrorNotice error={issues.error} />}
      {issues.isPending && <ListSkeleton rows={3} />}
      {issues.data?.data.length === 0 && (
        <EmptyState
          icon={<List className="size-6" aria-hidden="true" />}
          title="Nothing on the board"
          description={`${project.data?.key ?? "This project"} has no issues yet.`}
          action={
            <Link href={`/p/${projectId}`} className={buttonClass("primary")}>
              Go to the issue list
            </Link>
          }
        />
      )}

      {issues.data && issues.data.data.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ISSUE_STATUSES.map((status) => {
            const column = issues.data.data.filter((i) => i.status === status);
            return (
              <section
                key={status}
                aria-label={statusLabel(status)}
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const card = issues.data.data.find((i) => i.id === dragging);
                  setDragging(null);
                  if (card) void onMove(card, status);
                }}
                className="flex min-h-[8rem] flex-col rounded-[var(--radius-card)] border border-border bg-bg-muted p-3"
              >
                <h2 className="mb-3 flex items-center justify-between gap-2 px-1">
                  <StatusBadge status={status} />
                  <span className="font-mono text-xs text-text-muted">{column.length}</span>
                </h2>
                <ul className="space-y-2">
                  {column.map((issue) => (
                    <li key={issue.id}>
                      <article
                        draggable={!readOnly}
                        onDragStart={() => setDragging(issue.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`rounded-[var(--radius-input)] border border-border bg-surface p-3 shadow-[var(--shadow-card)] ${
                          dragging === issue.id ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!readOnly && (
                            <GripVertical className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs text-text-muted">
                              {project.data?.key}-{issue.number}
                            </p>
                            <Link
                              href={`/p/${projectId}/i/${issue.id}`}
                              className="mt-0.5 block min-h-[44px] text-sm font-medium hover:text-accent"
                            >
                              {issue.title}
                            </Link>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <PriorityBadge priority={issue.priority} />
                          {issue.assignee && <Avatar name={issue.assignee.name} />}
                        </div>
                        {!readOnly && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {STATUS_TRANSITIONS[issue.status].map((next) => (
                              <button
                                key={next}
                                type="button"
                                disabled={move.isPending}
                                aria-label={`Move ${project.data?.key}-${issue.number} to ${statusLabel(next)}`}
                                onClick={() => void onMove(issue, next)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-2 text-xs font-medium text-link transition-colors hover:bg-bg-muted disabled:opacity-60"
                              >
                                <MoveRight className="size-3.5" aria-hidden="true" />
                                {statusLabel(next)}
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {issues.data && issues.data.meta.total > BOARD_LIMIT && (
        <p className="mt-4 text-sm text-text-muted">
          Showing the first {BOARD_LIMIT} of {issues.data.meta.total} issues.
        </p>
      )}
    </>
  );
}
