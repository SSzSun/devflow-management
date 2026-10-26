import { IsEmail, IsIn } from "class-validator";
import { ASSIGNABLE_WORKSPACE_ROLES, type AssignableWorkspaceRole } from "@devflow/shared";

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(ASSIGNABLE_WORKSPACE_ROLES)
  role!: AssignableWorkspaceRole;
}
