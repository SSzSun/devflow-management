"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderGit2, Users } from "lucide-react";
import { useCreateWorkspace, useWorkspaces } from "@/lib/api";
import { Card, EmptyState, ErrorNotice, ListSkeleton, PageHeading, buttonClass, fieldClass } from "@/components/ui";

/** Workspace picker: the app's landing surface after sign-in. */
export default function HomePage() {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const create = useCreateWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ws = await create.mutateAsync({ name, slug });
      router.push(`/w/${ws.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace");
    }
  }

  return (
    <>
      <PageHeading
        title="Workspaces"
        subtitle="Every project you can reach lives inside a workspace."
        action={
          <button type="button" onClick={() => setCreating((v) => !v)} className={buttonClass("primary")}>
            <Users className="size-4" aria-hidden="true" />
            {creating ? "Cancel" : "New workspace"}
          </button>
        }
      />

      {creating && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ws-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="ws-name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Acme Engineering"
              />
            </div>
            <div>
              <label htmlFor="ws-slug" className="mb-1.5 block text-sm font-medium">
                Slug
              </label>
              <input
                id="ws-slug"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={`${fieldClass} font-mono`}
                placeholder="acme-eng"
                aria-describedby="ws-slug-hint"
              />
              <p id="ws-slug-hint" className="mt-1 text-xs text-text-muted">
                3-40 lowercase letters, digits and dashes.
              </p>
            </div>
            {error && (
              <div className="sm:col-span-2">
                <ErrorNotice error={error} />
              </div>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={create.isPending} className={buttonClass("primary")}>
                {create.isPending ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {workspaces.isPending && <ListSkeleton rows={2} />}
      {workspaces.isError && <ErrorNotice error={workspaces.error} />}
      {workspaces.data?.length === 0 && !creating && (
        <EmptyState
          icon={<FolderGit2 className="size-6" aria-hidden="true" />}
          title="No workspaces yet"
          description="A workspace holds your team's projects, members and issue history."
          action={
            <button type="button" onClick={() => setCreating(true)} className={buttonClass("primary")}>
              Create your first workspace
            </button>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.data?.map((w) => (
          <Link
            key={w.id}
            href={`/w/${w.id}`}
            className="group rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition-all hover:border-accent/40 hover:shadow-[var(--shadow-card-hover)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="truncate text-base font-semibold group-hover:text-accent">{w.name}</h2>
              <span className="shrink-0 font-mono text-xs text-text-muted">{w.slug}</span>
            </div>
            <div className="mt-4 flex gap-6 text-sm text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <FolderGit2 className="size-4" aria-hidden="true" />
                {w._count.projects} projects
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" aria-hidden="true" />
                {w._count.members} members
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
