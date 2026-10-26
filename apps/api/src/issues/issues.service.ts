import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { canTransition, type IssueStatus } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { CreateIssueDto } from "./dto/create-issue.dto";
import { UpdateIssueDto } from "./dto/update-issue.dto";
import { ListIssuesQueryDto } from "./dto/list-issues-query.dto";

/** Shape every issue response uses; `key` is derived from the project's key. */
const ISSUE_SELECT = {
  id: true,
  number: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  assigneeId: true,
  createdById: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
} as const;

export interface IssuePage {
  data: unknown[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, query: ListIssuesQueryDto): Promise<IssuePage> {
    const where = this.buildWhere(projectId, query);
    const orderBy = this.buildOrderBy(query);

    // One round trip for the page and its total: they must agree.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.issue.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: ISSUE_SELECT,
      }),
      this.prisma.issue.count({ where }),
    ]);

    return {
      data: rows,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        ...ISSUE_SELECT,
        project: { select: { id: true, key: true, name: true, workspaceId: true } },
      },
    });
    if (!issue || !issue.project) throw new NotFoundException("Issue not found");
    return issue;
  }

  async create(projectId: string, actorId: string, dto: CreateIssueDto) {
    await this.assertAssignable(projectId, dto.assigneeId);
    await this.assertLabelsBelongToProject(projectId, dto.labelIds);

    return this.prisma.$transaction(async (tx) => {
      // Atomic UPDATE ... RETURNING: concurrent creates serialize on this row
      // and each gets a distinct number, so no two issues can share a number.
      const counter = await tx.projectCounter.update({
        where: { projectId },
        data: { lastIssueNumber: { increment: 1 } },
        select: { lastIssueNumber: true },
      });

      const issue = await tx.issue.create({
        data: {
          projectId,
          number: counter.lastIssueNumber,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? "MEDIUM",
          assigneeId: dto.assigneeId,
          createdById: actorId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          labels: dto.labelIds?.length
            ? { create: dto.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
        select: ISSUE_SELECT,
      });

      // Written in the same transaction: a failed create leaves no activity row.
      await tx.activityLog.create({
        data: { issueId: issue.id, actorId, action: "created", toValue: issue.title },
      });

      return issue;
    });
  }

  async update(issueId: string, projectId: string, actorId: string, dto: UpdateIssueDto) {
    const current = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { title: true, description: true, priority: true, assigneeId: true, dueDate: true },
    });
    if (!current) throw new NotFoundException("Issue not found");

    await this.assertAssignable(projectId, dto.assigneeId);
    await this.assertLabelsBelongToProject(projectId, dto.labelIds);

    const activities: Prisma.ActivityLogCreateManyInput[] = [];
    const log = (action: string, from: string | null, to: string | null) => {
      if (from !== to) activities.push({ issueId, actorId, action, fromValue: from, toValue: to });
    };

    if (dto.title !== undefined) log("title_changed", current.title, dto.title);
    if (dto.description !== undefined) log("description_changed", current.description, dto.description);
    if (dto.priority !== undefined) log("priority_changed", current.priority, dto.priority);
    if (dto.assigneeId !== undefined) log("assignee_changed", current.assigneeId, dto.assigneeId);
    if (dto.dueDate !== undefined) {
      log("due_date_changed", current.dueDate?.toISOString() ?? null, dto.dueDate);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.labelIds !== undefined) {
        // Replace the set wholesale; simpler than diffing and idempotent.
        await tx.issueLabel.deleteMany({ where: { issueId } });
        if (dto.labelIds.length > 0) {
          await tx.issueLabel.createMany({
            data: dto.labelIds.map((labelId) => ({ issueId, labelId })),
            skipDuplicates: true,
          });
        }
        activities.push({ issueId, actorId, action: "labels_changed", fromValue: null, toValue: null });
      }

      const issue = await tx.issue.update({
        where: { id: issueId },
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          assigneeId: dto.assigneeId,
          dueDate: dto.dueDate === undefined ? undefined : dto.dueDate === null ? null : new Date(dto.dueDate),
        },
        select: ISSUE_SELECT,
      });

      if (activities.length > 0) await tx.activityLog.createMany({ data: activities });
      return issue;
    });
  }

  /**
   * The only way to change status. Rejects transitions outside the workflow map
   * and writes the activity row in the same transaction as the update.
   */
  async changeStatus(issueId: string, actorId: string, next: IssueStatus) {
    const current = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException("Issue not found");

    if (!canTransition(current.status, next)) {
      throw new BadRequestException(`Cannot move an issue from ${current.status} to ${next}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.issue.update({
        where: { id: issueId },
        data: { status: next },
        select: ISSUE_SELECT,
      });
      await tx.activityLog.create({
        data: { issueId, actorId, action: "status_changed", fromValue: current.status, toValue: next },
      });
      return issue;
    });
  }

  /** Soft delete: the issue disappears from the API, its history stays in the DB. */
  async remove(issueId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.issue.update({ where: { id: issueId }, data: { deletedAt: new Date() } });
      await tx.activityLog.create({
        data: { issueId, actorId, action: "deleted", fromValue: null, toValue: null },
      });
    });
    return { success: true };
  }

  async listActivities(issueId: string, limit: number) {
    return this.prisma.activityLog.findMany({
      where: { issueId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        fromValue: true,
        toValue: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  private buildWhere(projectId: string, q: ListIssuesQueryDto): Prisma.IssueWhereInput {
    return {
      projectId,
      deletedAt: null,
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(q.priority?.length ? { priority: { in: q.priority } } : {}),
      ...(q.assigneeId === "unassigned"
        ? { assigneeId: null }
        : q.assigneeId
          ? { assigneeId: q.assigneeId }
          : {}),
      ...(q.labelIds?.length ? { labels: { some: { labelId: { in: q.labelIds } } } } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { description: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  private buildOrderBy(q: ListIssuesQueryDto): Prisma.IssueOrderByWithRelationInput {
    // sortBy is allowlisted by the DTO, so only real column names arrive here.
    const field = q.sortBy ?? "updatedAt";
    return { [field]: q.sortOrder ?? "desc" };
  }

  /** An assignee must be someone who can actually see the project. */
  private async assertAssignable(projectId: string, assigneeId: string | null | undefined) {
    if (assigneeId === undefined || assigneeId === null) return;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const [projectMember, workspaceMember] = await Promise.all([
      this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: assigneeId } },
        select: { userId: true },
      }),
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: assigneeId } },
        select: { role: true },
      }),
    ]);

    // Workspace admins inherit access without a ProjectMember row.
    const isWorkspaceAdmin = workspaceMember?.role === "OWNER" || workspaceMember?.role === "ADMIN";
    if (!projectMember && !isWorkspaceAdmin) {
      throw new BadRequestException("Assignee is not a member of this project");
    }
  }

  private async assertLabelsBelongToProject(projectId: string, labelIds: string[] | undefined) {
    if (!labelIds?.length) return;
    const found = await this.prisma.label.count({ where: { projectId, id: { in: labelIds } } });
    if (found !== new Set(labelIds).size) {
      throw new BadRequestException("One or more labels do not belong to this project");
    }
  }
}
