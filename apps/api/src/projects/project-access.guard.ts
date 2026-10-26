import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasProjectRole, type ProjectRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { PROJECT_ROLES_KEY } from "../common/project-roles.decorator";
import { resolveProjectAccess } from "../common/project-access";
import type { ProjectRequest } from "../common/authed-request";

/**
 * Resolves the caller's effective project role and enforces @ProjectRoles().
 * Must run after JwtAuthGuard.
 *
 * No access at all is 404 (do not confirm the project exists); an insufficient
 * role inside a project the caller can already see is a true 403.
 *
 * Subclasses only say how to find the project id, so a route keyed by another
 * id (a label, say) still gets exactly the same authorization.
 */
@Injectable()
export abstract class ProjectScopedGuard implements CanActivate {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly reflector: Reflector,
  ) {}

  /** Route param holding the project id, or a lookup for :labelId-style routes. */
  protected abstract resolveProjectId(ctx: ExecutionContext): Promise<string | null>;

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ProjectRequest>();
    const userId = req.userId;
    if (!userId) throw new ForbiddenException("Project access required");

    const projectId = await this.resolveProjectId(ctx);
    if (!projectId) throw new NotFoundException("Project not found");

    const access = await resolveProjectAccess(this.prisma, projectId, userId);
    if (!access) throw new NotFoundException("Project not found");

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

/** Guard for routes that carry :projectId directly. */
@Injectable()
export class ProjectAccessGuard extends ProjectScopedGuard {
  protected resolveProjectId(ctx: ExecutionContext): Promise<string | null> {
    const id = ctx.switchToHttp().getRequest<ProjectRequest>().params.projectId;
    return Promise.resolve(typeof id === "string" && id ? id : null);
  }
}
