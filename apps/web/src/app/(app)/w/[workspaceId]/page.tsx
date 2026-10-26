"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, FolderGit2, Plus, Users } from "lucide-react";
import { useCreateProject, useProjects, useWorkspace } from "@/lib/api";
import {
  Card,
  EmptyState,
  ErrorNotice,
  ListSkeleton,
  PageHeading,
  buttonClass,
  fieldClass,
} from "@/components/ui";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const workspace = useWorkspace(workspaceId);
  const projects = useProjects(workspaceId);

  const create = useCreateProject(workspaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isAdmin = workspace.data?.role === "OWNER" || workspace.data?.role === "ADMIN";

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const project = await create.mutateAsync({ name, key, description: description || undefined });
      router.push(`/p/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    }
  }

  return (
    <>
      <PageHeading
        title={workspace.data?.name ?? "Workspace"}
        subtitle={workspace.data ? `/${workspace.data.slug}` : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/w/${workspaceId}/settings`} className={buttonClass("ghost")}>
              <Users className="size-4" aria-hidden="true" />
              Members
            </Link>
            {isAdmin && (
              <button type="button" onClick={() => setCreating((v) => !v)} className={buttonClass("primary")}>
                <Plus className="size-4" aria-hidden="true" />
                {creating ? "Cancel" : "New project"}
              </button>
            )}
          </div>
        }
      />

      {creating && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="p-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="p-name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Web platform"
              />
            </div>
            <div>
              <label htmlFor="p-key" className="mb-1.5 block text-sm font-medium">
                Key
              </label>
              <input
                id="p-key"
                required
                minLength={2}
                maxLength={10}
                pattern="[A-Z][A-Z0-9]{1,9}"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className={`${fieldClass} font-mono uppercase`}
                placeholder="WEB"
                aria-describedby="p-key-hint"
              />
              <p id="p-key-hint" className="mt-1 text-xs text-text-muted">
                Prefixes issue ids, e.g. WEB-101. 2-10 uppercase letters or digits.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="p-desc" className="mb-1.5 block text-sm font-medium">
                Description <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <textarea
                id="p-desc"
                rows={2}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={fieldClass}
              />
            </div>
            {error && (
              <div className="sm:col-span-2">
                <ErrorNotice error={error} />
              </div>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={create.isPending} className={buttonClass("primary")}>
                {create.isPending ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {projects.isPending && <ListSkeleton rows={3} />}
      {projects.isError && <ErrorNotice error={projects.error} />}

      {projects.data?.length === 0 && (
        <EmptyState
          icon={<FolderGit2 className="size-6" aria-hidden="true" />}
          title="No projects in this workspace"
          description={
            isAdmin
              ? "Create a project to start tracking issues with a shared workflow."
              : "A workspace admin has not added you to a project yet."
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.data?.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className="group rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all hover:border-accent/40"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-bg-muted px-1.5 py-0.5 font-mono text-xs text-text-muted">{p.key}</span>
              {p.archivedAt && (
                <span className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                  <Archive className="size-3" aria-hidden="true" />
                  Archived
                </span>
              )}
            </div>
            <h2 className="mt-2 truncate text-base font-semibold group-hover:text-accent">{p.name}</h2>
            {p.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{p.description}</p>}
            <p className="mt-3 text-xs text-text-muted">
              {p._count.issues} issues · {p._count.members} members
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
