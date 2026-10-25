export const ISSUE_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PROJECT_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/**
 * Allowed workflow transitions. Any transition not in this map is rejected.
 * IN_REVIEW can go back to IN_PROGRESS; DONE can reopen to IN_PROGRESS.
 */
export const STATUS_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_REVIEW"],
  IN_REVIEW: ["DONE", "IN_PROGRESS"],
  DONE: ["IN_PROGRESS"],
};

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Server-side sort allowlist — client sort fields map to these DB columns. */
export const ISSUE_SORT_FIELDS = ["createdAt", "updatedAt", "dueDate", "priority", "status"] as const;
export type IssueSortField = (typeof ISSUE_SORT_FIELDS)[number];

export function isIssueSortField(v: string): v is IssueSortField {
  return (ISSUE_SORT_FIELDS as readonly string[]).includes(v);
}
