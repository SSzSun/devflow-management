import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";
import { IssueAccessGuard } from "./issue-access.guard";

@Module({
  imports: [AuthModule, ProjectsModule], // ProjectsModule exports ProjectAccessGuard
  controllers: [IssuesController],
  providers: [IssuesService, IssueAccessGuard],
  exports: [IssueAccessGuard],
})
export class IssuesModule {}
