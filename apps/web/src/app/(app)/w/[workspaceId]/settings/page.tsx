"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { ASSIGNABLE_WORKSPACE_ROLES, type AssignableWorkspaceRole } from "@devflow/shared";
import {
  useAddWorkspaceMember,
  useMe,
  useRemoveWorkspaceMember,
  useUpdateWorkspace,
  useUpdateWorkspaceMember,
  useWorkspace,
  useWorkspaceMembers,
} from "@/lib/api";
import { Avatar, Card, ErrorNotice, ListSkeleton, PageHeading, buttonClass, fieldClass } from "@/components/ui";

function isAssignable(v: string): v is AssignableWorkspaceRole {
  return (ASSIGNABLE_WORKSPACE_ROLES as readonly string[]).includes(v);
}

const roleName = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const me = useMe();
  const workspace = useWorkspace(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const rename = useUpdateWorkspace(workspaceId);
  const add = useAddWorkspaceMember(workspaceId);
  const update = useUpdateWorkspaceMember(workspaceId);
  const remove = useRemoveWorkspaceMember(workspaceId);

  const [name, setName] = useState<string | null>(null); // null = show the server value
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableWorkspaceRole>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = workspace.data?.role === "OWNER" || workspace.data?.role === "ADMIN";

  async function run(action: () => Promise<unknown>, ok: string, fallback: string) {
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

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (name === null) return;
    if (await run(() => rename.mutateAsync({ name }), "Workspace renamed.", "Could not rename workspace")) setName(null);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => add.mutateAsync({ email, role }), `Added ${email}.`, "Could not add member")) setEmail("");
  }

  return (
    <>
      <Link href={`/w/${workspaceId}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-link">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to workspace
      </Link>
      <PageHeading title="Workspace settings" subtitle={workspace.data?.name} />

      <div className="space-y-6">
        {workspace.isError && <ErrorNotice error={workspace.error} />}
        {error && <ErrorNotice error={error} />}
        {notice && (
          <p role="status" className="rounded-[var(--radius-input)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
            {notice}
          </p>
        )}

        {isAdmin && workspace.data && (
          <Card>
            <h2 className="mb-4 text-base font-semibold">General</h2>
            <form onSubmit={onRename} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="ws-name" className="mb-1.5 block text-sm font-medium">
                  Name
                </label>
                <input
                  id="ws-name"
                  required
                  maxLength={80}
                  value={name ?? workspace.data.name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <button type="submit" disabled={name === null || rename.isPending} className={buttonClass("primary")}>
                {rename.isPending ? "Saving…" : "Save"}
              </button>
            </form>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-base font-semibold">Members</h2>
          {isAdmin && (
            <form onSubmit={onAdd} className="mb-5 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
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
                  onChange={(e) => isAssignable(e.target.value) && setRole(e.target.value)}
                  className={fieldClass}
                >
                  {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={add.isPending} className={buttonClass("primary")}>
                <UserPlus className="size-4" aria-hidden="true" />
                Add
              </button>
            </form>
          )}

          {members.isPending && <ListSkeleton rows={3} />}
          {members.isError && <ErrorNotice error={members.error} />}
          <ul className="divide-y divide-border">
            {members.data?.map((m) => {
              // The API refuses changes to the owner and to yourself; mirror that.
              const editable = isAdmin && m.role !== "OWNER" && m.user.id !== me.data?.id;
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
                        disabled={update.isPending}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (isAssignable(next))
                            void run(() => update.mutateAsync({ userId: m.user.id, role: next }), "Role updated.", "Could not change role");
                        }}
                        className={`${fieldClass} w-auto`}
                      >
                        {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleName(r)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${m.user.name}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.user.name} from this workspace?`))
                            void run(() => remove.mutateAsync(m.user.id), "Member removed.", "Could not remove member");
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
      </div>
    </>
  );
}
