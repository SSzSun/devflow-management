import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasWorkspaceRole, type WorkspaceRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { ROLES_KEY } from "../common/roles.decorator";
import type { WorkspaceRequest } from "../common/authed-request";

/**
 * Resolves the caller's membership for :workspaceId and enforces the minimum role
 * from @Roles(). Must run after JwtAuthGuard.
 *
 * Non-members get 404, not 403: a 403 would confirm the workspace exists.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<WorkspaceRequest>();
    const userId = req.userId;
    if (!userId) throw new ForbiddenException("Workspace membership required");

    const workspaceId = req.params.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      throw new NotFoundException("Workspace not found");
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!member) throw new NotFoundException("Workspace not found");

    req.workspaceId = workspaceId;
    req.workspaceRole = member.role;

    const required = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !hasWorkspaceRole(member.role, required)) {
      throw new ForbiddenException("Insufficient workspace role");
    }
    return true;
  }
}
