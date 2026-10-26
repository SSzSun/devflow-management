import { Transform, Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import {
  ISSUE_PRIORITIES,
  ISSUE_SORT_FIELDS,
  ISSUE_STATUSES,
  type IssuePriority,
  type IssueSortField,
  type IssueStatus,
} from "@devflow/shared";

/** `?labelIds=a,b` → ["a","b"]; an empty value means "no filter". */
const csv = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" && value.length > 0 ? value.split(",") : undefined;

export class ListIssuesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(ISSUE_STATUSES, { each: true })
  status?: IssueStatus[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(ISSUE_PRIORITIES, { each: true })
  priority?: IssuePriority[];

  /** `unassigned` matches issues with no assignee. */
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];

  // Allowlisted so a client value never reaches the ORDER BY clause unchecked.
  @IsOptional()
  @IsIn(ISSUE_SORT_FIELDS)
  sortBy?: IssueSortField;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
