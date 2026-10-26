"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MoveRight, Pencil, Trash2, X } from "lucide-react";
import {
  ISSUE_PRIORITIES,
  STATUS_TRANSITIONS,
  canTransition,
  hasProjectRole,
  type IssuePriority,
  type IssueStatus,
} from "@devflow/shared";
import {
  useChangeStatus,
  useCreateComment,
  useDeleteComment,
  useDeleteIssue,
  useIssue,
  useIssueActivities,
  useIssueComments,
  useLabels,
  useMe,
  useProject,
  useProjectMembers,
  useUpdateComment,
  useUpdateIssue,
} from "@/lib/api";
import {
  Avatar,
  Card,
  ErrorNotice,
  LabelChip,
  ListSkeleton,
  PriorityBadge,
  StatusBadge,
  buttonClass,
  fieldClass,
  priorityLabel,
  statusLabel,
} from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  created: "created this issue",
  title_changed: "changed the title",
  description_changed: "updated the description",
  priority_changed: "changed the priority",
  due_date_changed: "changed the due date",
  assignee_changed: "changed the assignee",
  labels_changed: "updated the labels",
  status_changed: "moved the status",
  comment_added: "commented",
  comment_edited: "edited a comment",
  comment_deleted: "deleted a comment",
  deleted: "deleted this issue",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Assignee activity stores user ids; the member list turns them back into names. */
function nameOf(id: string | null, names: Map<string, string>): string {
  if (!id) return "Unassigned";
  return names.get(id) ?? "someone";
}

export default function IssuePage() {
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const router = useRouter();

  const me = useMe();
  const project = useProject(projectId);
  const issue = useIssue(issueId);
  const labels = useLabels(projectId);
  const members = useProjectMembers(projectId);
  const activities = useIssueActivities(issueId);
  const comments = useIssueComments(issueId);

  const update = useUpdateIssue(issueId);
  const changeStatus = useChangeStatus(issueId);
  const remove = useDeleteIssue(projectId);
  const addComment = useCreateComment(issueId);
  const editComment = useUpdateComment(issueId);
  const removeComment = useDeleteComment(issueId);

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const role = project.data?.role;
  const canWrite = role ? hasProjectRole(role, "MEMBER") : false;
  const isAdmin = role ? hasProjectRole(role, "ADMIN") : false;
  const readOnly = Boolean(project.data?.archivedAt) || !canWrite;

  const names = new Map(members.data?.map((m) => [m.user.id, m.user.name]) ?? []);

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      return false;
    }
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const priority = String(form.get("priority") ?? "");
    const assignee = String(form.get("assigneeId") ?? "");
    const due = String(form.get("dueDate") ?? "");
    if (await run(
      () =>
        update.mutateAsync({
          title,
          description,
          priority: priority || undefined,
          assigneeId: assignee === "" ? null : assignee,
          dueDate: due === "" ? null : new Date(due).toISOString(),
          labelIds: form.getAll("labelIds").map(String),
        }),
      "Could not save the issue",
    )) setEditing(false);
  }

  async function onComment(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => addComment.mutateAsync(body.trim()), "Could not post the comment")) setBody("");
  }

  async function onDeleteIssue() {
    if (!window.confirm("Delete this issue? This cannot be undone.")) return;
    if (await run(() => remove.mutateAsync(issueId), "Could not delete the issue")) router.push(`/p/${projectId}`);
  }

  if (issue.isPending) return <ListSkeleton rows={4} />;
  if (issue.isError) return <ErrorNotice error={issue.error} />;

  const data = issue.data;
  if (!data) return null;
  const ref = `${data.project.key}-${data.number}`;

  return (
    <>
      <Link href={`/p/${projectId}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-link">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {data.project.name}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm text-text-muted">{ref}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">{data.title}</h1>
              </div>
              {canWrite && !readOnly && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing((v) => !v)} className={buttonClass("ghost")}>
                    {editing ? <X className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
                    {editing ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteIssue()}
                    disabled={remove.isPending}
                    className={buttonClass("danger")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4">
                <ErrorNotice error={error} />
              </div>
            )}

            {editing ? (
              <form onSubmit={onSave} className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="e-title" className="mb-1.5 block text-sm font-medium">
                    Title
                  </label>
                  <input id="e-title" name="title" required maxLength={200} defaultValue={data.title} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="e-desc" className="mb-1.5 block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="e-desc"
                    name="description"
                    rows={6}
                    maxLength={10000}
                    defaultValue={data.description ?? ""}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="e-priority" className="mb-1.5 block text-sm font-medium">
                    Priority
                  </label>
                  <select id="e-priority" name="priority" defaultValue={data.priority} className={fieldClass}>
                    {ISSUE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {priorityLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="e-assignee" className="mb-1.5 block text-sm font-medium">
                    Assignee
                  </label>
                  <select id="e-assignee" name="assigneeId" defaultValue={data.assigneeId ?? ""} className={fieldClass}>
                    <option value="">Unassigned</option>
                    {members.data?.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="e-due" className="mb-1.5 block text-sm font-medium">
                    Due date
                  </label>
                  <input
                    id="e-due"
                    name="dueDate"
                    type="date"
                    defaultValue={data.dueDate ? data.dueDate.slice(0, 10) : ""}
                    className={fieldClass}
                  />
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1.5 text-sm font-medium">Labels</legend>
                  <div className="flex flex-wrap gap-2">
                    {labels.data?.length === 0 && <p className="text-sm text-text-muted">No labels yet.</p>}
                    {labels.data?.map((l) => (
                      <label
                        key={l.id}
                        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-chip)] border border-border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="labelIds"
                          value={l.id}
                          defaultChecked={data.labels.some((x) => x.label.id === l.id)}
                          className="size-4"
                        />
                        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={update.isPending} className={buttonClass("primary")}>
                    {update.isPending ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-4 whitespace-pre-wrap text-sm text-text-muted">
                {data.description || "No description."}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold">Comments</h2>
            {comments.isPending && <ListSkeleton rows={2} />}
            {comments.isError && <ErrorNotice error={comments.error} />}
            {comments.data?.data.length === 0 && <p className="text-sm text-text-muted">No comments yet.</p>}
            <ul className="space-y-4">
              {comments.data?.data.map((c) => {
                const mine = c.author.id === me.data?.id;
                const mayEdit = (mine || isAdmin) && !readOnly;
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={c.author.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-medium">{c.author.name}</span>
                        <time dateTime={c.createdAt} className="text-xs text-text-muted">
                          {when(c.createdAt)}
                        </time>
                        {c.updatedAt !== c.createdAt && <span className="text-xs text-text-muted">(edited)</span>}
                      </p>
                      {editingComment === c.id ? (
                        <form
                          className="mt-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const saved = await run(
                              () => editComment.mutateAsync({ commentId: c.id, body: draft.trim() }),
                              "Could not save the comment",
                            );
                            if (saved) setEditingComment(null);
                          }}
                        >
                          <label htmlFor={`edit-${c.id}`} className="sr-only">
                            Edit comment
                          </label>
                          <textarea
                            id={`edit-${c.id}`}
                            rows={3}
                            required
                            maxLength={10000}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className={fieldClass}
                          />
                          <div className="mt-2 flex gap-2">
                            <button type="submit" disabled={editComment.isPending} className={buttonClass("primary")}>
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingComment(null)} className={buttonClass("ghost")}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                      )}
                      {mayEdit && editingComment !== c.id && (
                        <div className="mt-1 flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingComment(c.id);
                              setDraft(c.body);
                            }}
                            className="min-h-11 text-xs font-medium text-link"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Delete this comment?"))
                                void run(() => removeComment.mutateAsync(c.id), "Could not delete the comment");
                            }}
                            className="min-h-11 text-xs font-medium text-danger"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <form onSubmit={onComment} className="mt-5">
              <label htmlFor="new-comment" className="mb-1.5 block text-sm font-medium">
                Add a comment
              </label>
              <textarea
                id="new-comment"
                rows={3}
                required
                maxLength={10000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={fieldClass}
                placeholder="Write an update…"
              />
              <button type="submit" disabled={addComment.isPending} className={buttonClass("primary", "mt-2")}>
                {addComment.isPending ? "Posting…" : "Comment"}
              </button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-base font-semibold">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Status</dt>
                <dd>
                  <StatusBadge status={data.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Priority</dt>
                <dd>
                  <PriorityBadge priority={data.priority} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Assignee</dt>
                <dd className="flex items-center gap-2">
                  {data.assignee ? (
                    <>
                      <Avatar name={data.assignee.name} />
                      <span className="truncate">{data.assignee.name}</span>
                    </>
                  ) : (
                    <span className="text-text-muted">Unassigned</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Due</dt>
                <dd className="text-text-muted">{data.dueDate ? data.dueDate.slice(0, 10) : "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-text-muted">Created by</dt>
                <dd className="truncate">{data.createdBy.name}</dd>
              </div>
            </dl>

            {data.labels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {data.labels.map(({ label }) => (
                  <LabelChip key={label.id} name={label.name} color={label.color} />
                ))}
              </div>
            )}

            {!readOnly && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Move to</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_TRANSITIONS[data.status].map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={changeStatus.isPending}
                      onClick={() =>
                        void run(
                          () => changeStatus.mutateAsync(next),
                          "Could not change the status",
                        )
                      }
                      className={buttonClass("ghost")}
                    >
                      <MoveRight className="size-4" aria-hidden="true" />
                      {statusLabel(next)}
                    </button>
                  ))}
                </div>
                {!canTransition(data.status, "DONE") && data.status !== "DONE" && (
                  <p className="mt-2 text-xs text-text-muted">Reviews must pass through In review before Done.</p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold">Activity</h2>
            {activities.isPending && <ListSkeleton rows={3} />}
            {activities.isError && <ErrorNotice error={activities.error} />}
            {activities.data?.length === 0 && <p className="text-sm text-text-muted">No activity yet.</p>}
            <ol className="space-y-3">
              {activities.data?.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <Avatar name={a.actor.name} />
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{a.actor.name}</span>{" "}
                      <span className="text-text-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
                    </p>
                    {a.action === "status_changed" && a.fromValue && a.toValue && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {statusLabel(a.fromValue as IssueStatus)} → {statusLabel(a.toValue as IssueStatus)}
                      </p>
                    )}
                    {a.action === "priority_changed" && a.fromValue && a.toValue && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {priorityLabel(a.fromValue as IssuePriority)} → {priorityLabel(a.toValue as IssuePriority)}
                      </p>
                    )}
                    {a.action === "assignee_changed" && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {nameOf(a.fromValue, names)} → {nameOf(a.toValue, names)}
                      </p>
                    )}
                    {a.action === "due_date_changed" && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {a.fromValue ? a.fromValue.slice(0, 10) : "none"} → {a.toValue ? a.toValue.slice(0, 10) : "none"}
                      </p>
                    )}
                    {a.action === "title_changed" && a.toValue && (
                      <p className="mt-0.5 break-words text-xs text-text-muted">
                        {a.fromValue ? `${a.fromValue} → ` : ""}
                        {a.toValue}
                      </p>
                    )}
                    <time dateTime={a.createdAt} className="mt-0.5 block text-xs text-text-muted">
                      {when(a.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
