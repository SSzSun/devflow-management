import { IsIn } from "class-validator";
import { PROJECT_ROLES, type ProjectRole } from "@devflow/shared";

export class UpdateProjectMemberDto {
  @IsIn(PROJECT_ROLES)
  role!: ProjectRole;
}
