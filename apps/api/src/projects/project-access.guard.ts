import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasProjectRole, hasWorkspaceRole, type ProjectRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { PROJECT_ROLES_KEY } from "../common/project-roles.decorator";
import type { ProjectRequest } from "../common/authed-request";

/**
 * Resolves the caller's *effective* project role and enforces @ProjectRoles().
 * Must run after JwtAuthGuard.
 *
 * Workspace OWNER/ADMIN inherit project ADMIN — they administer every project in
 * their workspace without a ProjectMember row. A workspace MEMBER only sees
 * projects they were added to, at whatever ProjectMember role they hold.
 *
 * Every failure is 404: telling a non-member "forbidden" would confirm the
 * project exists, and issue/project ids are guessable in URLs.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ProjectRequest>();
    const userId = req.userId;
    if (!userId) throw new ForbiddenException("Project access required");

    const projectId = req.params.projectId;
    if (typeof projectId !== "string" || !projectId) throw new NotFoundException("Project not found");

    // Project → workspace is needed for the membership check, so one join query
    // resolves both the project and the caller's workspace role.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        workspaceId: true,
        workspace: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
        members: { where: { userId }, select: { role: true } },
      },
    });
    if (!project) throw new NotFoundException("Project not found");

    const workspaceRole = project.workspace.members[0]?.role;
    if (!workspaceRole) throw new NotFoundException("Project not found");

    let effective: ProjectRole;
    if (hasWorkspaceRole(workspaceRole, "ADMIN")) {
      effective = "ADMIN";
    } else {
      const membership = project.members[0]?.role;
      if (!membership) throw new NotFoundException("Project not found");
      effective = membership;
    }

    req.projectId = project.id;
    req.workspaceId = project.workspaceId;
    req.workspaceRole = workspaceRole;
    req.projectRole = effective;

    const required = this.reflector.getAllAndOverride<ProjectRole | undefined>(PROJECT_ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Insufficient role inside an accessible project is a true 403: the caller
    // already knows it exists.
    if (required && !hasProjectRole(effective, required)) {
      throw new ForbiddenException("Insufficient project role");
    }
    return true;
  }
}
