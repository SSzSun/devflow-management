import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { ProjectAccessGuard } from "./project-access.guard";

@Module({
  imports: [AuthModule, WorkspacesModule], // reuses the exported WorkspaceGuard
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectAccessGuard],
  exports: [ProjectAccessGuard],
})
export class ProjectsModule {}
