"use client";

import type { IssuePriority, IssueStatus } from "@devflow/shared";

/** Shared field styling: label above, 1px border, 2px accent focus ring (design.md). */
export const fieldClass =
  "w-full rounded-[var(--radius-input)] border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60";

export const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 text-sm font-semibold transition-all disabled:opacity-60 active:translate-y-px";

type ButtonVariant = "primary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-text-on hover:bg-accent-hover",
  ghost: "border-[1.5px] border-border font-medium hover:bg-bg-muted",
  danger: "border-[1.5px] border-danger/40 font-medium text-danger hover:bg-danger-bg",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${buttonBase} ${buttonVariants[variant]} ${extra}`;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-bg-muted ${className}`} />;
}

/** Shimmer blocks sized like the content they stand in for (design.md: no spinners). */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-[14px] bg-bg-muted text-text-muted">
        {icon}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="rounded-[var(--radius-input)] bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}

const STATUS_STYLE: Record<IssueStatus, string> = {
  TODO: "bg-status-todo-bg text-status-todo-fg",
  IN_PROGRESS: "bg-status-progress-bg text-status-progress-fg",
  IN_REVIEW: "bg-status-review-bg text-status-review-fg",
  DONE: "bg-status-done-bg text-status-done-fg",
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const statusLabel = (s: IssueStatus) => STATUS_LABEL[s];

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<IssuePriority, string> = {
  LOW: "bg-priority-low-bg text-priority-low-fg",
  MEDIUM: "bg-priority-medium-bg text-priority-medium-fg",
  HIGH: "bg-priority-high-bg text-priority-high-fg",
  URGENT: "bg-priority-urgent-bg text-priority-urgent-fg",
};

export const priorityLabel = (p: IssuePriority) => p.charAt(0) + p.slice(1).toLowerCase();

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>
      {priorityLabel(priority)}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-border px-2 py-0.5 text-xs text-text-muted">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-7 text-[0.65rem]" : "size-9 text-xs";
  return (
    <span
      aria-hidden="true"
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${dim}`}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
