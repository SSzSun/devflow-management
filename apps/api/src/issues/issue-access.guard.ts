import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasProjectRole, type ProjectRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { PROJECT_ROLES_KEY } from "../common/project-roles.decorator";
import { resolveProjectAccess } from "../common/project-access";
import type { IssueRequest } from "../common/authed-request";

/**
 * Resolves the issue from the route, then its project, then the caller's
 * effective project role, and enforces @ProjectRoles(). Must run after
 * JwtAuthGuard.
 *
 * Subclasses only say how to find the issue id; the authorization tail is shared
 * so a comment route cannot drift from an issue route.
 */
@Injectable()
export abstract class IssueScopedGuard implements CanActivate {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly reflector: Reflector,
  ) {}

  /** Route param holding the issue id, or a lookup for :commentId-style routes. */
  protected abstract resolveIssueId(ctx: ExecutionContext): Promise<string | null>;

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<IssueRequest>();
    const userId = req.userId;
    if (!userId) throw new ForbiddenException("Issue access required");

    const issueId = await this.resolveIssueId(ctx);
    if (!issueId) throw new NotFoundException("Issue not found");

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, deletedAt: true },
    });
    // Soft-deleted issues are absent as far as the API is concerned.
    if (!issue || issue.deletedAt) throw new NotFoundException("Issue not found");

    const access = await resolveProjectAccess(this.prisma, issue.projectId, userId);
    if (!access) throw new NotFoundException("Issue not found");

    req.issueId = issue.id;
    req.projectId = access.projectId;
    req.workspaceId = access.workspaceId;
    req.workspaceRole = access.workspaceRole;
    req.projectRole = access.projectRole;

    const required = this.reflector.getAllAndOverride<ProjectRole | undefined>(PROJECT_ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !hasProjectRole(access.projectRole, required)) {
      throw new ForbiddenException("Insufficient project role");
    }
    return true;
  }
}

/** Guard for routes that carry :issueId directly. */
@Injectable()
export class IssueAccessGuard extends IssueScopedGuard {
  protected resolveIssueId(ctx: ExecutionContext): Promise<string | null> {
    const id = ctx.switchToHttp().getRequest<IssueRequest>().params.issueId;
    return Promise.resolve(typeof id === "string" && id ? id : null);
  }
}
