import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasProjectRole, type ProjectRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { PROJECT_ROLES_KEY } from "../common/project-roles.decorator";
import { resolveProjectAccess } from "../common/project-access";
import type { IssueRequest } from "../common/authed-request";

/**
 * Resolves :issueId → its project → the caller's effective project role, then
 * enforces @ProjectRoles(). Must run after JwtAuthGuard.
 *
 * Deleted (soft-deleted) issues are treated as absent: 404.
 */
@Injectable()
export class IssueAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<IssueRequest>();
    const userId = req.userId;
    if (!userId) throw new ForbiddenException("Issue access required");

    const issueId = req.params.issueId;
    if (typeof issueId !== "string" || !issueId) throw new NotFoundException("Issue not found");

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, deletedAt: true },
    });
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
