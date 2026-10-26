import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";
import { WorkspaceGuard } from "./workspace.guard";

@Module({
  imports: [AuthModule], // JwtAuthGuard + JwtModule
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceGuard],
  exports: [WorkspaceGuard],
})
export class WorkspacesModule {}
