import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { requireProject, requireUserId } from "../common/request-context";
import { ProjectRoles } from "../common/project-roles.decorator";
import type { IssueRequest, ProjectRequest } from "../common/authed-request";
import { ProjectAccessGuard } from "../projects/project-access.guard";
import { IssueAccessGuard } from "./issue-access.guard";
import { IssuesService } from "./issues.service";
import { CreateIssueDto } from "./dto/create-issue.dto";
import { UpdateIssueDto } from "./dto/update-issue.dto";
import { UpdateIssueStatusDto } from "./dto/update-issue-status.dto";
import { ListIssuesQueryDto } from "./dto/list-issues-query.dto";

class ActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

@Controller()
@ApiTags("issues")
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  // VIEWER may read; everything that writes needs MEMBER or above.
  @Get("projects/:projectId/issues")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("VIEWER")
  list(@Param("projectId") projectId: string, @Query() query: ListIssuesQueryDto) {
    return this.issues.list(projectId, query);
  }

  @Post("projects/:projectId/issues")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("MEMBER")
  create(@Req() req: ProjectRequest, @Body() dto: CreateIssueDto) {
    const { projectId } = requireProject(req);
    return this.issues.create(projectId, requireUserId(req), dto);
  }

  @Get("issues/:issueId")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("VIEWER")
  findOne(@Param("issueId") issueId: string) {
    return this.issues.findOne(issueId);
  }

  @Patch("issues/:issueId")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("MEMBER")
  update(@Req() req: IssueRequest, @Param("issueId") issueId: string, @Body() dto: UpdateIssueDto) {
    const { projectId } = requireProject(req);
    return this.issues.update(issueId, projectId, requireUserId(req), dto);
  }

  /** The only status path — the general update DTO has no status field. */
  @Patch("issues/:issueId/status")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("MEMBER")
  changeStatus(@Req() req: IssueRequest, @Param("issueId") issueId: string, @Body() dto: UpdateIssueStatusDto) {
    return this.issues.changeStatus(issueId, requireUserId(req), dto.status);
  }

  @Delete("issues/:issueId")
  @HttpCode(200)
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("MEMBER")
  remove(@Req() req: IssueRequest, @Param("issueId") issueId: string) {
    return this.issues.remove(issueId, requireUserId(req));
  }

  @Get("issues/:issueId/activities")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("VIEWER")
  activities(@Param("issueId") issueId: string, @Query() query: ActivityQueryDto) {
    return this.issues.listActivities(issueId, query.limit);
  }
}
