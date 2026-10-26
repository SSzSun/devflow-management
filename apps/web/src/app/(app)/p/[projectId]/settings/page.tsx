"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Tag, Trash2, UserPlus } from "lucide-react";
import { PROJECT_ROLES, hasProjectRole, type ProjectRole } from "@devflow/shared";
import {
  useAddProjectMember,
  useArchiveProject,
  useCreateLabel,
  useDeleteLabel,
  useLabels,
  useMe,
  useProject,
  useProjectMembers,
  useRemoveProjectMember,
  useUpdateProject,
  useUpdateProjectMember,
} from "@/lib/api";
import { Avatar, Card, ErrorNotice, ListSkeleton, PageHeading, buttonClass, fieldClass } from "@/components/ui";

const roleName = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

function isProjectRole(v: string): v is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(v);
}

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const me = useMe();
  const project = useProject(projectId);
  const members = useProjectMembers(projectId);
  const labels = useLabels(projectId);

  const update = useUpdateProject(projectId);
  const archive = useArchiveProject(projectId);
  const addMember = useAddProjectMember(projectId);
  const updateMember = useUpdateProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const createLabel = useCreateLabel(projectId);
  const deleteLabel = useDeleteLabel(projectId);

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("MEMBER");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#6366f1");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = project.data ? hasProjectRole(project.data.role, "ADMIN") : false;
  const archived = Boolean(project.data?.archivedAt);

  async function run(action: () => Promise<unknown>, ok: string, fallback: string): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(ok);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      return false;
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (name === null && description === null) return;
    const body: { name?: string; description?: string } = {};
    if (name !== null) body.name = name;
    if (description !== null) body.description = description;
    if (await run(() => update.mutateAsync(body), "Project updated.", "Could not update the project")) {
      setName(null);
      setDescription(null);
    }
  }

  async function onAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => addMember.mutateAsync({ email, role }), `Added ${email}.`, "Could not add member")) setEmail("");
  }

  async function onAddLabel(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => createLabel.mutateAsync({ name: labelName, color: labelColor }), "Label created.", "Could not create the label"))
      setLabelName("");
  }

  if (project.isPending) return <ListSkeleton rows={3} />;
  if (project.isError || !project.data) return <ErrorNotice error={project.error ?? "Project not found"} />;

  return (
    <>
      <Link href={`/p/${projectId}`} className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm text-link">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to project
      </Link>
      <PageHeading title="Project settings" subtitle={`${project.data.key} · ${project.data.name}`} />

      <div className="space-y-6">
        {error && <ErrorNotice error={error} />}
        {notice && (
          <p role="status" className="rounded-[var(--radius-input)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
            {notice}
          </p>
        )}

        <Card>
          <h2 className="mb-4 text-base font-semibold">General</h2>
          <form onSubmit={onSave} className="grid gap-4">
            <div>
              <label htmlFor="p-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="p-name"
                required
                maxLength={80}
                value={name ?? project.data.name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="p-desc" className="mb-1.5 block text-sm font-medium">
                Description
              </label>
              <textarea
                id="p-desc"
                rows={3}
                maxLength={2000}
                value={description ?? project.data.description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isAdmin}
                className={fieldClass}
              />
            </div>
            {isAdmin && (
              <div>
                <button type="submit" disabled={update.isPending} className={buttonClass("primary")}>
                  {update.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Members</h2>
          {isAdmin && (
            <form onSubmit={onAddMember} className="mb-5 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <div>
                <label htmlFor="m-email" className="mb-1.5 block text-sm font-medium">
                  Email
                </label>
                <input
                  id="m-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="teammate@example.com"
                />
              </div>
              <div>
                <label htmlFor="m-role" className="mb-1.5 block text-sm font-medium">
                  Role
                </label>
                <select
                  id="m-role"
                  value={role}
                  onChange={(e) => isProjectRole(e.target.value) && setRole(e.target.value)}
                  className={fieldClass}
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={addMember.isPending} className={buttonClass("primary")}>
                <UserPlus className="size-4" aria-hidden="true" />
                Add
              </button>
            </form>
          )}

          {members.isPending && <ListSkeleton rows={3} />}
          {members.isError && <ErrorNotice error={members.error} />}
          <ul className="divide-y divide-border">
            {members.data?.map((m) => {
              const editable = isAdmin && m.user.id !== me.data?.id;
              return (
                <li key={m.user.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={m.user.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.user.name}</p>
                    <p className="truncate text-xs text-text-muted">{m.user.email}</p>
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-2">
                      <label htmlFor={`role-${m.user.id}`} className="sr-only">
                        Role for {m.user.name}
                      </label>
                      <select
                        id={`role-${m.user.id}`}
                        value={m.role}
                        disabled={updateMember.isPending}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (isProjectRole(next))
                            void run(
                              () => updateMember.mutateAsync({ userId: m.user.id, role: next }),
                              "Role updated.",
                              "Could not change the role",
                            );
                        }}
                        className={`${fieldClass} w-auto`}
                      >
                        {PROJECT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleName(r)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${m.user.name}`}
                        disabled={removeMember.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.user.name} from this project?`))
                            void run(
                              () => removeMember.mutateAsync(m.user.id),
                              "Member removed.",
                              "Could not remove the member",
                            );
                        }}
                        className={buttonClass("danger", "w-11 px-0")}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-[var(--radius-chip)] bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-muted">
                      {roleName(m.role)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Labels</h2>
          {hasProjectRole(project.data.role, "MEMBER") && !archived && (
            <form onSubmit={onAddLabel} className="mb-5 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <div>
                <label htmlFor="l-name" className="mb-1.5 block text-sm font-medium">
                  Name
                </label>
                <input
                  id="l-name"
                  required
                  maxLength={40}
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  className={fieldClass}
                  placeholder="bug"
                />
              </div>
              <div>
                <label htmlFor="l-color" className="mb-1.5 block text-sm font-medium">
                  Color
                </label>
                <input
                  id="l-color"
                  type="color"
                  required
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                  className={`${fieldClass} h-11 px-1`}
                />
              </div>
              <button type="submit" disabled={createLabel.isPending} className={buttonClass("primary")}>
                <Tag className="size-4" aria-hidden="true" />
                Add
              </button>
            </form>
          )}

          {labels.isPending && <ListSkeleton rows={2} />}
          {labels.isError && <ErrorNotice error={labels.error} />}
          {labels.data?.length === 0 && <p className="text-sm text-text-muted">No labels yet.</p>}
          <ul className="divide-y divide-border">
            {labels.data?.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                <span className="font-mono text-xs text-text-muted">{l.color}</span>
                {isAdmin && (
                  <button
                    type="button"
                    aria-label={`Delete label ${l.name}`}
                    disabled={deleteLabel.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the label "${l.name}"? It is removed from every issue.`))
                        void run(() => deleteLabel.mutateAsync(l.id), "Label deleted.", "Could not delete the label");
                    }}
                    className={buttonClass("danger", "w-11 px-0")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted">Only project admins can delete labels.</p>
        </Card>

        {isAdmin && (
          <Card>
            <h2 className="mb-2 text-base font-semibold">Archive</h2>
            <p className="mb-4 text-sm text-text-muted">
              {archived
                ? "This project is archived. Issues are read-only until it is restored."
                : "Archiving hides the project from the workspace list but keeps every issue."}
            </p>
            <button
              type="button"
              disabled={archive.isPending}
              onClick={() => {
                const message = archived
                  ? "Restore this project?"
                  : "Archive this project? Issues become read-only.";
                if (window.confirm(message))
                  void run(
                    () => archive.mutateAsync(!archived),
                    archived ? "Project restored." : "Project archived.",
                    "Could not change the archive state",
                  );
              }}
              className={buttonClass(archived ? "primary" : "danger")}
            >
              {archived ? (
                <ArchiveRestore className="size-4" aria-hidden="true" />
              ) : (
                <Archive className="size-4" aria-hidden="true" />
              )}
              {archived ? "Restore project" : "Archive project"}
            </button>
          </Card>
        )}
      </div>
    </>
  );
}
