import type { AuthedRequest } from "../auth/jwt-auth.guard";
import type { WorkspaceRole } from "@devflow/shared";

export interface WorkspaceRequest extends AuthedRequest {
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
}
