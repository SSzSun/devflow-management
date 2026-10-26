import { SetMetadata } from "@nestjs/common";
import type { ProjectRole } from "@devflow/shared";

export const PROJECT_ROLES_KEY = "requiredProjectRole";

/** Minimum *effective* project role for the route; ProjectAccessGuard ranks it. */
export const ProjectRoles = (role: ProjectRole) => SetMetadata(PROJECT_ROLES_KEY, role);
