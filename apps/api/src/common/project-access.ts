import { hasWorkspaceRole, type ProjectRole, type WorkspaceRole } from "@devflow/shared";
import type { PrismaService } from "../prisma.service";

export interface EffectiveProjectAccess {
  projectId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  projectRole: ProjectRole;
  archived: boolean;
}

/**
 * The single definition of "what may this user do in this project":
 * workspace OWNER/ADMIN inherit project ADMIN; a workspace MEMBER gets the
 * ProjectMember role they hold, and nothing if they hold none.
 *
 * Returns null when the user has no access at all — callers turn that into 404
 * so a project's existence is never confirmed to an outsider.
 */
export async function resolveProjectAccess(
  prisma: PrismaService,
  projectId: string,
  userId: string,
): Promise<EffectiveProjectAccess | null> {
  // One query resolves the project, the caller's workspace role and their
  // project membership, so this never becomes a per-guard N+1.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      archivedAt: true,
      workspace: { select: { members: { where: { userId }, select: { role: true } } } },
      members: { where: { userId }, select: { role: true } },
    },
  });
  if (!project) return null;

  const workspaceRole = project.workspace.members[0]?.role;
  if (!workspaceRole) return null;

  if (hasWorkspaceRole(workspaceRole, "ADMIN")) {
    return {
      projectId: project.id,
      workspaceId: project.workspaceId,
      workspaceRole,
      projectRole: "ADMIN",
      archived: project.archivedAt !== null,
    };
  }

  const membership = project.members[0]?.role;
  if (!membership) return null;

  return {
    projectId: project.id,
    workspaceId: project.workspaceId,
    workspaceRole,
    projectRole: membership,
    archived: project.archivedAt !== null,
  };
}
