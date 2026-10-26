"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssuePriority, IssueSortField, IssueStatus, ProjectRole, WorkspaceRole } from "@devflow/shared";

// ---------------------------------------------------------------- transport

function readCsrfCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m?.[1] ?? "";
}

/** The API's error body is { statusCode, message, error }; message may be a list. */
async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
  return new Error(message ?? `Request failed (${res.status})`);
}

/**
 * Single fetch path for the whole app. On a 401 it refreshes the access token
 * once and replays, so a 15-minute token expiry is invisible to the user.
 */
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = readCsrfCookie();
    return fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
  };

  if (method !== "GET" && !readCsrfCookie()) {
    await fetch("/api/v1/auth/csrf", { credentials: "include" });
  }

  let res = await send();
  if (res.status === 401) {
    const refreshed = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": readCsrfCookie() },
      credentials: "include",
    });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) throw await failure(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ------------------------------------------------------------------- types

export interface UserRef {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Me extends UserRef {
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  _count: { projects: number; members: number };
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  role: WorkspaceRole;
}

export interface Member<R extends string> {
  role: R;
  joinedAt: string;
  user: UserRef;
}

export interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  workspaceId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { issues: number; members: number };
}

export interface ProjectDetail extends ProjectSummary {
  workspace: { id: string; name: string; slug: string };
  role: ProjectRole;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: UserRef | null;
  createdBy: UserRef;
  labels: { label: Label }[];
}

export interface IssueDetail extends Issue {
  project: { id: string; key: string; name: string; workspaceId: string };
}

export interface Activity {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null };
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: UserRef;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface IssueFilters {
  search?: string;
  status?: IssueStatus[];
  priority?: IssuePriority[];
  assigneeId?: string;
  labelIds?: string[];
  sortBy?: IssueSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

/** Drops empty values, then joins arrays as CSV — the shape the DTOs expect. */
function qs(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// -------------------------------------------------------------- auth / me

/** Returns null when not signed in (401), throws on other failures. */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/v1/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw await failure(res);
  return (await res.json()) as Me;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: fetchMe });
}

export function logout() {
  return api<{ success: boolean }>("POST", "/auth/logout");
}

export function useLogin() {
  return useMutation({
    mutationFn: (v: { email: string; password: string }) =>
      api<{ csrfToken: string }>("POST", "/auth/login", v),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (v: { email: string; name: string; password: string }) =>
      api<{ csrfToken: string }>("POST", "/auth/register", v),
  });
}

// ---------------------------------------------------------------- workspaces

export function useWorkspaces() {
  return useQuery({ queryKey: ["workspaces"], queryFn: () => api<WorkspaceSummary[]>("GET", "/workspaces") });
}

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => api<WorkspaceDetail>("GET", `/workspaces/${workspaceId}`),
  });
}

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => api<Member<WorkspaceRole>[]>("GET", `/workspaces/${workspaceId}/members`),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; slug: string }) => api<WorkspaceDetail>("POST", "/workspaces", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useUpdateWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string }) => api<WorkspaceDetail>("PATCH", `/workspaces/${workspaceId}`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });
}

export function useAddWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; role: "ADMIN" | "MEMBER" }) =>
      api<Member<WorkspaceRole>>("POST", `/workspaces/${workspaceId}/members`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useUpdateWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: "ADMIN" | "MEMBER" }) =>
      api<Member<WorkspaceRole>>("PATCH", `/workspaces/${workspaceId}/members/${v.userId}`, { role: v.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] }),
  });
}

export function useRemoveWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<{ success: boolean }>("DELETE", `/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] }),
  });
}

// ------------------------------------------------------------------ projects

export function useProjects(workspaceId: string | null, includeArchived = false) {
  return useQuery({
    queryKey: ["projects", workspaceId, includeArchived],
    enabled: workspaceId !== null,
    queryFn: () =>
      api<ProjectSummary[]>("GET", `/workspaces/${workspaceId}/projects${includeArchived ? "?includeArchived=true" : ""}`),
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ["project", projectId],
    enabled: projectId !== null,
    queryFn: () => api<ProjectDetail>("GET", `/projects/${projectId}`),
  });
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId, "members"],
    queryFn: () => api<Member<ProjectRole>[]>("GET", `/projects/${projectId}/members`),
  });
}

export function useCreateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; key: string; description?: string }) =>
      api<ProjectSummary>("POST", `/workspaces/${workspaceId}/projects`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", workspaceId] }),
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name?: string; description?: string }) =>
      api<ProjectSummary>("PATCH", `/projects/${projectId}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useArchiveProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      archive
        ? api<ProjectSummary>("DELETE", `/projects/${projectId}`)
        : api<ProjectSummary>("POST", `/projects/${projectId}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; role: ProjectRole }) =>
      api<Member<ProjectRole>>("POST", `/projects/${projectId}/members`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId, "members"] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
}

export function useUpdateProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: ProjectRole }) =>
      api<Member<ProjectRole>>("PATCH", `/projects/${projectId}/members/${v.userId}`, { role: v.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId, "members"] }),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<{ success: boolean }>("DELETE", `/projects/${projectId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId, "members"] }),
  });
}

// -------------------------------------------------------------------- labels

export function useLabels(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId, "labels"],
    queryFn: () => api<Label[]>("GET", `/projects/${projectId}/labels`),
  });
}

export function useCreateLabel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; color: string }) => api<Label>("POST", `/projects/${projectId}/labels`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId, "labels"] }),
  });
}

export function useDeleteLabel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => api<{ success: boolean }>("DELETE", `/labels/${labelId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId, "labels"] }),
  });
}

// -------------------------------------------------------------------- issues

export function useIssues(projectId: string, filters: IssueFilters) {
  return useQuery({
    queryKey: ["project", projectId, "issues", filters],
    queryFn: () =>
      api<Paged<Issue>>(
        "GET",
        `/projects/${projectId}/issues${qs({ ...filters, assigneeId: filters.assigneeId })}`,
      ),
    placeholderData: (prev) => prev, // keep the table steady while paging
  });
}

export function useIssue(issueId: string) {
  return useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => api<IssueDetail>("GET", `/issues/${issueId}`),
  });
}

export function useIssueActivities(issueId: string) {
  return useQuery({
    queryKey: ["issue", issueId, "activities"],
    queryFn: () => api<Activity[]>("GET", `/issues/${issueId}/activities`),
  });
}

export function useIssueComments(issueId: string) {
  return useQuery({
    queryKey: ["issue", issueId, "comments"],
    queryFn: () => api<Paged<Comment>>("GET", `/issues/${issueId}/comments?limit=100`),
  });
}

export function useCreateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Record<string, unknown>) => api<Issue>("POST", `/projects/${projectId}/issues`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
  });
}

export function useUpdateIssue(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Record<string, unknown>) => api<Issue>("PATCH", `/issues/${issueId}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

/** The only status path. The API rejects any transition outside the workflow. */
export function useChangeStatus(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: IssueStatus) => api<Issue>("PATCH", `/issues/${issueId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useDeleteIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => api<{ success: boolean }>("DELETE", `/issues/${issueId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
  });
}

// ------------------------------------------------------------------ comments

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api<Comment>("POST", `/issues/${issueId}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId, "comments"] });
      qc.invalidateQueries({ queryKey: ["issue", issueId, "activities"] });
    },
  });
}

export function useUpdateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { commentId: string; body: string }) =>
      api<Comment>("PATCH", `/comments/${v.commentId}`, { body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", issueId] }),
  });
}

export function useDeleteComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api<{ success: boolean }>("DELETE", `/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", issueId] }),
  });
}

/**
 * Board moves are optimistic: the card lands in its new column immediately and a
 * failed PATCH puts it back, so a rejected transition can never look applied.
 */
export function useMoveIssue(projectId: string) {
  const qc = useQueryClient();
  const key = ["project", projectId, "issues"];
  return useMutation({
    mutationFn: (v: { issueId: string; status: IssueStatus }) =>
      api<Issue>("PATCH", `/issues/${v.issueId}/status`, { status: v.status }),
    onMutate: async ({ issueId, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData<Paged<Issue>>({ queryKey: key });
      for (const [k, page] of snapshot) {
        if (!page) continue;
        qc.setQueryData<Paged<Issue>>(k, {
          ...page,
          data: page.data.map((i) => (i.id === issueId ? { ...i, status } : i)),
        });
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      for (const [k, page] of ctx?.snapshot ?? []) qc.setQueryData(k, page);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
