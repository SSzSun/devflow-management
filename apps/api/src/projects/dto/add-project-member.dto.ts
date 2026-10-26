import { IsEmail, IsIn } from "class-validator";
import { PROJECT_ROLES, type ProjectRole } from "@devflow/shared";

export class AddProjectMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(PROJECT_ROLES)
  role!: ProjectRole;
}
