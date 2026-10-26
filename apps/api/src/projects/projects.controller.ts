import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { hasWorkspaceRole } from "@devflow/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { requireUserId, requireWorkspace } from "../common/request-context";
import { Roles } from "../common/roles.decorator";
import { ProjectRoles } from "../common/project-roles.decorator";
import type { ProjectRequest, WorkspaceRequest } from "../common/authed-request";
import { WorkspaceGuard } from "../workspaces/workspace.guard";
import { ProjectsService } from "./projects.service";
import { ProjectAccessGuard } from "./project-access.guard";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { UpdateProjectMemberDto } from "./dto/update-project-member.dto";

@Controller()
@ApiTags("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get("workspaces/:workspaceId/projects")
  @UseGuards(WorkspaceGuard)
  list(@Req() req: WorkspaceRequest, @Query("includeArchived") includeArchived?: string) {
    const { workspaceId, role } = requireWorkspace(req);
    // Workspace admins see all projects; members see only theirs.
    return this.projects.listForWorkspace(
      workspaceId,
      requireUserId(req),
      hasWorkspaceRole(role, "ADMIN"),
      includeArchived === "true",
    );
  }

  @Post("workspaces/:workspaceId/projects")
  @UseGuards(WorkspaceGuard)
  @Roles("ADMIN")
  create(@Req() req: WorkspaceRequest, @Body() dto: CreateProjectDto) {
    const { workspaceId } = requireWorkspace(req);
    return this.projects.create(workspaceId, requireUserId(req), dto);
  }

  @Get("projects/:projectId")
  @UseGuards(ProjectAccessGuard)
  findOne(@Param("projectId") projectId: string) {
    return this.projects.findOne(projectId);
  }

  @Patch("projects/:projectId")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  update(@Param("projectId") projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(projectId, dto);
  }

  /** Archives the project. DELETE never destroys issues or activity history. */
  @Delete("projects/:projectId")
  @HttpCode(200)
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  archive(@Param("projectId") projectId: string) {
    return this.projects.archive(projectId);
  }

  @Post("projects/:projectId/restore")
  @HttpCode(200)
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  restore(@Param("projectId") projectId: string) {
    return this.projects.restore(projectId);
  }

  @Get("projects/:projectId/members")
  @UseGuards(ProjectAccessGuard)
  listMembers(@Param("projectId") projectId: string) {
    return this.projects.listMembers(projectId);
  }

  @Post("projects/:projectId/members")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  addMember(@Req() req: ProjectRequest, @Param("projectId") projectId: string, @Body() dto: AddProjectMemberDto) {
    const workspaceId = req.workspaceId;
    if (!workspaceId) throw new Error("unreachable: ProjectAccessGuard ran");
    return this.projects.addMember(projectId, workspaceId, dto);
  }

  @Patch("projects/:projectId/members/:userId")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  updateMember(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    return this.projects.updateMemberRole(projectId, userId, dto);
  }

  @Delete("projects/:projectId/members/:userId")
  @HttpCode(200)
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("ADMIN")
  removeMember(@Param("projectId") projectId: string, @Param("userId") userId: string) {
    return this.projects.removeMember(projectId, userId);
  }
}
