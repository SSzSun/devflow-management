import { SetMetadata } from "@nestjs/common";
import type { WorkspaceRole } from "@devflow/shared";

export const ROLES_KEY = "requiredWorkspaceRole";

/** Minimum workspace role for the route; WorkspaceGuard ranks the caller's actual role. */
export const Roles = (role: WorkspaceRole) => SetMetadata(ROLES_KEY, role);
