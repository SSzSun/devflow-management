import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ISSUE_PRIORITIES, type IssuePriority } from "@devflow/shared";

/**
 * Deliberately has no `status` field: workflow changes go through
 * PATCH /issues/:id/status, which validates the transition. With
 * forbidNonWhitelisted a client sending `status` here gets a 400.
 */
export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsIn(ISSUE_PRIORITIES)
  priority?: IssuePriority;

  /** null unassigns; an id must reference a member of the project. */
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  labelIds?: string[];
}
