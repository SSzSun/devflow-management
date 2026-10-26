import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, type AuthedRequest } from "../auth/jwt-auth.guard";
import { requireUserId, requireWorkspace } from "../common/request-context";
import { Roles } from "../common/roles.decorator";
import { WorkspaceGuard } from "./workspace.guard";
import type { WorkspaceRequest } from "../common/authed-request";
import { WorkspacesService } from "./workspaces.service";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";

@Controller("workspaces")
@ApiTags("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.workspaces.listForUser(requireUserId(req));
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(requireUserId(req), dto);
  }

  // WorkspaceGuard resolves :workspaceId → 404 for non-members before these run.
  @Get(":workspaceId")
  @UseGuards(WorkspaceGuard)
  async findOne(@Req() req: WorkspaceRequest, @Param("workspaceId") workspaceId: string) {
    // role lets the UI hide actions the API would reject anyway.
    const { role } = requireWorkspace(req);
    return { ...(await this.workspaces.findForMember(workspaceId)), role };
  }

  @Patch(":workspaceId")
  @UseGuards(WorkspaceGuard)
  @Roles("ADMIN")
  update(@Param("workspaceId") workspaceId: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(workspaceId, dto);
  }

  @Get(":workspaceId/members")
  @UseGuards(WorkspaceGuard)
  listMembers(@Param("workspaceId") workspaceId: string) {
    return this.workspaces.listMembers(workspaceId);
  }

  @Post(":workspaceId/members")
  @UseGuards(WorkspaceGuard)
  @Roles("ADMIN")
  addMember(@Param("workspaceId") workspaceId: string, @Body() dto: AddMemberDto) {
    return this.workspaces.addMember(workspaceId, dto);
  }

  @Patch(":workspaceId/members/:userId")
  @UseGuards(WorkspaceGuard)
  @Roles("ADMIN")
  updateMember(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.workspaces.updateMemberRole(workspaceId, userId, dto);
  }

  @Delete(":workspaceId/members/:userId")
  @HttpCode(200)
  @UseGuards(WorkspaceGuard)
  @Roles("ADMIN")
  removeMember(@Param("workspaceId") workspaceId: string, @Param("userId") userId: string) {
    return this.workspaces.removeMember(workspaceId, userId);
  }
}
