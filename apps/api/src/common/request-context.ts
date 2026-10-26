import { UnauthorizedException } from "@nestjs/common";
import type { AuthedRequest } from "../auth/jwt-auth.guard";
import type { ProjectRequest, WorkspaceRequest } from "./authed-request";

/** JwtAuthGuard has already run; this narrows the optional field for the controller. */
export function requireUserId(req: AuthedRequest): string {
  if (!req.userId) throw new UnauthorizedException("Authentication required");
  return req.userId;
}

/** WorkspaceGuard has already run and resolved both fields. */
export function requireWorkspace(req: WorkspaceRequest): { workspaceId: string; role: NonNullable<WorkspaceRequest["workspaceRole"]> } {
  if (!req.workspaceId || !req.workspaceRole) throw new UnauthorizedException("Authentication required");
  return { workspaceId: req.workspaceId, role: req.workspaceRole };
}

/** ProjectAccessGuard / IssueAccessGuard have already resolved the project. */
export function requireProject(req: ProjectRequest): { projectId: string } {
  if (!req.projectId) throw new UnauthorizedException("Authentication required");
  return { projectId: req.projectId };
}
