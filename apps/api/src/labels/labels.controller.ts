import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProjectRoles } from "../common/project-roles.decorator";
import { ProjectAccessGuard } from "../projects/project-access.guard";
import { LabelAccessGuard } from "./label-access.guard";
import { LabelsService } from "./labels.service";
import { CreateLabelDto } from "./dto/create-label.dto";
import { UpdateLabelDto } from "./dto/update-label.dto";

@Controller()
@ApiTags("labels")
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get("projects/:projectId/labels")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("VIEWER")
  list(@Param("projectId") projectId: string) {
    return this.labels.list(projectId);
  }

  @Post("projects/:projectId/labels")
  @UseGuards(ProjectAccessGuard)
  @ProjectRoles("MEMBER")
  create(@Param("projectId") projectId: string, @Body() dto: CreateLabelDto) {
    return this.labels.create(projectId, dto);
  }

  @Patch("labels/:labelId")
  @UseGuards(LabelAccessGuard)
  @ProjectRoles("MEMBER")
  update(@Param("labelId") labelId: string, @Body() dto: UpdateLabelDto) {
    return this.labels.update(labelId, dto);
  }

  @Delete("labels/:labelId")
  @HttpCode(200)
  @UseGuards(LabelAccessGuard)
  @ProjectRoles("ADMIN")
  remove(@Param("labelId") labelId: string) {
    return this.labels.remove(labelId);
  }
}
