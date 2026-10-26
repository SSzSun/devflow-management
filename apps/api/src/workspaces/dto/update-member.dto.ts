import { IsIn } from "class-validator";
import { ASSIGNABLE_WORKSPACE_ROLES, type AssignableWorkspaceRole } from "@devflow/shared";

export class UpdateMemberDto {
  @IsIn(ASSIGNABLE_WORKSPACE_ROLES)
  role!: AssignableWorkspaceRole;
}
