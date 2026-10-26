import { IsIn } from "class-validator";
import { ISSUE_STATUSES, type IssueStatus } from "@devflow/shared";

export class UpdateIssueStatusDto {
  @IsIn(ISSUE_STATUSES)
  status!: IssueStatus;
}
