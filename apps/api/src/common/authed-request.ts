import type { AuthedRequest } from "../auth/jwt-auth.guard";
import type { ProjectRole, WorkspaceRole } from "@devflow/shared";

export interface WorkspaceRequest extends AuthedRequest {
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
}

export interface ProjectRequest extends WorkspaceRequest {
  projectId?: string;
  /** Workspace admins inherit project ADMIN; others get their ProjectMember role. */
  projectRole?: ProjectRole;
}
